import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { start } from "workflow/api";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { connectedAgentSession, agentSessionKey, agentWalletOwnerKey, persistAgentSession, AgenticWalletRequestError } from "@/lib/bstock-agentic-wallet-client";
import { encodeAgentSession, isSameOrigin, noStoreHeaders, type AgentSessionState } from "@/lib/bstock-agentic-wallet-auth";
import { fetchAgentWalletData, walletSnapshotDto } from "@/lib/bstock-agentic-wallet-data";
import { requireBoundEvmBrowserWallet } from "@/lib/bstock-browser-wallet";
import { fetchOfficialBstockMarket, compareDecimals } from "@/lib/bstock-alpha-live";
import { AUTO_STRATEGY_SOURCES, AUTO_STRATEGY_VERSION, autoSettingsSchema } from "@/lib/bstock-auto-strategy";
import { AUTO_PENDING, autoEvent, jsonValue, pauseAuto, publicAutoConfig, safeAutoError, withAutoLock } from "@/lib/bstock-auto-data";
import { scanAutoCandidates } from "@/lib/bstock-auto-runtime";
import { bstockAutoWorkflow } from "@/lib/bstock-auto-workflow";
import { MANUAL_NON_PENDING_STATUSES, reconcileBstockManualOrders } from "@/lib/bstock-manual-order-reconciliation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

type Identity = { capability: "agentic" | "browser"; ownerKey: string; address: string; state?: AgentSessionState };
class ControlError extends Error {
  constructor(message: string, readonly status = 409, readonly code?: string, readonly details?: Record<string, unknown>) { super(message); }
}
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: noStoreHeaders() });
const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), settings: autoSettingsSchema, acknowledged: z.literal(true) }).strict(),
  z.object({ action: z.literal("stop") }).strict(),
  z.object({ action: z.literal("reconcile") }).strict(),
  z.object({ action: z.literal("ignore-manual"), scope: z.enum(["one", "all"]), recordId: z.string().min(1).max(128).optional(),
    reviewVersion: z.string().regex(/^[a-f0-9]{64}$/), acknowledged: z.literal(true) }).strict()
    .refine(value => value.scope === "one" ? Boolean(value.recordId) : value.recordId === undefined,
      { message: "单条忽略须指定订单，全部忽略不能指定单条订单。" }),
  z.object({ action: z.literal("scan") }).strict()
]);

// Keep the legacy 90-second quote safety window. A submitted/unknown order
// never expires merely because it is old: only verified terminal evidence clears it.
const pendingManualStatusFilter = { notIn: MANUAL_NON_PENDING_STATUSES };
function manualBlockerWhere(ownerKey: string, now = Date.now()) {
  return { ownerKey, automationIgnoredAt: null, OR: [
    { status: pendingManualStatusFilter },
    { status: "INTENT_CREATED", createdAt: { gt: new Date(now - 90_000) } }
  ] };
}
const manualReviewSelect = { id: true, ownerKey: true, intentHash: true, symbol: true, side: true, status: true,
  orderId: true, txHash: true, createdAt: true, submittedAt: true, fromToken: true, toToken: true,
  requestedAmount: true, quotedAmount: true } as const;
const reviewHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
// Do not hash updatedAt: harmless status polls refresh it. Bind the substantive
// identity and trade fields instead, and use those same fields for the final CAS.
const recordReviewVersion = (row: unknown) => reviewHash({ version: 1, record: row });
async function manualReview(database: Pick<typeof prisma, "bstockTradeRecord" | "bstockAutoOrder">, ownerKey: string) {
  const autoLinks = await database.bstockAutoOrder.findMany({ where: { ownerKey, tradeRecordId: { not: null } }, select: { tradeRecordId: true } });
  const autoIds = autoLinks.flatMap(row => row.tradeRecordId ? [row.tradeRecordId] : []);
  const where = { ...manualBlockerWhere(ownerKey), ...(autoIds.length ? { id: { notIn: autoIds } } : {}) };
  const [rows, count, pendingCount] = await Promise.all([
    database.bstockTradeRecord.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1001,
      select: manualReviewSelect }),
    database.bstockTradeRecord.count({ where }),
    database.bstockTradeRecord.count({ where: { ...where, status: pendingManualStatusFilter } })
  ]);
  const versions = rows.map(row => [row.id, recordReviewVersion(row)]).sort((a, b) => a[0].localeCompare(b[0]));
  return { records: rows, snapshot: { manualBlockerCount: count, manualPendingCount: pendingCount,
    manualIgnoreCount: pendingCount, manualIgnoreAllAvailable: count <= 1000 && rows.length === count,
    manualReviewVersion: reviewHash({ version: 1, ownerKey, count, records: versions }),
    manualBlockers: rows.slice(0, 10).map(row => ({ id: row.id, symbol: row.symbol, side: row.side,
      status: row.status, orderId: row.orderId, createdAt: row.createdAt,
      canIgnore: row.status !== "INTENT_CREATED", reviewVersion: recordReviewVersion(row),
      quoteValidUntil: row.status === "INTENT_CREATED" ? new Date(row.createdAt.getTime() + 90_000).toISOString() : null
    })) } };
}
async function manualBlockers(database: Pick<typeof prisma, "bstockTradeRecord" | "bstockAutoOrder">, ownerKey: string) {
  return (await manualReview(database, ownerKey)).snapshot;
}

async function identity(request: NextRequest): Promise<Identity | null> {
  // Explicit provider prevents an old Agent cookie from taking over a browser
  // wallet session or a disconnected UI. The address is never authorization.
  const provider = request.nextUrl.searchParams.get("provider");
  if (provider === "disconnected" || !provider) return null;
  if (provider === "browser") {
    const address = request.nextUrl.searchParams.get("address") || "";
    try {
      const verified = await requireBoundEvmBrowserWallet(address);
      return { capability: "browser", ownerKey: verified.ownerKey, address: verified.address };
    } catch { throw new ControlError("请先完成当前浏览器钱包的登录与所有权验证。", 401); }
  }
  if (provider !== "agent") throw new ControlError("不支持的钱包连接方式。", 400);
  let state = connectedAgentSession(request);
  if (!state.walletAddress) state = (await fetchAgentWalletData(state)).state;
  if (!state.walletAddress) throw new ControlError("钱包未返回可验证的 BSC 地址。", 401);
  return { capability: "agentic", ownerKey: agentWalletOwnerKey(state.walletAddress), address: state.walletAddress, state };
}

async function snapshot(owner: Identity) {
  const [config, events, positions, orders, blockers] = await Promise.all([
    prisma.bstockAutoConfig.findUnique({ where: { ownerKey: owner.ownerKey } }),
    prisma.bstockAutoEvent.findMany({ where: { ownerKey: owner.ownerKey }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.bstockAutoPosition.findMany({ where: { ownerKey: owner.ownerKey }, orderBy: { createdAt: "desc" } }),
    prisma.bstockAutoOrder.findMany({ where: { ownerKey: owner.ownerKey }, orderBy: { createdAt: "desc" }, take: 50 }),
    manualBlockers(prisma, owner.ownerKey)
  ]);
  return { ok: true, capability: owner.capability, config: publicAutoConfig(config), events,
    positions: positions.filter(p => Number(p.quantity) > 0).map(p => ({ symbol: p.symbol, quantity: p.quantity,
      costUsd: Number(p.costUsd), entryPrice: Number(p.costUsd) / Number(p.quantity), strategy: p.strategy })),
    orders, ...blockers, sources: AUTO_STRATEGY_SOURCES };
}

function failure(error: unknown) {
  if (error instanceof z.ZodError) return json({ ok: false, error: error.issues.map(i => i.message).join("；") }, 400);
  if (error instanceof ControlError) return json({ ok: false, error: error.message, ...(error.code ? { code: error.code } : {}), ...error.details }, error.status);
  if (error instanceof AgenticWalletRequestError) return json({ ok: false, error: error.message, code: error.code }, error.status);
  console.error("[bstock-automation]", safeAutoError(error));
  return json({ ok: false, error: "自动交易服务暂时不可用，请稍后刷新状态；不要重复开启。" }, 503);
}

export async function GET(request: NextRequest) {
  try {
    const owner = await identity(request);
    if (!owner) return json({ ok: true, capability: "disconnected", config: null, events: [], positions: [], orders: [] });
    const rate = await checkRateLimit(`bstock:auto:read:${owner.ownerKey}`, 120, 60_000);
    if (!rate.allowed) return json({ ok: false, error: "读取过于频繁，请稍后重试。" }, 429);
    const data = await snapshot(owner);
    if (request.nextUrl.searchParams.get("export") === "1") {
      // Each page is owner-scoped and resumable; never export session secrets.
      const cursor = request.nextUrl.searchParams.get("cursor") || undefined;
      const [events, orders] = await Promise.all([
        prisma.bstockAutoEvent.findMany({ where: { ownerKey: owner.ownerKey, ...(cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: "asc" }, take: 1001 }),
        prisma.bstockAutoOrder.findMany({ where: { ownerKey: owner.ownerKey }, orderBy: { createdAt: "desc" }, take: 1000 })
      ]);
      return json({ ...data, events: events.slice(0, 1000), orders, exportedAt: new Date().toISOString(),
        nextCursor: events.length > 1000 ? events[999].id : null,
        orderHistoryLimit: 1000, auditContainsOrderEvidence: true });
    }
    const response = json(data);
    return owner.state ? persistAgentSession(response, owner.state) : response;
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ ok: false, error: "自动交易设置仅允许从本站操作。" }, 403);
  let owner: Identity | null = null;
  let reconciliation: Awaited<ReturnType<typeof reconcileBstockManualOrders>> | undefined;
  let ignored: { count: number } | undefined;
  try {
    const input = inputSchema.parse(await request.json());
    owner = await identity(request);
    if (!owner) throw new ControlError("请先登录钱包。", 401);
    if (input.action === "stop") {
      // Stop is always available: no rate-limit or balance dependency. Orders
      // already claimed/broadcast continue to receipt reconciliation, never retry.
      await withAutoLock(owner.ownerKey, async tx => {
        const config = await tx.bstockAutoConfig.findUnique({ where: { ownerKey: owner!.ownerKey } });
        if (!config) return;
        await tx.bstockAutoConfig.update({ where: { ownerKey: owner!.ownerKey }, data: { enabled: false, status: "STOPPED", lastError: null } });
        await tx.bstockAutoEvent.create({ data: { ownerKey: owner!.ownerKey, generation: config.generation,
          kind: "STOPPED", status: "STOPPED", reason: "用户关闭自动交易：停止新订单，已提交订单继续核对，不自动清仓。" } });
      });
    } else {
      if (!owner.state || owner.capability !== "agentic") throw new ControlError("普通浏览器钱包需要逐笔确认；后台自动交易须使用 Agentic Wallet 扫码授权。", 403);
      const rate = await checkRateLimit(`bstock:auto:${input.action}:${owner.ownerKey}`, input.action === "scan" ? 2 : 5, 60_000);
      if (!rate.allowed) throw new ControlError("操作过于频繁，请稍后重试。", 429);
      if (input.action === "ignore-manual") {
        const key = owner.ownerKey;
        const reviewer = owner.address;
        ignored = await withAutoLock(key, async tx => {
          const review = await manualReview(tx, key);
          const changed = () => new ControlError("订单清单或状态已变化，请刷新后重新核对并确认忽略。", 409,
            "MANUAL_REVIEW_CHANGED", review.snapshot);
          let rows = review.records.filter(row => row.status !== "INTENT_CREATED");
          if (input.scope === "all") {
            if (!review.snapshot.manualIgnoreAllAvailable || input.reviewVersion !== review.snapshot.manualReviewVersion) throw changed();
          } else {
            // Single-row review is still usable beyond the bulk limit, provided
            // the row is in the currently displayed (bounded) pending snapshot.
            rows = rows.filter(row => row.id === input.recordId && recordReviewVersion(row) === input.reviewVersion);
          }
          if (!rows.length) throw changed();
          if (await tx.bstockAutoOrder.findFirst({ where: { tradeRecordId: { in: rows.map(row => row.id) } }, select: { id: true } })) throw changed();
          const now = new Date();
          const updated = await tx.bstockTradeRecord.updateMany({
            where: { ownerKey: key, automationIgnoredAt: null, OR: rows.map(row => ({ ...row })) },
            data: { automationIgnoredAt: now, automationIgnoredBy: reviewer }
          });
          if (updated.count !== rows.length) throw changed();
          await tx.bstockAutoEvent.create({ data: { ownerKey: key, kind: "MANUAL_ORDERS_IGNORED", status: "REVIEWED",
            reason: "用户已自行核对并确认忽略手动订单的自动启动拦截；未撤单、未删除订单、未改变成交状态或 PnL，未开启自动交易。",
            metadata: jsonValue({ version: 1, scope: input.scope, acknowledged: true, reviewedBy: reviewer,
              reviewedAt: now.toISOString(), reviewVersion: input.reviewVersion, records: rows }) } });
          return { count: updated.count };
        });
      } else if (input.action === "reconcile") {
        const wallet = await fetchAgentWalletData(owner.state);
        if (!wallet.address || agentWalletOwnerKey(wallet.address) !== owner.ownerKey) throw new ControlError("钱包身份变化，请重新扫码登录。", 401);
        owner.state = wallet.state;
        reconciliation = await reconcileBstockManualOrders(owner.state, owner.ownerKey, { onlyBlocking: true });
        owner.state = reconciliation.state;
      } else if (input.action === "scan") {
        const config = await prisma.bstockAutoConfig.findUnique({ where: { ownerKey: owner.ownerKey } });
        const scan = await scanAutoCandidates(owner.ownerKey, agentSessionKey(owner.state), autoSettingsSchema.parse(config?.settings || {}));
        await autoEvent(owner.ownerKey, config?.generation || null, "SCAN", "用户请求只读扫描：未签名、未下单、未购买研报。", { metadata: scan.diagnostics });
      } else {
        let wallet = await fetchAgentWalletData(owner.state);
        if (!wallet.address || agentWalletOwnerKey(wallet.address) !== owner.ownerKey) throw new ControlError("钱包身份变化，请重新扫码登录。", 401);
        owner.state = wallet.state;
        reconciliation = await reconcileBstockManualOrders(owner.state, owner.ownerKey, { onlyBlocking: true });
        owner.state = reconciliation.state;
        // Reconciliation can take several seconds. Re-read balances after any
        // terminal update instead of authorizing with a pre-settlement snapshot.
        if (reconciliation.reconciled > 0) {
          wallet = await fetchAgentWalletData(owner.state);
          if (!wallet.address || agentWalletOwnerKey(wallet.address) !== owner.ownerKey) throw new ControlError("钱包身份变化，请重新扫码登录。", 401);
          owner.state = wallet.state;
        }
        if (owner.state.sessionExpireAt < Date.now() + 300_000) throw new ControlError("钱包授权不足 5 分钟，请重新扫码后开启。", 401);
        const market = await fetchOfficialBstockMarket();
        if (!market.registrySourceAvailable || market.deliveryMode === "CACHE_STALE" || !Number.isFinite(Date.parse(market.fetchedAt)) || Date.now() - Date.parse(market.fetchedAt) > 120_000) {
          throw new ControlError("实时标的与行情尚未就绪，暂不能开启自动交易。");
        }
        const balances = walletSnapshotDto(wallet.tokens, new Map(market.assets.map(a => [a.contractAddress.toLowerCase(), a.multiplier])));
        const stable = balances.paymentBalances.USDT;
        if (!stable || !Number.isFinite(stable.price) || stable.price < 0.98 || stable.price > 1.02) throw new ControlError("USDT 实时价格异常，暂不能开启。");
        if ((balances.paymentBalances.BNB?.balance || 0) < 0.0002) throw new ControlError("BNB Gas 余额不足，请先补充后开启。");
        const generation = randomUUID();
        const settings = input.settings;
        const now = new Date();
        const expiresAt = new Date(Math.min(owner.state.sessionExpireAt, Date.now() + 86_400_000));
        const stateEncrypted = encodeAgentSession(owner.state);
        await withAutoLock(owner.ownerKey, async tx => {
          const key = owner!.ownerKey;
          const current = await tx.bstockAutoConfig.findUnique({ where: { ownerKey: key } });
          if (current?.enabled) throw new ControlError("自动交易已开启，请勿重复启动。");
          if (current?.leaseUntil && current.leaseUntil > now) throw new ControlError("上一轮正在结束与核对，请稍后再开启。");
          if (await tx.bstockAutoOrder.count({ where: { ownerKey: key, status: { in: AUTO_PENDING } } })) throw new ControlError("存在尚未核对完毕的自动订单，不能重新开启。");
          // Re-check under the same owner lock as manual submission: a new
          // trade may have been claimed while historical evidence was fetched.
          const blockers = await manualBlockers(tx, key);
          if (blockers.manualBlockerCount) {
            const quotesOnly = blockers.manualPendingCount === 0;
            const code = quotesOnly ? "MANUAL_QUOTE_ACTIVE" : "MANUAL_ORDER_PENDING";
            console.info("[bstock-automation] start_blocked", { code, count: blockers.manualBlockerCount,
              statuses: [...new Set(blockers.manualBlockers.map(row => row.status))],
              reconciled: reconciliation?.reconciled || 0, lookupFailed: reconciliation?.lookupFailed || false });
            throw new ControlError(quotesOnly
              ? "仍有有效手动报价，请关闭交易确认窗口并等待下方报价到期后再开启。"
              : "历史手动交易尚未全部核对，自动交易未开启。请点击「核对历史订单」查看结果；待确认订单不会按时间自动清除。",
            409, code, blockers);
          }
          const positions = await tx.bstockAutoPosition.findMany({ where: { ownerKey: key } });
          let cost = 0;
          let unrealized = 0;
          for (const position of positions) {
            if (Number(position.quantity) <= 0) continue;
            const asset = market.assets.find(a => a.symbol === position.symbol);
            const held = balances.bstockBalances.find(b => b.address.toLowerCase() === position.contractAddress.toLowerCase());
            if (!asset || !asset.price || asset.contractAddress.toLowerCase() !== position.contractAddress.toLowerCase()
              || asset.multiplier !== position.multiplier || !held || compareDecimals(held.balanceExact, position.quantity) < 0) {
              throw new ControlError("机器人持仓与钱包或标的信息不一致，请先核对，不能重启。");
            }
            cost += Number(position.costUsd);
            unrealized += Number(position.quantity) * asset.price - Number(position.costUsd);
          }
          if (cost > settings.budgetUsd || stable.valueUsd + cost < settings.budgetUsd) throw new ControlError("自动交易预算超过可用 USDT 与已有机器人持仓成本之和。");
          const prior = await tx.bstockAutoOrder.aggregate({ where: { ownerKey: key, status: "FINISHED" }, _sum: { realizedPnlUsd: true } });
          const config = { walletAddress: wallet.address, sessionEncrypted: stateEncrypted, enabled: true, status: "STARTING",
            generation, settings: jsonValue(settings), strategyVersion: AUTO_STRATEGY_VERSION, runId: null,
            startedAt: now, heartbeatAt: now, expiresAt, lastError: null, equityStartUsd: settings.budgetUsd + unrealized,
            equityHighUsd: settings.budgetUsd + unrealized, realizedBaseline: prior._sum.realizedPnlUsd || 0,
            stats: jsonValue({ riskExitOnly: false, botEquityUsd: settings.budgetUsd + unrealized, openPositions: positions.filter(p => Number(p.quantity) > 0).length }),
            leaseToken: null, leaseUntil: null };
          await tx.bstockAutoConfig.upsert({ where: { ownerKey: key }, create: { ownerKey: key, ...config }, update: config });
          await tx.bstockAutoEvent.create({ data: { ownerKey: key, generation, kind: "STARTED", status: "STARTING",
            reason: "用户明确授权后台自动交易：仅限已有有效研报的现货 bStock；不使用杠杆或马丁格尔，不承诺收益。",
            metadata: jsonValue({ settings, strategyVersion: AUTO_STRATEGY_VERSION, acknowledged: true, expiresAt, pnlExcludesGas: true }) } });
        });
        try {
          const run = await start(bstockAutoWorkflow, [owner.ownerKey, generation]);
          await prisma.bstockAutoConfig.updateMany({ where: { ownerKey: owner.ownerKey, generation }, data: { runId: run.runId } });
        } catch (error) {
          await pauseAuto(owner.ownerKey, generation, "后台任务启动未确认，已关闭自动交易，请刷新后核对状态。", "START_FAILED");
          throw error;
        }
      }
    }
    const response = json({ ...await snapshot(owner), ...(ignored ? { ignored } : {}), ...(reconciliation ? { reconciliation: {
      reconciled: reconciliation.reconciled, remaining: reconciliation.remaining, lookupFailed: reconciliation.lookupFailed
    } } : {}) });
    return owner.state ? persistAgentSession(response, owner.state) : response;
  } catch (error) {
    const response = failure(error);
    return owner?.state ? persistAgentSession(response, owner.state) : response;
  }
}
