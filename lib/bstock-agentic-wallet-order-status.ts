type UnknownRecord = Record<string, unknown>;

export type AgenticWalletMarketOrder = {
  orderId?: string;
  clientOrderId?: string;
  status?: string;
  fromToken?: string;
  toToken?: string;
  fromSymbol?: string;
  toSymbol?: string;
  fromAmount?: string;
  toAmount?: string;
  slippage?: string;
  txHash?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type AgenticWalletMarketOrders = {
  rows: AgenticWalletMarketOrder[];
  total: number | null;
  responseShape: string;
};

export type AgenticWalletOrderMatchHint = {
  orderId: string;
  clientOrderId?: string | null;
  fromToken?: string | null;
  toToken?: string | null;
  fromSymbol?: string | null;
  toSymbol?: string | null;
  fromAmount?: string | null;
  toAmount?: string | null;
  submittedAt?: number | null;
};

export type AgenticWalletOrderMatch = {
  order: AgenticWalletMarketOrder | null;
  strategy: "ORDER_ID" | "CLIENT_ORDER_ID" | "CORRELATED" | "NONE";
};

const successStatuses = new Set(["FINISHED", "SUCCESS", "SUCCEEDED", "COMPLETED", "CONFIRMED", "FILLED"]);
const failedStatuses = new Set(["FAILED", "FAILURE", "REJECTED", "CANCELED", "CANCELLED", "EXPIRED"]);

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function scalar(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
      const text = String(value).trim();
      if (text) return text;
    }
  }
  return undefined;
}

function orderRecord(value: unknown): UnknownRecord | null {
  if (!isRecord(value)) return null;
  for (const key of ["order", "orderInfo", "marketOrder"]) {
    if (isRecord(value[key])) return { ...value, ...(value[key] as UnknownRecord) };
  }
  return value;
}

function normalizeOrder(value: unknown): AgenticWalletMarketOrder | null {
  const row = orderRecord(value);
  if (!row) return null;
  return {
    orderId: scalar(row, ["orderId", "id", "orderNo", "order_id"]),
    clientOrderId: scalar(row, ["clientOrderId", "clientOrderNo", "client_order_id"]),
    status: scalar(row, ["status", "orderStatus", "state"]),
    fromToken: scalar(row, ["fromTokenAddress", "fromToken", "payTokenAddress"]),
    toToken: scalar(row, ["toTokenAddress", "toToken", "receiveTokenAddress"]),
    fromSymbol: scalar(row, ["fromTokenName", "fromTokenSymbol", "fromSymbol", "payTokenSymbol"]),
    toSymbol: scalar(row, ["toTokenName", "toTokenSymbol", "toSymbol", "receiveTokenSymbol"]),
    fromAmount: scalar(row, ["fromTokenQty", "fromTokenAmount", "fromAmount", "actualFromAmount"]),
    toAmount: scalar(row, ["toTokenActualQty", "toTokenQty", "toTokenAmount", "toAmount", "actualToAmount"]),
    slippage: scalar(row, ["slippage", "slippageRatio"]),
    txHash: scalar(row, ["orderTxId", "txHash", "transactionHash"]),
    createdAt: scalar(row, ["bookTime", "createdAt", "createTime"]),
    updatedAt: scalar(row, ["updatedTime", "updateTime", "completedAt"])
  };
}

function normalizedAddress(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function normalizedSymbol(value: string | null | undefined) {
  return String(value || "").trim().toUpperCase();
}

function timestampMs(value: string | undefined) {
  if (!value) return null;
  const numeric = Number(value);
  const parsed = Number.isFinite(numeric)
    ? numeric < 10_000_000_000 ? numeric * 1_000 : numeric
    : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function amountsClose(expected: string | null | undefined, actual: string | undefined) {
  const left = Number(expected);
  const right = Number(actual);
  if (!Number.isFinite(left) || !Number.isFinite(right) || left <= 0 || right <= 0) return false;
  return Math.abs(left - right) / Math.max(left, right) <= 0.03;
}

/**
 * Agentic Wallet can return a parent submission id from place-order while the
 * market-order history indexes the filled child order under another id.  Only
 * correlate that child when direction plus time/amount evidence agrees.
 */
export function matchAgenticWalletMarketOrder(
  rows: AgenticWalletMarketOrder[],
  hint: AgenticWalletOrderMatchHint
): AgenticWalletOrderMatch {
  const exact = rows.find((row) => row.orderId === hint.orderId);
  if (exact) return { order: exact, strategy: "ORDER_ID" };

  if (hint.clientOrderId) {
    const byClientId = rows.find((row) => row.clientOrderId === hint.clientOrderId);
    if (byClientId) return { order: byClientId, strategy: "CLIENT_ORDER_ID" };
  }

  const hintFromToken = normalizedAddress(hint.fromToken);
  const hintToToken = normalizedAddress(hint.toToken);
  const hintFromSymbol = normalizedSymbol(hint.fromSymbol);
  const hintToSymbol = normalizedSymbol(hint.toSymbol);
  const submittedAt = typeof hint.submittedAt === "number" && Number.isFinite(hint.submittedAt)
    ? hint.submittedAt
    : null;
  const ranked = rows.flatMap((row) => {
    const rowFromToken = normalizedAddress(row.fromToken);
    const rowToToken = normalizedAddress(row.toToken);
    const rowFromSymbol = normalizedSymbol(row.fromSymbol);
    const rowToSymbol = normalizedSymbol(row.toSymbol);
    const tokenDirection = Boolean(hintFromToken && hintToToken && rowFromToken && rowToToken)
      && hintFromToken === rowFromToken && hintToToken === rowToToken;
    const symbolDirection = Boolean(hintFromSymbol && hintToSymbol && rowFromSymbol && rowToSymbol)
      && hintFromSymbol === rowFromSymbol && hintToSymbol === rowToSymbol;
    if (!tokenDirection && !symbolDirection) return [];

    const rowTime = timestampMs(row.createdAt) ?? timestampMs(row.updatedAt);
    const timeDistance = submittedAt != null && rowTime != null ? Math.abs(rowTime - submittedAt) : null;
    const timeAligned = timeDistance != null && timeDistance <= 30 * 60_000;
    const amountAligned = amountsClose(hint.fromAmount, row.fromAmount) || amountsClose(hint.toAmount, row.toAmount);
    if (!timeAligned && !amountAligned) return [];

    const score = (tokenDirection ? 500 : 300)
      + (timeAligned ? Math.max(20, 180 - Math.floor((timeDistance || 0) / 10_000)) : 0)
      + (amountAligned ? 120 : 0)
      + (normalizeAgenticWalletOrderStatus(row).final ? 20 : 0);
    return [{ row, score, timeDistance: timeDistance ?? Number.MAX_SAFE_INTEGER }];
  }).sort((left, right) => right.score - left.score || left.timeDistance - right.timeDistance);

  return ranked[0]
    ? { order: ranked[0].row, strategy: "CORRELATED" }
    : { order: null, strategy: "NONE" };
}

function totalFromCandidate(value: unknown) {
  if (!isRecord(value)) return null;
  const total = scalar(value, ["total", "totalCount", "count", "recordsTotal"]);
  if (total == null) return null;
  const parsed = Number(total);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function candidateContainers(value: unknown) {
  const candidates: Array<{ value: unknown; path: string }> = [{ value, path: "root" }];
  if (!isRecord(value)) return candidates;
  for (const key of ["data", "result", "payload"]) {
    if (value[key] !== undefined) candidates.push({ value: value[key], path: key });
  }
  for (const key of ["data", "result", "payload"]) {
    const nested = value[key];
    if (!isRecord(nested)) continue;
    for (const childKey of ["data", "result"]) {
      if (nested[childKey] !== undefined) candidates.push({ value: nested[childKey], path: `${key}.${childKey}` });
    }
  }
  return candidates;
}

export function normalizeAgenticWalletMarketOrders(value: unknown): AgenticWalletMarketOrders {
  for (const candidate of candidateContainers(value)) {
    if (Array.isArray(candidate.value)) {
      const rows = candidate.value.map(normalizeOrder).filter((row): row is AgenticWalletMarketOrder => Boolean(row));
      return { rows, total: rows.length, responseShape: `${candidate.path}[]` };
    }
    if (!isRecord(candidate.value)) continue;
    for (const key of ["rows", "list", "orders", "items", "records"]) {
      if (!Array.isArray(candidate.value[key])) continue;
      const values = candidate.value[key] as unknown[];
      const rows = values.map(normalizeOrder).filter((row): row is AgenticWalletMarketOrder => Boolean(row));
      return { rows, total: totalFromCandidate(candidate.value), responseShape: `${candidate.path}.${key}` };
    }
    const single = normalizeOrder(candidate.value);
    if (single?.orderId) return { rows: [single], total: 1, responseShape: `${candidate.path}.order` };
  }
  return { rows: [], total: null, responseShape: "unknown" };
}

export function normalizeAgenticWalletOrderStatus(order: AgenticWalletMarketOrder | null) {
  const upstreamStatus = String(order?.status || "").trim().toUpperCase();
  const hasSettlementEvidence = Boolean(order?.txHash && Number(order?.toAmount) > 0);
  if (successStatuses.has(upstreamStatus) || (hasSettlementEvidence && !failedStatuses.has(upstreamStatus))) {
    return { status: "FINISHED" as const, final: true, successful: true, upstreamStatus: upstreamStatus || null, settledByEvidence: !successStatuses.has(upstreamStatus) };
  }
  if (failedStatuses.has(upstreamStatus)) {
    return { status: "FAILED" as const, final: true, successful: false, upstreamStatus, settledByEvidence: false };
  }
  return { status: upstreamStatus || "PENDING", final: false, successful: false, upstreamStatus: upstreamStatus || null, settledByEvidence: false };
}
