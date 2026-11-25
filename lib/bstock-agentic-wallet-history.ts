import "server-only";

import type { AgentSessionState } from "@/lib/bstock-agentic-wallet-auth";
import { AgenticWalletRequestError, agentWalletRequest } from "@/lib/bstock-agentic-wallet-client";
import { normalizeAgenticWalletMarketOrders, type AgenticWalletMarketOrder } from "@/lib/bstock-agentic-wallet-order-status";

const ENDPOINT = "/bapi/defi/v1/public/wallet-direct/web-dex/agent/batch-query-market-orders";
const PAGE_SIZE = 100;

/** Read-only, bounded pagination. A repeated page or unfamiliar envelope is not an empty account. */
export async function fetchAgentWalletOrderHistory(initialState: AgentSessionState, options: {
  deadline?: number;
  maxPages?: number;
} = {}) {
  const deadline = options.deadline ?? Date.now() + 15_000;
  const maxPages = Math.max(1, Math.min(8, options.maxPages ?? 4));
  let state = initialState;
  let total: number | null = null;
  let complete = false;
  let available = false;
  let pages = 0;
  let code: string | null = null;
  const rows: AgenticWalletMarketOrder[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= maxPages; page++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) { code = "ORDER_HISTORY_BUDGET_EXHAUSTED"; break; }
    try {
      const response = await agentWalletRequest<unknown>(state, ENDPOINT, {
        body: { binanceChainId: "56", page, pageSize: 100, sort: "DESC" },
        timeoutMs: Math.min(8_000, remaining)
      });
      state = response.state;
      const normalized = normalizeAgenticWalletMarketOrders(response.data);
      if (normalized.responseShape === "unknown") {
        code = "ORDER_HISTORY_RESPONSE_UNRECOGNIZED";
        break;
      }
      pages++;
      available = true;
      // Bare array normalization reports this page's size, not the account total.
      const explicitTotal = normalized.responseShape.endsWith("[]") ? null : normalized.total;
      if (explicitTotal != null) total = Math.max(total ?? 0, explicitTotal);
      let added = 0;
      for (const order of normalized.rows) {
        const identity = order.orderId ? `id:${order.orderId}` : order.txHash ? `tx:${order.txHash.toLowerCase()}` : "";
        if (!identity) { code = "ORDER_HISTORY_RECORD_INVALID"; continue; }
        if (seen.has(identity)) continue;
        seen.add(identity);
        rows.push(order);
        added++;
      }
      if (code === "ORDER_HISTORY_RECORD_INVALID") break;
      if (normalized.rows.length && added === 0) { code = "ORDER_HISTORY_PAGE_REPEATED"; break; }
      if (total != null && rows.length > total) { code = "ORDER_HISTORY_COUNT_MISMATCH"; break; }
      const exhausted = normalized.rows.length < PAGE_SIZE;
      if ((total != null && rows.length >= total) || (exhausted && total == null)) {
        complete = true;
        total ??= rows.length;
        break;
      }
      if (exhausted) { code = "ORDER_HISTORY_COUNT_MISMATCH"; break; }
      code = "ORDER_HISTORY_PAGE_LIMIT";
    } catch (error) {
      if (error instanceof AgenticWalletRequestError && error.terminal) throw error;
      code = error instanceof AgenticWalletRequestError ? error.code : "ORDER_HISTORY_LOOKUP_FAILED";
      break;
    }
  }
  return { state, rows, total, complete, available, pages, code: complete ? null : code };
}
