import { z } from "zod";

export const ALPHA_AUTOMATION_STRATEGY_VERSION = "alpha-selected-strategies-20260910-v2";
export const ALPHA_AUTOMATION_STRATEGIES = ["p1_three_source", "p2_two_source", "strong_signal", "same_coin_x2", "anomaly"] as const;
export type AlphaAutomationStrategy = typeof ALPHA_AUTOMATION_STRATEGIES[number];
/** These are engineering starting limits, not a backtested or profitable trading strategy. */
export const ALPHA_AUTOMATION_REFERENCES = [
  { title: "Binance symbol filters", url: "https://developers.binance.com/en/docs/products/spot/filters", purpose: "Quantity, price increments and notional bounds must come from current exchange metadata." },
  { title: "Binance USDⓈ-M trade API", url: "https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/trade", purpose: "Leverage and order acceptance remain exchange constraints; this module never changes leverage or submits orders." },
  { title: "FINRA stop orders", url: "https://www.finra.org/investors/insights/stop-orders-factors-consider-during-volatile-markets", purpose: "Stop triggers do not guarantee execution prices. Cost buffers below are estimates, not a loss guarantee." },
] as const;

const number = (min: number, max: number) => z.number().finite().min(min).max(max);
export const alphaAutomationSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  selectedStrategies: z.array(z.enum(ALPHA_AUTOMATION_STRATEGIES)).min(1).max(ALPHA_AUTOMATION_STRATEGIES.length)
    .refine(values => new Set(values).size === values.length, "策略选项不得重复").default([...ALPHA_AUTOMATION_STRATEGIES]),
  sessionDurationHours: number(1, 24).default(24),
  intervalMinutes: number(5, 240).int().default(15),
  minOrderGapMinutes: number(5, 1440).int().default(15),
  maxOrdersPerRun: number(1, 3).int().default(1),
  orderNotional: number(5, 10_000).default(50),
  maxOrderNotional: number(5, 10_000).default(100),
  leverage: number(1, 3).int().default(2),
  maxPositions: number(1, 12).int().default(3),
  maxPortfolioNotional: number(5, 100_000).default(200),
  maxPortfolioEquityPct: number(1, 50).default(20),
  riskPerTradePct: number(0.01, 1).default(0.25),
  minScore: number(60, 95).default(80),
  maxDataAgeMinutes: number(1, 10).int().default(10),
  maxQuoteAgeSeconds: number(5, 60).int().default(30),
  minQuoteVolume24h: number(1_000_000, 1_000_000_000).default(20_000_000),
  maxSpreadPct: number(0.01, 1).default(0.15),
  maxSlippagePct: number(0.01, 1).default(0.3),
  atrStopMultiplier: number(1, 3).default(2),
  minStopLossPct: number(0.25, 2).default(1.5),
  maxStopLossPct: number(0.5, 5).default(3),
  minRiskRewardRatio: number(2, 5).default(2),
  maxHoldingMinutes: number(15, 1440).int().default(120),
  dailyLossLimitPct: number(0.25, 3).default(1),
}).strict().superRefine((settings, context) => {
  for (const [key, invalid, message] of [
    ["orderNotional", settings.orderNotional > settings.maxOrderNotional, "单笔目标不得高于单笔名义上限"],
    ["orderNotional", settings.orderNotional > settings.maxPortfolioNotional, "单笔目标不得高于组合名义上限"],
    ["minStopLossPct", settings.minStopLossPct > settings.maxStopLossPct, "最小止损距离不得高于最大距离"],
  ] as const) if (invalid) context.addIssue({ code: "custom", path: [key], message });
});
export type AlphaAutomationSettings = z.infer<typeof alphaAutomationSettingsSchema>;
export const DEFAULT_ALPHA_AUTOMATION_SETTINGS = Object.freeze(alphaAutomationSettingsSchema.parse({}));
export type AlphaAutomationSource = "anomaly" | "momentum" | "signal" | "risk_pool";
export type AlphaAutomationSide = "LONG" | "SHORT";
export type AlphaAutomationMarket = "spot" | "futures";

export type AlphaAutomationObservation = {
  source: AlphaAutomationSource;
  /** Preserve the original upstream event ID when an observation is copied/derived. */
  evidenceId: string;
  symbol: string;
  side: AlphaAutomationSide | "NEUTRAL";
  /** Momentum ranks have no Alpha score. Never convert a price change or rank into one. */
  score: number | null;
  observedAt: number | null;
  /** Current source collection time, distinct from a signal's original event time. */
  snapshotAt?: number | null;
  sourceStatus?: "live" | "stale" | "unknown" | "unavailable";
  sourceReason?: "SIGNAL_EVENT_TIME_UNKNOWN" | "SOURCE_UNVERIFIED" | "SOURCE_UNAVAILABLE" | "SNAPSHOT_TIME_UNKNOWN" | null;
  poolMembers?: { source: "anomaly" | "momentum" | "signal"; evidenceId: string; snapshotAt: number | null; eventAt: number | null }[];
  dataComplete: boolean;
  /** Legacy display metadata only; it is not an implicit strategy gate. */
  overheated?: boolean;
  riskPoolPriority?: "P1" | "P2" | null;
  /** Count from the original displayed signal collection, before freshness filtering. */
  sameCoinCount?: number | null;
  priceMomentumScore?: number | null;
  volumeAnomalyScore?: number | null;
};
export type AlphaAutomationMarketSnapshot = {
  symbol: string;
  market: AlphaAutomationMarket;
  tradable: boolean;
  observedAt: number;
  quoteAt: number;
  bid: number;
  ask: number;
  /** Volume on the exact execution venue/market, never combined spot+perpetual volume. */
  quoteVolume24h: number;
  return15mPct?: number | null;
  return1hPct?: number | null;
  return24hPct?: number | null;
  volumeMultiple?: number | null;
  /** True range ATR from closed bars; the scanner's mean high-low proxy is not sufficient. */
  atrPct: number;
  fundingPct?: number | null;
  oiChangePct?: number | null;
  estimatedSlippagePct: number;
  /** The fresh order-book estimate covers at least this much order notional. */
  liquidityNotional: number;
  /** Per-leg fee reserve: use a verified fee or an explicitly labelled conservative estimate. */
  takerFeePct: number;
  filters: { tickSize: number; stepSize: number; minQty: number; maxQty: number; minNotional: number; maxNotional: number | null };
};
export type AlphaAutomationExposure = { symbol: string; side: AlphaAutomationSide; notional: number; openedAt: number; automationManaged?: boolean };
export type AlphaAutomationAccount = {
  observedAt: number;
  equity: number;
  dayStartEquity: number;
  /** Same UTC trading day; realized + unrealized change and paid fees/funding. */
  dailyPnl: number;
  availableMargin: number;
  openPositions: readonly AlphaAutomationExposure[];
  /** Include submitted/partial/unknown entry reservations, not merely filled positions. */
  pendingEntries: readonly AlphaAutomationExposure[];
  reconciliationHealthy: boolean;
  killSwitch: boolean;
  unresolvedOrders: boolean;
};
export type AlphaAutomationRecentEntry = { symbol: string; side: AlphaAutomationSide; createdAt: number; blocksDedupe: boolean };
export type AlphaAutomationCandidate = {
  symbol: string;
  side: AlphaAutomationSide;
  market: AlphaAutomationMarket;
  /** A signal or risk-pool strategy may have no genuine Alpha score. */
  alphaScore: number | null;
  matchedStrategies: AlphaAutomationStrategy[];
  sources: AlphaAutomationSource[];
  independentSources: Exclude<AlphaAutomationSource, "risk_pool">[];
  evidenceIds: string[];
  entryPrice: number;
  /** This candidate's admissible quote drift, bounded by the user's configured maximum. */
  maxEntryDriftPct: number;
  stopLoss: number;
  takeProfit: number;
  stopLossPct: number;
  quantity: number;
  notional: number;
  leverage: number;
  /** Initial margin plus the same estimated round-trip cost reserve used by the final guard. */
  marginRequired: number;
  estimatedLossWithCosts: number;
  /** Capacity reserved across the entire permitted execution-price interval. */
  worstCaseNotional?: number;
  worstCaseMarginRequired?: number;
  worstCaseLossWithCosts?: number;
  /** Pass this exact percentage into the existing risk engine, which otherwise resizes the order. */
  riskPct: number;
  maxHoldingMinutes: number;
  /** Original signal and full-market evidence expiry; quote refresh must never extend it. */
  evidenceExpiresAt: number;
  expiresAt: number;
  dedupeKey: string;
  source: string;
};
export type AlphaAutomationSelection = {
  version: string;
  enabled: boolean;
  blockedReason: string | null;
  candidates: AlphaAutomationCandidate[];
  parameterWarnings: AlphaAutomationParameterWarning[];
  rejections: { symbol: string; reason: string; message?: string; details?: Record<string, unknown> }[];
};
export type AlphaAutomationParameterWarning = { code: string; message: string; details: Record<string, unknown> };

function configurationEntryDriftPct(settings: AlphaAutomationSettings) {
  const minimum = settings.minStopLossPct / 100, maximum = settings.maxStopLossPct / 100;
  // The slippage setting is an upper bound, not a requirement to support the
  // full interval. Keep 10% headroom inside both directional stop bands.
  const band = Math.max(0, Math.min((maximum - minimum) / (2 - minimum - maximum),
    (maximum - minimum) / (2 + minimum + maximum))) * 0.9;
  return Math.min(settings.maxSlippagePct, band * 100);
}

/** Explain a narrower execution window without invalidating or rewriting a saved live configuration. */
export function diagnoseAlphaAutomationSettings(settings: AlphaAutomationSettings): AlphaAutomationParameterWarning[] {
  const maxEntryDriftPct = configurationEntryDriftPct(settings);
  if (maxEntryDriftPct >= settings.maxSlippagePct - 1e-9) return [];
  return [{ code: "PRICE_WINDOW_NARROWED",
    message: `为保持 ${settings.minStopLossPct}%–${settings.maxStopLossPct}% 止损范围，候选执行价格窗口将从配置上限 ±${settings.maxSlippagePct}% 收紧至最多 ±${maxEntryDriftPct.toFixed(4)}%。${maxEntryDriftPct === 0 ? "最小与最大止损相等，仅报价无漂移且价格步长可精确满足时才可能执行。" : ""}实际 ATR 和价格步长可能进一步收紧窗口；ATR 所需止损超过上限仍会拒绝。当前配置未被修改。`,
    details: { minStopLossPct: settings.minStopLossPct, maxStopLossPct: settings.maxStopLossPct, maxSlippagePct: settings.maxSlippagePct,
      maxEntryDriftPct, candidateSpecificAtrAndTickCheckRequired: true } }];
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const positive = (value: unknown): value is number => finite(value) && value > 0;
const nonnegative = (value: unknown): value is number => finite(value) && value >= 0;
const fresh = (value: unknown, now: number, maxAge: number) => finite(value) && value > 0 && value <= now && now - value <= maxAge;
const sources: AlphaAutomationSource[] = ["anomaly", "momentum", "signal", "risk_pool"];
export function normalizeAlphaAutomationSymbol(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const compact = value.trim().toUpperCase().replace(/(?:\/|-)USDT$/, "USDT");
  if (!/^[A-Z0-9]{2,25}$/.test(compact)) return null;
  const symbol = compact.endsWith("USDT") ? compact : `${compact}USDT`;
  return ["USDTUSDT", "USDCUSDT", "BUSDUSDT", "FDUSDUSDT", "TUSDUSDT", "DAIUSDT"].includes(symbol) ? null : symbol;
}
function increment(value: number, step: number, up: boolean) {
  const units = value / step;
  const rounded = (up ? Math.ceil(units - 1e-10) : Math.floor(units + 1e-10)) * step;
  return Number(rounded.toPrecision(14));
}

function candidateProtectionWindow(entryPrice: number, desiredStopPct: number, side: AlphaAutomationSide, settings: AlphaAutomationSettings, tickSize: number) {
  const maximum = settings.maxStopLossPct / 100, desired = desiredStopPct / 100;
  const atrBand = Math.max(0, (maximum - desired) / (side === "LONG" ? 1 - maximum : 1 + maximum)) * 0.9 * 100;
  const cap = Math.min(configurationEntryDriftPct(settings), atrBand);
  const direction = side === "LONG" ? 1 : -1;
  const evaluate = (maxEntryDriftPct: number) => {
    const priceLow = entryPrice * (1 - maxEntryDriftPct / 100), priceHigh = entryPrice * (1 + maxEntryDriftPct / 100);
    const stopLower = side === "LONG" ? priceHigh * (1 - maximum)
      : Math.max(entryPrice * (1 + desired), priceHigh * (1 + settings.minStopLossPct / 100));
    const stopUpper = side === "LONG" ? Math.min(entryPrice * (1 - desired), priceLow * (1 - settings.minStopLossPct / 100))
      : priceLow * (1 + maximum);
    const stopLoss = increment(side === "LONG" ? stopUpper : stopLower, tickSize, side === "SHORT");
    const stopLossPct = Math.abs(entryPrice - stopLoss) / entryPrice * 100;
    const valid = stopLower <= stopUpper + 1e-10 && positive(stopLoss) && stopLossPct >= desiredStopPct - 1e-9
      && [priceLow, priceHigh].every(price => {
        const distancePct = Math.abs(price - stopLoss) / price * 100;
        return (price - stopLoss) * direction > 0 && distancePct >= settings.minStopLossPct - 1e-9 && distancePct <= settings.maxStopLossPct + 1e-9;
      });
    return {maxEntryDriftPct,priceLow,priceHigh,stopLower,stopUpper,stopLoss,stopLossPct,valid};
  };
  const proposed = evaluate(cap);
  if (proposed.valid || cap === 0 || !evaluate(0).valid) return proposed;
  // A coarse tick can consume the continuous interval's headroom. Shrink only
  // the candidate quote window; never round a stop closer than the ATR floor.
  let low = 0, high = cap;
  for (let i = 0; i < 32; i++) {
    const middle = (low + high) / 2;
    if (evaluate(middle).valid) low = middle; else high = middle;
  }
  return evaluate(low * 0.9);
}

type StrategyMatchSettings = Pick<AlphaAutomationSettings, "selectedStrategies" | "minScore" | "maxDataAgeMinutes">;
const strategyNames: Record<AlphaAutomationStrategy, string> = {
  p1_three_source: "P1 三源风控池", p2_two_source: "P2 双源风控池", strong_signal: "无同币标签强信号", same_coin_x2: "同币 ×2 信号", anomaly: "异动排行榜",
};
const strategySources: Record<AlphaAutomationStrategy, AlphaAutomationSource> = {
  p1_three_source: "risk_pool", p2_two_source: "risk_pool", strong_signal: "signal", same_coin_x2: "signal", anomaly: "anomaly",
};
const sourceReasonMessages = {
  SIGNAL_EVENT_TIME_UNKNOWN: "原始信号时间未知，不能确认十分钟时效",
  SOURCE_UNVERIFIED: "数据来源尚未核验", SOURCE_UNAVAILABLE: "数据来源不可用", SNAPSHOT_TIME_UNKNOWN: "当前源快照时间未知",
};
const displayNumber = (value: unknown) => finite(value) ? String(Number(value.toFixed(4))) : "未知";
const snapshotTime = (row: AlphaAutomationObservation) => row.snapshotAt === undefined ? row.observedAt : row.snapshotAt;
const evidenceTime = (row: AlphaAutomationObservation) => row.source === "signal" ? row.observedAt : snapshotTime(row);
const evidenceMaxAge = (row: AlphaAutomationObservation, settings: StrategyMatchSettings) => (row.source === "signal" ? 10 : settings.maxDataAgeMinutes) * 60_000;
const observationExpiry = (row: AlphaAutomationObservation, settings: StrategyMatchSettings) => Math.min(
  (evidenceTime(row) ?? 0) + evidenceMaxAge(row, settings),
  row.source === "signal" && row.snapshotAt !== undefined ? (row.snapshotAt ?? 0) + settings.maxDataAgeMinutes * 60_000 : Infinity,
);

function observationRuleIssues(row: AlphaAutomationObservation, strategy: AlphaAutomationStrategy, settings: StrategyMatchSettings, now: number) {
  const issues: { code: string; message: string }[] = [];
  const add = (code: string, message: string) => { if (!issues.some(issue => issue.code === code)) issues.push({ code, message }); };
  if (!positive(now)) add("INVALID_CONTEXT", "当前判断时间无效");
  if (!normalizeAlphaAutomationSymbol(row.symbol)) add("INVALID_SYMBOL", "标的格式无效");
  if (row.source !== strategySources[strategy]) add("SOURCE_MISMATCH", "当前记录来源不属于此策略");
  if (typeof row.evidenceId !== "string" || !row.evidenceId.trim()) add("EVIDENCE_ID_MISSING", "缺少可核验的来源记录标识");
  if (row.sourceStatus !== undefined && row.sourceStatus !== "live") {
    const status = row.sourceStatus === "stale" || row.sourceStatus === "unknown" || row.sourceStatus === "unavailable" ? row.sourceStatus : null;
    add(status ? `SOURCE_${status.toUpperCase()}` : "SOURCE_STATUS_INVALID", status ? `当前源状态为 ${status}，不能用于匹配` : "当前源状态字段无效");
  }
  if (row.sourceReason !== undefined && row.sourceReason !== null) {
    if (typeof row.sourceReason === "string" && Object.hasOwn(sourceReasonMessages, row.sourceReason)) add(row.sourceReason, sourceReasonMessages[row.sourceReason]);
    else add("SOURCE_REASON_INVALID", "当前源原因字段无效");
  }
  if (row.dataComplete !== true) add("SOURCE_DATA_INCOMPLETE", "当前记录缺少策略所需的可信字段");
  if (!["LONG", "SHORT"].includes(row.side)) add("DIRECTION_UNCLEAR", "方向为中性或未知，不能创建多空候选");
  if (!(row.score === null || (nonnegative(row.score) && row.score <= 100))) add("ALPHA_SCORE_INVALID", "Alpha 分字段无效，未替换为演示分数");
  const maxAge = evidenceMaxAge(row, settings);
  const at = evidenceTime(row);
  if (!positive(at)) add(row.source === "signal" ? "SIGNAL_EVENT_TIME_UNKNOWN" : "SNAPSHOT_TIME_UNKNOWN", row.source === "signal" ? "原始信号时间未知，不能确认十分钟时效" : "当前源快照时间未知");
  else if (at > now) add(row.source === "signal" ? "SIGNAL_EVENT_IN_FUTURE" : "SNAPSHOT_IN_FUTURE", "来源时间在当前时间之后");
  else if (now - at > maxAge) add(row.source === "signal" ? "SIGNAL_TOO_OLD" : "SNAPSHOT_TOO_OLD",
    `${row.source === "signal" ? "原始信号" : "当前源快照"}已过去 ${displayNumber((now - at) / 60_000)} 分钟，超过 ${maxAge / 60_000} 分钟上限`);
  if (row.source === "signal" && row.snapshotAt !== undefined && !fresh(row.snapshotAt, now, settings.maxDataAgeMinutes * 60_000)) {
    add("SOURCE_SNAPSHOT_UNAVAILABLE", "信号源当前快照未知、过期或时间无效");
  }
  if (strategy === "p1_three_source" || strategy === "p2_two_source") {
    const expected = strategy === "p1_three_source" ? "P1" : "P2";
    if (row.riskPoolPriority !== expected) add("POOL_PRIORITY_MISMATCH", `当前池优先级为 ${row.riskPoolPriority === "P1" || row.riskPoolPriority === "P2" ? row.riskPoolPriority : "未知"}，此策略要求 ${expected}`);
  } else if (strategy === "strong_signal" || strategy === "same_coin_x2") {
    if (!Number.isInteger(row.sameCoinCount) || !nonnegative(row.sameCoinCount)) add("SAME_COIN_COUNT_UNKNOWN", "原始信号集合的同币计数未知，不能假定为无标签");
    else if (strategy === "strong_signal" ? row.sameCoinCount !== 0 && row.sameCoinCount !== 1 : row.sameCoinCount !== 2)
      add("SAME_COIN_COUNT_MISMATCH", `原始集合为同币 ×${row.sameCoinCount}，此策略要求${strategy === "strong_signal" ? "无同币标签（0 或 1）" : "严格同币 ×2"}`);
  } else if (strategy === "anomaly") {
    if (!finite(row.score)) add("ALPHA_SCORE_MISSING", "真实 Alpha 分未知");
    else if (!(row.score > 80 && row.score >= settings.minScore)) add("ALPHA_SCORE_BELOW_THRESHOLD", `Alpha 分 ${displayNumber(row.score)}，要求 >80 且 ≥${settings.minScore}`);
    for (const [value, code, label] of [[row.priceMomentumScore, "PRICE_MOMENTUM", "价格动量"], [row.volumeAnomalyScore, "VOLUME_ANOMALY", "成交量异动"]] as const) {
      if (!finite(value)) add(`${code}_SCORE_MISSING`, `${label}真实维度分未知`);
      else if (value > 100 || value < 0) add(`${code}_SCORE_INVALID`, `${label}维度分无效`);
      else if (value <= 89) add(`${code}_BELOW_THRESHOLD`, `${label}分 ${displayNumber(value)}，要求 >89`);
    }
  }
  return issues;
}

function matchingStrategyRows(observations: readonly AlphaAutomationObservation[], settings: StrategyMatchSettings, now: number) {
  return observations.flatMap(observation => {
    if (!observation || !sources.includes(observation.source)) return [];
    const enabledMatches = ALPHA_AUTOMATION_STRATEGIES.filter(strategy => settings.selectedStrategies.includes(strategy)
      && strategySources[strategy] === observation.source && observationRuleIssues(observation, strategy, settings, now).length === 0);
    return enabledMatches.length ? [{ observation, matchedStrategies: enabledMatches }] : [];
  });
}

/** Safe per-symbol explanation: omit upstream event IDs, raw messages and private account data. */
export function diagnoseAlphaAutomationStrategies(observations: readonly AlphaAutomationObservation[], settings: StrategyMatchSettings, now: number) {
  const strategyChecks = ALPHA_AUTOMATION_STRATEGIES.filter(strategy => settings.selectedStrategies.includes(strategy)).map(strategy => {
    const rows = observations.filter(row => row?.source === strategySources[strategy]).map(row => {
      const at = evidenceTime(row);
      const issues = observationRuleIssues(row, strategy, settings, now);
      return { source: row.source, side: ["LONG", "SHORT", "NEUTRAL"].includes(row.side) ? row.side : "UNKNOWN",
        observedAt: finite(row.observedAt) ? row.observedAt : null,
        snapshotAt: finite(row.source === "signal" ? row.snapshotAt : snapshotTime(row)) ? (row.source === "signal" ? row.snapshotAt : snapshotTime(row)) : null,
        ageBasis: row.source === "signal" ? "event" : "snapshot", maxAgeMinutes: evidenceMaxAge(row, settings) / 60_000,
        ageMinutes: positive(at) && at <= now ? (now - at) / 60_000 : null,
        sourceStatus: ["live", "stale", "unknown", "unavailable"].includes(row.sourceStatus ?? "") ? row.sourceStatus : null,
        sourceReason: typeof row.sourceReason === "string" && Object.hasOwn(sourceReasonMessages, row.sourceReason) ? row.sourceReason : null,
        riskPoolPriority: row.riskPoolPriority === "P1" || row.riskPoolPriority === "P2" ? row.riskPoolPriority : null,
        sameCoinCount: nonnegative(row.sameCoinCount) && Number.isInteger(row.sameCoinCount) ? row.sameCoinCount : null,
        alphaScore: finite(row.score) ? row.score : null, priceMomentumScore: finite(row.priceMomentumScore) ? row.priceMomentumScore : null,
        volumeAnomalyScore: finite(row.volumeAnomalyScore) ? row.volumeAnomalyScore : null, matched: issues.length === 0, issues };
    }).sort((a, b) => a.issues.length - b.issues.length || (a.ageMinutes ?? Infinity) - (b.ageMinutes ?? Infinity) || a.side.localeCompare(b.side));
    const matched = rows.some(row => row.matched);
    return { strategy, source: strategySources[strategy], matched,
      message: `${strategyNames[strategy]}：${matched ? "已命中" : rows.length ? rows[0].issues.map(issue => issue.message).join("；") : "当前来源没有此标的的可核验记录"}`,
      observationCount: rows.length, observations: rows.slice(0, 10), truncated: rows.length > 10,
      ...(rows.length ? {} : { issues: [{ code: "SOURCE_OBSERVATION_MISSING", message: "当前来源没有此标的的可核验记录" }] }) };
  });
  const matched = matchingStrategyRows(observations, settings, now);
  return { selectedStrategies: [...settings.selectedStrategies], strategyChecks,
    conflictingDirections: new Set(matched.map(row => row.observation.side)).size > 1 };
}

/** Shared by market prefetch and final selection. Call per symbol; enabled grants no access here. */
export function matchAlphaAutomationStrategies(observations: readonly AlphaAutomationObservation[], settings: StrategyMatchSettings, now: number) {
  const matched = matchingStrategyRows(observations, settings, now);
  if (!matched.length) return null;
  const symbols = new Set(matched.map(row => normalizeAlphaAutomationSymbol(row.observation.symbol)!));
  const sides = new Set(matched.map(row => row.observation.side));
  if (symbols.size !== 1 || sides.size !== 1) return null;
  const ordered = matched.map(row => row.observation).sort((a, b) => sources.indexOf(a.source) - sources.indexOf(b.source)
    || (evidenceTime(b) ?? 0) - (evidenceTime(a) ?? 0) || a.evidenceId.localeCompare(b.evidenceId));
  return { symbol: [...symbols][0], side: ordered[0].side as AlphaAutomationSide,
    matchedStrategies: ALPHA_AUTOMATION_STRATEGIES.filter(strategy => matched.some(row => row.matchedStrategies.includes(strategy))),
    observations: ordered };
}

const rejectionMessages: Record<string, string> = {
  SPOT_SHORT_UNSUPPORTED: "现货市场不支持裸卖空",
  SYMBOL_ALREADY_EXPOSED: "此标的已有持仓或未决开仓订单",
  DUPLICATE_SYMBOL_DIRECTION: "同一标的与方向仍在开仓间隔内",
  MARKET_SNAPSHOT_MISSING_OR_AMBIGUOUS: "缺少唯一的当前执行市场行情快照",
  MARKET_DATA_INVALID_OR_STALE: "执行行情、ATR 或交易所过滤器存在缺失、无效或过期字段",
  INSUFFICIENT_QUOTE_VOLUME: "执行市场的 24 小时成交额低于配置下限",
  EXECUTION_FRICTION_TOO_HIGH: "实际价差或预估滑点超过配置上限",
  PROTECTION_FILTERS_INVALID: "量化后的保护单价格无法满足当前交易所规则",
  ORDER_BELOW_EXCHANGE_MINIMUM: "按风险、保证金和名义额度向下量化后，订单不足交易所最小数量或金额",
};

/** Pure selection only. Callers must atomically reserve a run, reprice, revalidate, and use the authenticated risk/execution service. */
export function selectAlphaAutomationCandidates(input: {
  settings?: unknown;
  now: number;
  market: AlphaAutomationMarket;
  observations: readonly AlphaAutomationObservation[];
  markets: readonly AlphaAutomationMarketSnapshot[];
  account: AlphaAutomationAccount;
  recentEntries: readonly AlphaAutomationRecentEntry[];
  lastOrderAt: number | null;
}): AlphaAutomationSelection {
  const result: AlphaAutomationSelection = { version: ALPHA_AUTOMATION_STRATEGY_VERSION, enabled: false, blockedReason: null, candidates: [], parameterWarnings: [], rejections: [] };
  const parsed = alphaAutomationSettingsSchema.safeParse(input.settings ?? {});
  const block = (reason: string) => { result.blockedReason = reason; return result; };
  if (!parsed.success) return block("INVALID_SETTINGS");
  const settings = parsed.data;
  result.enabled = settings.enabled;
  result.parameterWarnings = diagnoseAlphaAutomationSettings(settings);
  if (!settings.enabled) return block("AUTOMATION_DISABLED");
  const {now, account} = input;
  if (!positive(now) || !["spot", "futures"].includes(input.market)) return block("INVALID_CONTEXT");
  const maxAge = settings.maxDataAgeMinutes * 60_000;
  const quoteAge = settings.maxQuoteAgeSeconds * 1000;
  if (!account || !positive(account.equity) || !positive(account.dayStartEquity) || !finite(account.dailyPnl)
    || !nonnegative(account.availableMargin) || !fresh(account.observedAt, now, quoteAge)
    || !Array.isArray(account.openPositions) || !Array.isArray(account.pendingEntries)
    || typeof account.killSwitch !== "boolean" || typeof account.unresolvedOrders !== "boolean") return block("ACCOUNT_DATA_UNAVAILABLE");
  if (account.killSwitch) return block("KILL_SWITCH_ACTIVE");
  if (account.reconciliationHealthy !== true || account.unresolvedOrders) return block("RECONCILIATION_REQUIRED");
  if (account.dailyPnl <= -account.dayStartEquity * settings.dailyLossLimitPct / 100) return block("DAILY_LOSS_LIMIT");
  const exposures = [...account.openPositions, ...account.pendingEntries];
  if (exposures.some(position => !position || !normalizeAlphaAutomationSymbol(position.symbol) || !["LONG", "SHORT"].includes(position.side)
    || !positive(position.notional) || !positive(position.openedAt) || position.openedAt > now)) return block("EXPOSURE_DATA_UNAVAILABLE");
  if (account.openPositions.some(position => position.automationManaged === true && now - position.openedAt >= settings.maxHoldingMinutes * 60_000)) return block("EXPIRED_POSITION_REQUIRES_EXIT");
  if (exposures.length >= settings.maxPositions) return block("POSITION_LIMIT");
  if (!Array.isArray(input.recentEntries) || input.recentEntries.some(entry => !entry || !normalizeAlphaAutomationSymbol(entry.symbol)
    || !["LONG", "SHORT"].includes(entry.side) || !positive(entry.createdAt) || entry.createdAt > now || typeof entry.blocksDedupe !== "boolean")) return block("ORDER_HISTORY_UNAVAILABLE");
  if (input.lastOrderAt !== null && (!positive(input.lastOrderAt) || input.lastOrderAt > now)) return block("ORDER_HISTORY_UNAVAILABLE");
  const lastBlockingEntry = Math.max(input.lastOrderAt ?? 0, ...input.recentEntries.filter(entry => entry.blocksDedupe).map(entry => entry.createdAt));
  if (lastBlockingEntry > 0 && now - lastBlockingEntry < settings.minOrderGapMinutes * 60_000) return block("ORDER_COOLDOWN");
  if (!Array.isArray(input.observations) || !Array.isArray(input.markets)) return block("MARKET_DATA_UNAVAILABLE");
  let remainingNotional = Math.min(settings.maxPortfolioNotional, account.equity * settings.maxPortfolioEquityPct / 100)
    - exposures.reduce((sum, position) => sum + position.notional, 0);
  if (!(remainingNotional > 0)) return block("PORTFOLIO_LIMIT");
  let remainingMargin = account.availableMargin;
  const grouped = new Map<string, AlphaAutomationObservation[]>();
  for (const observation of input.observations) {
    const symbol = normalizeAlphaAutomationSymbol(observation?.symbol);
    if (!symbol) { result.rejections.push({symbol: "UNKNOWN", reason: "INVALID_SYMBOL"}); continue; }
    const rows = grouped.get(symbol) ?? [];
    rows.push(observation); grouped.set(symbol, rows);
  }
  const preliminary: AlphaAutomationCandidate[] = [];
  for (const [symbol, rows] of grouped) {
    const match = matchAlphaAutomationStrategies(rows, settings, now);
    let diagnostics: ReturnType<typeof diagnoseAlphaAutomationStrategies> | undefined;
    const diagnose = () => diagnostics ??= diagnoseAlphaAutomationStrategies(rows, settings, now);
    const reject = (reason: string, message?: string, details?: Record<string, unknown>) => {
      const explanation = diagnose();
      const matched = explanation.strategyChecks.filter(check => check.matched).map(check => check.strategy);
      const matchedPrefix = matched.length ? `${matched.map(strategy => strategyNames[strategy]).join("、")}已命中；` : "";
      result.rejections.push({ symbol, reason,
        message: message ?? `${matchedPrefix}${rejectionMessages[reason] ?? "当前候选未通过执行风控"}`,
        details: { ...explanation, matchedStrategies: matched, ...details } });
    };
    if (!match) {
      const explanation = diagnose();
      const conflict = explanation.conflictingDirections;
      reject(conflict ? "CONFLICTING_DIRECTIONS" : "NO_SELECTED_STRATEGY_MATCH", conflict
        ? "已选策略同时命中多空方向，需等待方向一致后再创建候选"
        : explanation.strategyChecks.map(check => check.message).join("；"));
      continue;
    }
    const { side, observations: directional, matchedStrategies } = match;
    const independent: Exclude<AlphaAutomationSource, "risk_pool">[] = [];
    const evidence = new Set<string>();
    let alphaScore: number | null = null;
    // Provenance is descriptive, not an extra consensus or global score gate.
    for (const row of directional) {
      if (row.score !== null) alphaScore = Math.max(alphaScore ?? row.score, row.score);
      if (evidence.has(row.evidenceId)) continue;
      evidence.add(row.evidenceId);
      if (row.source !== "risk_pool" && !independent.includes(row.source)) independent.push(row.source);
    }
    if (input.market === "spot" && side === "SHORT") { reject("SPOT_SHORT_UNSUPPORTED"); continue; }
    if (exposures.some(position => normalizeAlphaAutomationSymbol(position.symbol) === symbol)) { reject("SYMBOL_ALREADY_EXPOSED"); continue; }
    if (input.recentEntries.some(entry => entry.blocksDedupe && normalizeAlphaAutomationSymbol(entry.symbol) === symbol
      && entry.side === side && now - entry.createdAt < settings.minOrderGapMinutes * 60_000)) { reject("DUPLICATE_SYMBOL_DIRECTION"); continue; }
    const snapshots = input.markets.filter(market => normalizeAlphaAutomationSymbol(market?.symbol) === symbol && market.market === input.market);
    if (snapshots.length !== 1) { reject("MARKET_SNAPSHOT_MISSING_OR_AMBIGUOUS"); continue; }
    const market = snapshots[0];
    const f = market.filters;
    if (market.tradable !== true || !fresh(market.observedAt, now, maxAge) || !fresh(market.quoteAt, now, quoteAge)
      || !positive(market.bid) || !positive(market.ask) || market.ask < market.bid
      || !positive(market.quoteVolume24h) || !positive(market.atrPct) || !nonnegative(market.estimatedSlippagePct)
      || !positive(market.liquidityNotional) || !nonnegative(market.takerFeePct) || market.takerFeePct > 1
      || !f || !positive(f.tickSize) || !positive(f.stepSize) || !nonnegative(f.minQty) || !positive(f.maxQty)
      || f.maxQty < f.minQty || !nonnegative(f.minNotional) || !(f.maxNotional === null || positive(f.maxNotional))) { reject("MARKET_DATA_INVALID_OR_STALE"); continue; }
    const spreadPct = (market.ask - market.bid) / ((market.ask + market.bid) / 2) * 100;
    if (market.quoteVolume24h < settings.minQuoteVolume24h) {
      reject("INSUFFICIENT_QUOTE_VOLUME", undefined, { quoteVolume24h: market.quoteVolume24h, minQuoteVolume24h: settings.minQuoteVolume24h }); continue;
    }
    if (spreadPct > settings.maxSpreadPct || market.estimatedSlippagePct > settings.maxSlippagePct) {
      reject("EXECUTION_FRICTION_TOO_HIGH", undefined, { spreadPct, maxSpreadPct: settings.maxSpreadPct,
        estimatedSlippagePct: market.estimatedSlippagePct, maxSlippagePct: settings.maxSlippagePct }); continue;
    }
    const direction = side === "LONG" ? 1 : -1;
    const entryPrice = side === "LONG" ? market.ask : market.bid;
    const desiredStopPct = Math.max(settings.minStopLossPct, market.atrPct * settings.atrStopMultiplier);
    const protectionDetails = { side, atrPct: market.atrPct, atrStopMultiplier: settings.atrStopMultiplier,
      requiredStopLossPct: desiredStopPct, minStopLossPct: settings.minStopLossPct, maxStopLossPct: settings.maxStopLossPct,
      maxSlippagePct: settings.maxSlippagePct, entryPrice };
    const matchedLabel = matchedStrategies.map(strategy => strategyNames[strategy]).join("、");
    if (desiredStopPct > settings.maxStopLossPct) {
      reject("ATR_STOP_EXCEEDS_LIMIT", `${matchedLabel}已命中；ATR ${displayNumber(market.atrPct)}% × ${displayNumber(settings.atrStopMultiplier)} 要求止损 ${displayNumber(desiredStopPct)}%，超过配置最大止损 ${displayNumber(settings.maxStopLossPct)}%`, protectionDetails); continue;
    }
    const protection = candidateProtectionWindow(entryPrice, desiredStopPct, side, settings, f.tickSize);
    const {maxEntryDriftPct,priceLow,priceHigh,stopLower,stopUpper,stopLoss,stopLossPct} = protection;
    if (!protection.valid) {
      reject("PROTECTION_PRICE_RANGE_UNAVAILABLE",
        `${matchedLabel}已命中；保留 ATR 止损 ${displayNumber(desiredStopPct)}% 并收紧执行价格窗口后，交易所价格步长仍无法在 ${displayNumber(settings.minStopLossPct)}%–${displayNumber(settings.maxStopLossPct)}% 止损范围内生成有效保护单`,
        {...protectionDetails,maxEntryDriftPct,priceLow,priceHigh,stopPriceLowerBound:stopLower,stopPriceUpperBound:stopUpper,
          tickSize:f.tickSize,quantizedStopLoss:stopLoss,parameterWarnings:result.parameterWarnings}); continue;
    }
    const stopDistance = Math.abs(entryPrice - stopLoss);
    // Reserve both legs at permitted friction limits, including the final
    // guard's 0.12% minimum. This is a budget estimate, not observed paid fees.
    const costPct = Math.max(0.12, 2 * (market.takerFeePct + settings.maxSlippagePct) + settings.maxSpreadPct);
    const costRate = costPct / 100;
    const worstEntry = side === "LONG" ? priceHigh : priceLow;
    const worstEntryCost = worstEntry * costRate;
    const worstEntryLoss = Math.abs(worstEntry - stopLoss) + worstEntryCost;
    const takeProfit = increment(worstEntry + direction * (worstEntryLoss * settings.minRiskRewardRatio + worstEntryCost), f.tickSize, side === "LONG");
    if (!positive(takeProfit) || [priceLow, priceHigh].some(price => (takeProfit - price) * direction <= 0)) { reject("PROTECTION_FILTERS_INVALID"); continue; }
    const leverage = input.market === "spot" ? 1 : settings.leverage;
    const notionalCap = Math.min(settings.orderNotional, settings.maxOrderNotional, remainingNotional, market.liquidityNotional, f.maxNotional ?? Infinity);
    const worstLossPerUnit = Math.max(...[priceLow, priceHigh].map(price => Math.abs(price - stopLoss) + price * costRate));
    const worstMarginPerUnit = priceHigh * (1 / leverage + costRate);
    const quantity = increment(Math.min(notionalCap / priceHigh, remainingMargin / worstMarginPerUnit,
      account.equity * settings.riskPerTradePct / 100 / worstLossPerUnit, f.maxQty), f.stepSize, false);
    const notional = quantity * entryPrice;
    const worstCaseNotional = quantity * priceHigh;
    const worstCaseMarginRequired = quantity * worstMarginPerUnit;
    if (!positive(quantity) || quantity < f.minQty || quantity * priceLow < Math.max(5, f.minNotional)
      || worstCaseNotional > notionalCap + 1e-8) { reject("ORDER_BELOW_EXCHANGE_MINIMUM"); continue; }
    const independentSources = independent;
    const evidenceExpiry = Math.max(...directional.map(row => observationExpiry(row, settings)));
    preliminary.push({symbol,side,market:input.market,alphaScore,matchedStrategies,sources:sources.filter(source => directional.some(row => row.source === source)),independentSources,
      evidenceIds:[...evidence].sort(),entryPrice,maxEntryDriftPct,stopLoss,takeProfit,stopLossPct,quantity,notional,leverage,marginRequired:notional/leverage+notional*costPct/100,
      estimatedLossWithCosts:quantity*stopDistance+notional*costRate,worstCaseNotional,worstCaseMarginRequired,
      worstCaseLossWithCosts:quantity*worstLossPerUnit,riskPct:notional*stopLossPct/account.equity,maxHoldingMinutes:settings.maxHoldingMinutes,
      evidenceExpiresAt:Math.min(market.observedAt+maxAge, evidenceExpiry),
      expiresAt:Math.min(market.quoteAt+quoteAge, market.observedAt+maxAge, evidenceExpiry),dedupeKey:`${symbol}|${side}`,
      source:`alpha-automation:${matchedStrategies.join("+")}`});
  }
  preliminary.sort((a,b)=>b.matchedStrategies.length-a.matchedStrategies.length || (b.alphaScore ?? -1)-(a.alphaScore ?? -1) || a.symbol.localeCompare(b.symbol));
  for (const candidate of preliminary) {
    if (result.candidates.length >= settings.maxOrdersPerRun) break;
    if (exposures.length + result.candidates.length >= settings.maxPositions) break;
    const reservedNotional = candidate.worstCaseNotional ?? candidate.notional;
    const reservedMargin = candidate.worstCaseMarginRequired ?? candidate.marginRequired;
    if (reservedNotional > remainingNotional + 1e-8 || reservedMargin > remainingMargin + 1e-8) {
      result.rejections.push({symbol:candidate.symbol,reason:"RUN_RESERVATION_LIMIT",
        message:"策略已命中，但本轮其他候选已占用可用名义额度或保证金",
        details:{matchedStrategies:candidate.matchedStrategies,remainingNotional,remainingMargin,reservedNotional,reservedMargin}}); continue;
    }
    result.candidates.push(candidate);
    remainingNotional -= reservedNotional; remainingMargin -= reservedMargin;
  }
  if (!result.candidates.length) result.blockedReason = "NO_ELIGIBLE_CANDIDATE";
  return result;
}
