import { Prisma } from "@prisma/client";

export type IncomePage = (input: { startTime: number; endTime: number; page: number; limit: number }) => Promise<Array<Record<string, unknown>>>;
export type PnlStatus = "ready" | "partial" | "unavailable" | "not_configured";
export type IncomeAssetSummary = {
  asset: string;
  realizedPnl: number;
  commission: number;
  fundingFee: number;
  netRealizedPnl: number;
  recordCount: number;
};
type IncomeReadFailure = { kind: "network" | "rate_limit" | "credentials" | "exchange" | "response" | "capacity"; httpStatus: number | null; exchangeCode: number | null };

function incomeReadFailure(error: unknown): IncomeReadFailure {
  const detail = error && typeof error === "object" ? error as { status?: unknown; code?: unknown } : {};
  const status = typeof detail.status === "number" && Number.isSafeInteger(detail.status) ? detail.status : null;
  const code = typeof detail.code === "number" && Number.isSafeInteger(detail.code) ? detail.code : null;
  return { kind: status === 418 || status === 429 || code === -1003 ? "rate_limit"
    : status === 401 || status === 403 || code === -2014 || code === -2015 || code === -1022 ? "credentials"
    : status == null || status === 408 || status >= 500 ? "network" : "exchange", httpStatus: status, exchangeCode: code };
}

export function emptyIncomeSummary(startTime: number, endTime: number, status: PnlStatus, message: string) {
  return {
    status, amount: null as number | null, asset: "USDT", realizedPnl: null as number | null,
    commission: null as number | null, fundingFee: null as number | null,
    assets: [] as IncomeAssetSummary[], nonTradingFlows: [] as Array<{ asset: string; amount: number; incomeTypes: string[] }>,
    // Aggregate diagnostics only: no transaction IDs, symbols, amounts or raw rows.
    dataQuality: { signedTransactionIdRows: 0, losslessTransactionIdRows: 0, invalidRows: 0, outOfWindowRows: 0,
      invalidFields: { structure: 0, incomeType: 0, asset: 0, time: 0, tranId: 0, income: 0 } },
    hasNonTradingFlows: false, periodStart: new Date(startTime).toISOString(), periodEnd: new Date(endTime).toISOString(),
    recordCount: 0, realizedIncomeCount: 0, pagesRead: 0, requestsMade: 0, retries: 0,
    readFailure: null as IncomeReadFailure | null, coverageComplete: false, allTime: false,
    source: "binance_futures_income", scope: "LIVE_ACCOUNT", accountVersion: null as string | null, refreshedAt: new Date().toISOString(), message,
  };
}

export type LiveIncomeSummary = ReturnType<typeof emptyIncomeSummary>;

function incomeTransactionId(value: unknown): string | null {
  if (typeof value === "number") return Number.isSafeInteger(value) ? String(value) : null;
  if (typeof value !== "string" || !/^-?(?:0|[1-9]\d{0,18})$/.test(value)) return null;
  const integer = BigInt(value);
  // Binance documents a signed int64, not an unsigned JavaScript safe integer.
  if (integer < -9223372036854775808n || integer > 9223372036854775807n) return null;
  return integer.toString();
}

// https://developers.binance.com/docs/derivatives/usds-margined-futures/account/rest-api/Get-Income-History
// Income IDs are unique within their income type. Never sum different assets,
// count income entries as closed trades, or include transfers as trading PnL.
export async function collectIncomeSummary(
  fetchPage: IncomePage, startTime: number, endTime: number,
  options: { maxPages?: number; pageSize?: number; deadlineMs?: number; now?: () => number } = {},
): Promise<LiveIncomeSummary> {
  const pageSize = options.pageSize ?? 1000;
  const maxPages = options.maxPages ?? 64;
  const now = options.now ?? Date.now;
  const deadline = now() + (options.deadlineMs ?? 42_000);
  const result = emptyIncomeSummary(startTime, endTime, "partial", "分页尚未完成；不提供完整期间净盈亏。");
  const seen = new Set<string>();
  const totals = new Map<string, { realizedPnl: Prisma.Decimal; commission: Prisma.Decimal; fundingFee: Prisma.Decimal; recordCount: number }>();
  const flows = new Map<string, { amount: Prisma.Decimal; incomeTypes: Set<string> }>();
  let invalidRows = false;
  // The current income endpoint documents inclusive time bounds and a 1,000-row
  // limit, but no page parameter. Split saturated windows instead of requesting
  // page 2 of the same interval (which can repeat page 1 indefinitely).
  const windows = [{ startTime, endTime }];
  while (windows.length) {
    if (now() >= deadline || result.requestsMade >= maxPages) break;
    const window = windows.pop()!;
    let rows: Array<Record<string, unknown>>;
    try {
      result.requestsMade += 1;
      rows = await fetchPage({ ...window, page: 1, limit: pageSize });
    } catch (error) {
      const failure = incomeReadFailure(error);
      // Read-only transient failures may retry once. Never retry an IP ban,
      // rate limit, or rejected credential, and leave time for the next request.
      if (failure.kind !== "network" || result.requestsMade >= maxPages || now() + 12_000 >= deadline) {
        result.readFailure = failure; break;
      }
      try {
        result.requestsMade += 1; result.retries += 1;
        rows = await fetchPage({ ...window, page: 1, limit: pageSize });
      } catch (retryError) { result.readFailure = incomeReadFailure(retryError); break; }
    }
    result.pagesRead += 1;
    if (!Array.isArray(rows) || rows.length > pageSize) {
      result.readFailure = { kind: "response", httpStatus: null, exchangeCode: null }; break;
    }
    const saturated = rows.length === pageSize;
    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        invalidRows = true; result.dataQuality.invalidRows += 1; result.dataQuality.invalidFields.structure += 1; continue;
      }
      const incomeType = typeof row.incomeType === "string" ? row.incomeType : "";
      const asset = typeof row.asset === "string" ? row.asset.toUpperCase() : "";
      const timestamp = (typeof row.time === "number" || (typeof row.time === "string" && /^\d+$/.test(row.time))) ? Number(row.time) : NaN;
      const id = incomeTransactionId(row.tranId);
      const amountText = typeof row.income === "string" ? row.income : String(row.income ?? "");
      if (id?.startsWith("-")) result.dataQuality.signedTransactionIdRows += 1;
      if (id != null && typeof row.tranId === "string" && !Number.isSafeInteger(Number(id))) result.dataQuality.losslessTransactionIdRows += 1;
      const outsideWindow = Number.isSafeInteger(timestamp) && (timestamp < window.startTime || timestamp > window.endTime);
      if (outsideWindow) result.dataQuality.outOfWindowRows += 1;
      const invalidFields = { incomeType: !/^[A-Z][A-Z0-9_]{0,63}$/.test(incomeType), asset: !/^[A-Z0-9]{1,24}$/.test(asset),
        time: !Number.isSafeInteger(timestamp), tranId: id == null, income: !/^-?\d+(?:\.\d+)?$/.test(amountText) };
      for (const field of Object.keys(invalidFields) as Array<keyof typeof invalidFields>) {
        if (invalidFields[field]) result.dataQuality.invalidFields[field] += 1;
      }
      if (outsideWindow || Object.values(invalidFields).some(Boolean)) {
        invalidRows = true; result.dataQuality.invalidRows += 1; continue;
      }
      // Only sum windows proven complete. Parent rows will be read again in
      // the smaller windows, so they cannot affect totals or de-duplication.
      if (saturated) continue;
      const identity = `${incomeType}:${String(id)}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      const amount = new Prisma.Decimal(amountText);
      if (!amount.isFinite()) { invalidRows = true; result.dataQuality.invalidRows += 1; result.dataQuality.invalidFields.income += 1; continue; }
      if (["REALIZED_PNL", "COMMISSION", "FUNDING_FEE"].includes(incomeType)) {
        const total = totals.get(asset) ?? { realizedPnl: new Prisma.Decimal(0), commission: new Prisma.Decimal(0), fundingFee: new Prisma.Decimal(0), recordCount: 0 };
        if (incomeType === "REALIZED_PNL") { total.realizedPnl = total.realizedPnl.add(amount); result.realizedIncomeCount += 1; }
        else if (incomeType === "COMMISSION") total.commission = total.commission.add(amount);
        else total.fundingFee = total.fundingFee.add(amount);
        total.recordCount += 1;
        totals.set(asset, total);
        result.recordCount += 1;
      } else {
        const flow = flows.get(asset) ?? { amount: new Prisma.Decimal(0), incomeTypes: new Set<string>() };
        flow.amount = flow.amount.add(amount); flow.incomeTypes.add(incomeType); flows.set(asset, flow);
        if (!amount.isZero()) result.hasNonTradingFlows = true;
      }
    }
    if (invalidRows) break;
    if (saturated) {
      if (window.startTime === window.endTime) {
        result.readFailure = { kind: "capacity", httpStatus: null, exchangeCode: null }; break;
      }
      const middle = window.startTime + Math.floor((window.endTime - window.startTime) / 2);
      // Inclusive bounds: each millisecond belongs to exactly one child.
      windows.push({ startTime: middle + 1, endTime: window.endTime }, { startTime: window.startTime, endTime: middle });
    }
  }
  result.coverageComplete = windows.length === 0 && !invalidRows && !result.readFailure
    && result.pagesRead > 0 && now() < deadline;
  result.assets = [...totals.entries()].map(([asset, total]) => ({
    asset, realizedPnl: total.realizedPnl.toNumber(), commission: total.commission.toNumber(), fundingFee: total.fundingFee.toNumber(),
    netRealizedPnl: total.realizedPnl.add(total.commission).add(total.fundingFee).toNumber(), recordCount: total.recordCount,
  }));
  result.nonTradingFlows = [...flows.entries()].map(([asset, flow]) => ({ asset, amount: flow.amount.toNumber(), incomeTypes: [...flow.incomeTypes] }));
  if (result.coverageComplete) {
    const usdt = result.assets.find((item) => item.asset === "USDT");
    result.status = "ready";
    result.amount = usdt?.netRealizedPnl ?? 0;
    result.realizedPnl = usdt?.realizedPnl ?? 0;
    result.commission = usdt?.commission ?? 0;
    result.fundingFee = usdt?.fundingFee ?? 0;
    result.message = "所示期间 Binance 合约账户净已实现盈亏；含手续费与资金费，排除转账与奖励。其他币种单列，非全部历史，非 Alpha 专属收益。";
  } else {
    result.status = result.pagesRead === 0 ? "unavailable" : "partial";
    const labels = { structure: "记录结构", incomeType: "流水类型", asset: "结算币种", time: "时间字段", tranId: "流水编号", income: "金额字段" };
    const issues = (Object.keys(labels) as Array<keyof typeof labels>)
      .filter(field => result.dataQuality.invalidFields[field] > 0)
      .map(field => `${labels[field]} ${result.dataQuality.invalidFields[field]} 条`);
    if (result.dataQuality.outOfWindowRows) issues.push(`超出查询时间范围 ${result.dataQuality.outOfWindowRows} 条`);
    const failureMessages = { network: "交易所连接超时或暂时中断，将自动重试。", rate_limit: "交易所请求限流，稍后自动重试。",
      credentials: "交易所拒绝读取流水，请检查 API 读取权限、有效期及 IP 白名单。", exchange: "交易所暂时无法返回结算流水，将自动重试。",
      response: "交易所流水响应格式异常，将自动重试。", capacity: "同一时刻的流水超过单次读取上限，期间统计尚未完整。" };
    result.message = invalidRows ? `交易所流水校验未通过（${issues.join("，")}）；期间统计不完整，净盈亏暂不可用。`
      : result.readFailure ? failureMessages[result.readFailure.kind]
      : "达到本次分页或时间上限；未覆盖完整期间，净盈亏暂不可用。";
  }
  result.refreshedAt = new Date().toISOString();
  return result;
}
