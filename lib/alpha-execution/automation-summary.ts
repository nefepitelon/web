type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown, max = 320) => typeof value === "string" ? value.slice(0, max) : "";
const code = (value: unknown) => typeof value === "string" && /^[A-Z][A-Z_0-9]{0,79}$/.test(value) ? value : "UNKNOWN_REASON";
const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
// Only diagnostic fields are projected. Original messages, evidence IDs, credentials,
// candidate trade intents and arbitrary audit metadata never reach this read model.
const diagnosticKeys = new Set(["selectedStrategies","strategyChecks","conflictingDirections","matchedStrategies","strategy","source","matched","message",
  "observationCount","observations","truncated","issues","code","side","sourceStatus","sourceReason","ageBasis","observedAt","snapshotAt","eventAt",
  "ageMinutes","eventAgeMinutes","snapshotAgeMinutes","maxAgeMinutes","priority","riskPoolPriority","sameCoinCount","score","alphaScore","minScore","priceMomentumScore",
  "volumeAnomalyScore","requiredScore","requiredDimensionScore","atrPct","atrStopMultiplier","requiredStopLossPct","minStopLossPct","maxStopLossPct",
  "maxSlippagePct","maxEntryDriftPct","minimumRequiredMaxStopLossPct","longMinimumMaxStopLossPct","shortMinimumMaxStopLossPct","priceLow","priceHigh",
  "stopLowerBound","stopUpperBound","quoteVolume24h","minQuoteVolume24h","spreadPct","estimatedSlippagePct","maxSpreadPct","priceTolerancePct",
  "entryPrice","stopPriceLowerBound","stopPriceUpperBound","tickSize","quantizedStopLoss","candidateSpecificAtrAndTickCheckRequired","parameterWarnings"]);
function diagnostic(value: unknown, depth = 0): unknown {
  if (depth > 7) return undefined;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return text(value);
  if (Array.isArray(value)) return value.slice(0, 10).map(item => diagnostic(item, depth + 1));
  return Object.fromEntries(Object.entries(record(value)).filter(([key]) => diagnosticKeys.has(key)).map(([key, item]) => [key, diagnostic(item, depth + 1)]));
}
export function summarizeAutomationSelection(value: unknown) {
  const raw = record(value);
  const rejections = list(raw.rejections).map(record).filter(item => typeof item.symbol === "string" && /^[A-Z0-9]{2,30}$/.test(item.symbol)).map(item => ({
    symbol: String(item.symbol), reason: code(item.reason), ...(text(item.message || item.detail) ? { message: text(item.message || item.detail) } : {}),
    ...(item.details ? { details: diagnostic(item.details) } : {}),
  }));
  const totals = new Map<string, number>();
  for (const item of rejections) totals.set(item.reason, (totals.get(item.reason) ?? 0) + 1);
  return { candidateCount: Array.isArray(raw.candidates) ? raw.candidates.length : count(raw.candidateCount),
    rejectionCounts: [...totals].map(([reason, count]) => ({ reason, count })), rejections: rejections.slice(0, 40),
    parameterWarnings: list(raw.parameterWarnings).slice(0, 8).map(record).map(item => ({ code: code(item.code), message: text(item.message), details: diagnostic(item.details) })),
    sourceStatus: list(raw.sourceStatus).slice(0, 8).map(record).filter(item => ["anomaly","momentum","signal","risk_pool","market"].includes(String(item.source))).map(item => ({
      source: String(item.source), ok: item.ok === true, count: count(item.count), observedAt: count(item.observedAt) || null,
      message: item.ok === true ? "本轮数据源已读取，标的仍须通过对应策略及风控检查" : "本轮数据源未就绪，请检查时效或连接状态",
    })),
  };
}
