import "server-only";
import type { BstockTradeRecord } from "@prisma/client";
import { createPublicClient, decodeEventLog, erc20Abi, http, parseUnits, type Hash } from "viem";
import { bsc } from "viem/chains";
import { prisma } from "@/lib/prisma";
import type { AgentSessionState } from "@/lib/bstock-agentic-wallet-auth";
import { agentWalletOwnerKey, agentWalletRequest } from "@/lib/bstock-agentic-wallet-client";
import { normalizeAgenticWalletMarketOrders, type AgenticWalletMarketOrder } from "@/lib/bstock-agentic-wallet-order-status";

// Upstream may add non-terminal states (PROCESSING, QUEUED, etc.). Only these
// explicit terminal aliases are safe to exclude. Quotes have their own TTL rule.
export const MANUAL_NON_PENDING_STATUSES = ["INTENT_CREATED", "FINISHED", "SUCCESS", "SUCCEEDED", "COMPLETED", "CONFIRMED", "FILLED",
  "FAILED", "FAILURE", "REJECTED", "CANCELED", "CANCELLED", "EXPIRED"];
const FAILED = new Set(["FAILED", "FAILURE", "REJECTED", "CANCELED", "CANCELLED", "EXPIRED"]);
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const HASH = /^0x[a-fA-F0-9]{64}$/;
const NATIVE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const ENDPOINT = "/bapi/defi/v1/public/wallet-direct/web-dex/agent/batch-query-market-orders";
const chain = createPublicClient({ chain: bsc, transport: http(process.env.BSC_RPC_URL || "https://bsc-dataseed1.binance.org", { timeout: 2_500, retryCount: 0 }) });
type PendingRecord = BstockTradeRecord & { pendingTotal: string };
type Evidence = { record: PendingRecord; status: "FINISHED" | "FAILED"; txHash: string | null };
class LookupUnavailable extends Error {}

// Only read operations are raced. Timed-out reads can never cause a late write.
async function boundedRead<T>(operation: () => Promise<T>, deadline: number): Promise<T> {
  const remaining = Math.min(3_000, deadline - Date.now());
  if (remaining <= 0) throw new LookupUnavailable("RECONCILIATION_BUDGET_EXHAUSTED");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new LookupUnavailable("RECONCILIATION_LOOKUP_TIMEOUT")), remaining);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

function assertOwner(state: AgentSessionState, ownerKey: string) {
  if (state.stage !== "connected" || !state.walletAddress || !ADDRESS.test(state.walletAddress)
    || agentWalletOwnerKey(state.walletAddress) !== ownerKey || !Number.isFinite(state.sessionExpireAt)
    || state.sessionExpireAt <= Date.now()) throw new Error("手动订单核对的钱包身份或授权已变化，请重新登录。");
}

function directionMatches(record: PendingRecord, order: AgenticWalletMarketOrder) {
  return (!order.fromToken || order.fromToken.toLowerCase() === record.fromToken.toLowerCase())
    && (!order.toToken || order.toToken.toLowerCase() === record.toToken.toLowerCase());
}

function exactMatch(record: PendingRecord, rows: AgenticWalletMarketOrder[]) {
  // Never infer identity from similar amounts, timestamps, ticker or client input.
  return (record.orderId ? rows.find(row => row.orderId === record.orderId) : undefined)
    || (record.txHash && HASH.test(record.txHash)
      ? rows.find(row => row.txHash?.toLowerCase() === record.txHash!.toLowerCase()) : undefined);
}

async function confirmedReceipt(hash: string, deadline: number) {
  const [receipt, block] = await boundedRead(() => Promise.all([
    chain.getTransactionReceipt({ hash: hash as Hash }), chain.getBlockNumber({ cacheTime: 0 })
  ]), deadline);
  if (receipt.transactionHash.toLowerCase() !== hash.toLowerCase() || block < receipt.blockNumber + 1n) return null;
  return receipt;
}

async function proveSuccess(record: PendingRecord, hash: string, walletAddress: string, deadline: number,
  receipt: Awaited<ReturnType<typeof confirmedReceipt>>) {
  if (!HASH.test(hash) || !ADDRESS.test(record.fromToken) || !ADDRESS.test(record.toToken)
    || record.fromToken.toLowerCase() === record.toToken.toLowerCase()) return false;
  if (!receipt || receipt.status !== "success") return false;
  const wallet = walletAddress.toLowerCase();
  const tokens = [record.fromToken.toLowerCase(), record.toToken.toLowerCase()];
  // Native output needs internal-call traces. A receipt/quote is not proof of it.
  if (tokens[1] === NATIVE) return false;
  const net = [0n, 0n];
  for (const log of receipt.logs) {
    const index = tokens.indexOf(log.address.toLowerCase());
    if (index < 0) continue;
    try {
      const event = decodeEventLog({ abi: erc20Abi, eventName: "Transfer", data: log.data, topics: log.topics });
      if (event.args.to.toLowerCase() === wallet) net[index] += event.args.value;
      if (event.args.from.toLowerCase() === wallet) net[index] -= event.args.value;
    } catch { /* Non-Transfer logs cannot prove a fill. */ }
  }
  if (net[1] <= 0n) return false;
  if (tokens[0] !== NATIVE) return net[0] < 0n;
  if (!/^\d+(?:\.\d{1,18})?$/.test(record.requestedAmount)) return false;
  const transaction = await boundedRead(() => chain.getTransaction({ hash: hash as Hash }), deadline);
  return transaction.hash.toLowerCase() === hash.toLowerCase()
    && transaction.from.toLowerCase() === wallet && transaction.blockHash === receipt.blockHash
    && transaction.value > 0n && transaction.value === parseUnits(record.requestedAmount, 18);
}

/**
 * Repair stale manual audit states, never submit/cancel/replay an order.
 * All RPC reads precede one short owner-locked write. `remaining` describes the
 * initial snapshot; the start handler must recheck pending orders under its lock.
 * Missing IDs, unmatched parent/child IDs, native outputs and unavailable proof
 * intentionally remain unresolved. No age-based finalization is performed.
 */
export async function reconcileBstockManualOrders(initialState: AgentSessionState, ownerKey: string, options: { onlyBlocking?: boolean } = {}) {
  assertOwner(initialState, ownerKey);
  let state = initialState;
  const startedAt = Date.now();
  const readDeadline = startedAt + 27_000; // Leaves room for a <=3 s DB transaction.
  let lookupFailed = false;
  let reconciled = 0;
  let remaining = 0;
  let examined = 0;
  let requests = 0;
  const evidence = new Map<string, Evidence>();
  try {
    // There is deliberately no ORM relation from the historical trade table to
    // automatic orders. NOT EXISTS excludes every linked record, not only a page.
    const records = await boundedRead(() => prisma.$queryRaw<PendingRecord[]>`
      SELECT t.*, COUNT(*) OVER()::text AS "pendingTotal"
      FROM "bstock_trade_records" t
      WHERE t."ownerKey" = ${ownerKey}
        AND (${options.onlyBlocking === true} = false OR t."automationIgnoredAt" IS NULL)
        AND t.status NOT IN ('INTENT_CREATED', 'FINISHED', 'SUCCESS', 'SUCCEEDED', 'COMPLETED', 'CONFIRMED', 'FILLED',
          'FAILED', 'FAILURE', 'REJECTED', 'CANCELED', 'CANCELLED', 'EXPIRED')
        AND NOT EXISTS (SELECT 1 FROM "bstock_auto_orders" a WHERE a."tradeRecordId" = t.id)
      ORDER BY t."createdAt" DESC, t.id DESC LIMIT 16
    `, readDeadline);
    const pendingTotal = records.length ? Number(records[0].pendingTotal) : 0;
    if (!Number.isSafeInteger(pendingTotal) || pendingTotal < records.length) throw new LookupUnavailable("INVALID_PENDING_COUNT");
    remaining = pendingTotal;
    examined = records.length;

    const consider = async (record: PendingRecord, order?: AgenticWalletMarketOrder) => {
      if (evidence.has(record.id)) return;
      if (order && !directionMatches(record, order)) return;
      if ((record.txHash && !HASH.test(record.txHash)) || (order?.txHash && !HASH.test(order.txHash))) return;
      const persistedHash = record.txHash && HASH.test(record.txHash) ? record.txHash.toLowerCase() : null;
      const offeredHash = order?.txHash && HASH.test(order.txHash) ? order.txHash.toLowerCase() : null;
      if (persistedHash && offeredHash && persistedHash !== offeredHash) return;
      const hash = offeredHash || persistedHash;
      const exactId = Boolean(record.orderId && order?.orderId === record.orderId);
      if (order && FAILED.has(String(order.status || "").trim().toUpperCase())) {
        // A failed history row matched only by hash cannot cancel another order.
        if (!exactId) return;
        if (hash) {
          const receipt = await confirmedReceipt(hash, readDeadline);
          if (!receipt || receipt.status !== "reverted") return;
        }
        evidence.set(record.id, { record, status: "FAILED", txHash: hash });
      } else if (hash) {
        const receipt = await confirmedReceipt(hash, readDeadline);
        // Browser submissions persist the same hash as both order ID and txHash.
        // A confirmed direct-wallet revert is final even without venue history;
        // a sponsored/relayer transaction cannot prove this failure's ownership.
        const exactBrowserHash = persistedHash === hash && record.orderId?.toLowerCase() === hash;
        if (exactBrowserHash && receipt?.status === "reverted"
          && receipt.from.toLowerCase() === initialState.walletAddress!.toLowerCase()) {
          evidence.set(record.id, { record, status: "FAILED", txHash: hash });
        } else if (await proveSuccess(record, hash, initialState.walletAddress!, readDeadline, receipt)) {
          evidence.set(record.id, { record, status: "FINISHED", txHash: hash });
        }
      }
    };

    const lookup = async (body: Record<string, unknown>) => {
      if (requests >= 8) throw new LookupUnavailable("RECONCILIATION_REQUEST_LIMIT");
      requests++;
      const result = await boundedRead(() => agentWalletRequest<unknown>(state, ENDPOINT, {
        body, timeoutMs: Math.min(3_000, Math.max(1, readDeadline - Date.now()))
      }), readDeadline);
      assertOwner(result.state, ownerKey);
      state = result.state;
      return normalizeAgenticWalletMarketOrders(result.data);
    };

    const needHistory: PendingRecord[] = [];
    for (const record of records) {
      if (Date.now() >= readDeadline) { lookupFailed = true; break; }
      try {
        if (record.txHash && HASH.test(record.txHash)) {
          await consider(record);
          if (evidence.has(record.id)) continue;
        }
        // Browser records use their transaction hash as orderId; no venue query.
        if (record.orderId && HASH.test(record.orderId)) {
          if (!record.txHash) await consider(record, { orderId: record.orderId, txHash: record.orderId });
          continue;
        }
        if (!record.orderId) continue;
        if (requests >= 4) { needHistory.push(record); continue; }
        const direct = await lookup({ orderId: record.orderId, page: 1, pageSize: 1 });
        const match = exactMatch(record, direct.rows);
        if (match) await consider(record, match);
        else needHistory.push(record);
      } catch { lookupFailed = true; needHistory.push(record); }
    }
    // Four pages can recover records absent from the first 100 rows. Exhaustion
    // is not evidence of failure and never authorizes clearing an unknown order.
    for (let page = 1; needHistory.length && page <= 4 && requests < 8; page++) {
      if (Date.now() >= readDeadline) { lookupFailed = true; break; }
      try {
        const history = await lookup({ binanceChainId: "56", page, pageSize: 100, sort: "DESC" });
        for (let index = needHistory.length - 1; index >= 0; index--) {
          const record = needHistory[index];
          const match = exactMatch(record, history.rows);
          if (!match) continue;
          await consider(record, match);
          needHistory.splice(index, 1);
        }
        // Array envelopes synthesize total=rows.length during normalization;
        // that is only this page's size, not the complete history count.
        const explicitTotal = !history.responseShape.endsWith("[]") ? history.total : null;
        if (history.rows.length < 100 || (explicitTotal != null && page * 100 >= explicitTotal)) break;
      } catch { lookupFailed = true; break; }
    }
    if (evidence.size) {
      // Conditional writes are monotonic. A concurrent status poll or auto link
      // takes precedence; receipt-derived automatic amounts are never touched.
      reconciled = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerKey}))::text`;
        let updated = 0;
        for (const item of evidence.values()) {
          if (await tx.bstockAutoOrder.findUnique({ where: { tradeRecordId: item.record.id }, select: { id: true } })) continue;
          const result = await tx.bstockTradeRecord.updateMany({
            where: { id: item.record.id, ownerKey, orderId: item.record.orderId, txHash: item.record.txHash,
              status: item.record.status },
            data: { status: item.status, ...(item.txHash ? { txHash: item.txHash } : {}), completedAt: new Date() }
          });
          updated += result.count;
        }
        return updated;
      }, { maxWait: 1_000, timeout: 3_000 });
      remaining = Math.max(0, remaining - reconciled);
    }
  } catch (error) {
    lookupFailed = true;
    // A database failure cannot be mistaken for an empty pending-order list.
    if (examined === 0) remaining = Math.max(remaining, 1);
  }
  console.info("[bstock:manual-reconcile]", { examined, reconciled, remaining, lookupFailed, requests, durationMs: Date.now() - startedAt });
  return { state, reconciled, remaining, lookupFailed };
}
