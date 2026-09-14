import "server-only";
import { createHash } from "node:crypto";
import { NextRequest, type NextResponse } from "next/server";
import { Prisma, type BstockAutoConfig, type BstockAutoOrder } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AGENT_SESSION_COOKIE, decodeAgentSession, encodeAgentSession, type AgentSessionState } from "@/lib/bstock-agentic-wallet-auth";
import { agentSessionKey, agentWalletOwnerKey } from "@/lib/bstock-agentic-wallet-client";
import { fetchAgentWalletData, walletSnapshotDto } from "@/lib/bstock-agentic-wallet-data";
import { fetchOfficialBstockMarket, fetchCmcLiveSnapshot, fetchBstockMarketHistory, compareDecimals, multiplyDecimals, resolveBstockSellRawAmount } from "@/lib/bstock-alpha-live";
import { AUTO_STRATEGY_VERSION, autoSettingsSchema, selectAutoSignal, selectAutoExit, assessAutoQuoteFriction, type AutoSettings } from "@/lib/bstock-auto-strategy";
import { AUTO_PENDING, acquireAutoLease, autoEvent, jsonValue, pauseAuto, safeAutoError, withAutoLock } from "@/lib/bstock-auto-data";
import { handleBstockTradingQuote } from "@/lib/bstock-trading-quote-handler";
import { handleBstockTradingExecute } from "@/lib/bstock-trading-execute-handler";
import { handleBstockTradingStatus } from "@/lib/bstock-trading-status-handler";
import { readAutoGasCost, readAutoSettlement } from "@/lib/bstock-auto-settlement";

type Market = Awaited<ReturnType<typeof fetchOfficialBstockMarket>>;
type Asset = Market["assets"][number];
type Candidate = { asset: Asset; signal: ReturnType<typeof selectAutoSignal>; reportId: string; reportCompletedAt: string };
type Quote = { intent: string; tradeRecordId: string; toAmount: string; feeUsd: number; gasUsd: number; expiresAt: number; notionalUsd: number; decision: unknown };
const number = (value: unknown) => {
  const result = Number(value);
  if (value == null || value === "" || typeof value === "boolean" || !Number.isFinite(result)) throw new Error("自动交易数值数据无效");
  return result;
};
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const timestamp = (value: unknown): number => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" || (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value))) {
    const result = Number(value);
    return Number.isFinite(result) && result > 0 ? (result < 1e12 ? result * 1000 : result) : NaN;
  }
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
};
const fresh = (date: unknown, maxAge: number) => {
  const age = Date.now() - timestamp(date);
  return Number.isFinite(age) && age >= -60_000 && age <= maxAge;
};

async function validateSession(config: BstockAutoConfig, state: AgentSessionState) {
  if (state.stage !== "connected" || !state.agentSessionId || !state.walletAddress ||
    !Number.isFinite(state.sessionExpireAt) || state.sessionExpireAt <= Date.now() ||
    state.walletAddress.toLowerCase() !== config.walletAddress.toLowerCase() || agentWalletOwnerKey(state.walletAddress) !== config.ownerKey) {
    await pauseAuto(config.ownerKey, config.generation!, "自动交易钱包身份或会话已失效，请重新扫码授权", "SESSION_INVALID");
    throw new Error("自动交易钱包身份或会话已失效");
  }
}

function internalRequest(state: AgentSessionState, body: unknown) {
  return new NextRequest("https://bstock.internal/api/bstock-alpha/trading", { method: "POST",
    headers: { origin: "https://bstock.internal", host: "bstock.internal", "content-type": "application/json", cookie: `${AGENT_SESSION_COOKIE}=${encodeAgentSession(state)}` },
    body: JSON.stringify(body) });
}
async function invoke<T>(config: BstockAutoConfig, state: AgentSessionState, handler: (request: NextRequest) => Promise<NextResponse>, body: unknown) {
  const response = await handler(internalRequest(state, body));
  const cookie = response.cookies.get(AGENT_SESSION_COOKIE)?.value;
  if (cookie) {
    state = decodeAgentSession(cookie);
    await saveSession(config, state);
  }
  const payload = await response.json();
  if (!response.ok) throw new Error(String(payload.error || "订单服务请求失败"));
  return { state, data: payload as T };
}
async function saveSession(config: BstockAutoConfig, state: AgentSessionState) {
  await validateSession(config, state);
  await prisma.bstockAutoConfig.updateMany({ where: { ownerKey: config.ownerKey, generation: config.generation },
    data: { sessionEncrypted: encodeAgentSession(state) } });
}

export async function scanAutoCandidates(ownerKey: string, sessionKey: string, settings: AutoSettings, market?: Market) {
  market ??= await fetchOfficialBstockMarket();
  if (!market.registrySourceAvailable || market.deliveryMode === "CACHE_STALE" || !fresh(market.fetchedAt, 120_000)) {
    throw new Error("官方标的或行情数据过期，等待实时数据恢复");
  }
  const reports = await prisma.bstockResearchJob.findMany({ where: { status: "succeeded", reportMarkdown: { not: null },
    completedAt: { gte: new Date(Date.now() - 7 * 86400_000) }, OR: [{ ownerKey }, { ownerKey: null, agentKey: sessionKey }] },
    orderBy: { completedAt: "desc" }, select: { id: true, symbol: true, completedAt: true }, take: 200 });
  const byTicker = new Map<string, typeof reports[number]>();
  for (const report of reports) if (!byTicker.has(report.symbol)) byTicker.set(report.symbol, report);
  const reviewed = market.assets.filter(asset => !asset.leveragedOrInverse && asset.price != null && Number.isFinite(asset.price) && asset.price > 0
    && Number.isFinite(asset.quoteVolume) && (asset.quoteVolume || 0) >= 100_000 && fresh(asset.marketUpdatedAt, 120_000) && byTicker.has(asset.ticker))
    .sort((a, b) => (b.quoteVolume || 0) - (a.quoteVolume || 0));
  // Bounded parallel reads; the rest of the pool rotates by hour to avoid starvation.
  const offset = reviewed.length > 10 ? Math.floor(Date.now() / 3_600_000) % Math.ceil(reviewed.length / 10) * 10 : 0;
  const batch = reviewed.slice(offset, offset + 10);
  const evaluated = await Promise.all(batch.map(async asset => {
    try {
      const history = await fetchBstockMarketHistory(asset.symbol, "1h");
      if (history.deliveryMode === "CACHE_STALE" || !fresh(history.fetchedAt, 120_000)) return { symbol: asset.symbol, reason: "HISTORY_STALE" };
      const signal = selectAutoSignal({ points: history.points, now: Date.now(), ...settings });
      const report = byTicker.get(asset.ticker)!;
      return { asset, signal, reportId: report.id, reportCompletedAt: report.completedAt!.toISOString() };
    } catch { return { symbol: asset.symbol, reason: "HISTORY_UNAVAILABLE" }; }
  }));
  const candidates = evaluated.filter((value): value is Candidate =>
    "asset" in value && Boolean(value.asset) && "signal" in value && Boolean(value.signal))
    .sort((a, b) => b.signal.score - a.signal.score);
  return { candidates, diagnostics: { pool: market.assets.length, qualified: reviewed.length, scanned: batch.length,
    excluded: market.assets.length - reviewed.length, reportMaxAgeDays: 7,
    evaluations: evaluated.map(item => "asset" in item && item.asset && "signal" in item && item.signal
      ? { symbol: item.asset.symbol, ...item.signal, reportId: item.reportId }
      : item) } };
}

async function reconcileOrder(config: BstockAutoConfig, state: AgentSessionState, order: BstockAutoOrder, market: Market) {
  const record = order.tradeRecordId ? await prisma.bstockTradeRecord.findUnique({ where: { id: order.tradeRecordId } }) : null;
  const evidence = object(order.decision);
  const finishFailed = async (orderId?: string | null, txHash?: string | null) => {
    const gas = txHash ? await readAutoGasCost({ txHash, walletAddress: config.walletAddress, bnbPriceUsd: number(evidence.bnbPriceUsd) }) : null;
    await prisma.bstockAutoOrder.update({ where: { id: order.id }, data: { status: "FAILED", completedAt: new Date(),
      ...(orderId ? { orderId } : {}), ...(txHash ? { txHash } : {}),
      decision: jsonValue({ ...evidence, settlement: gas || { gasUsd: number(order.gasEstimateUsd || 0), gasValuationSource: "FAILED_ORDER_CONSERVATIVE_ESTIMATE" } }) } });
    await autoEvent(config.ownerKey, config.generation, "ORDER_FAILED", "钱包拒绝订单或链上执行失败", { symbol: order.symbol, side: order.side, ...(orderId ? { orderId } : {}), metadata: { gas } });
  };
  if (record && ["REJECTED", "FAILED"].includes(record.status)) {
    await finishFailed(order.orderId || record.orderId, record.txHash);
    return state;
  }
  if (["QUOTING", "QUOTED"].includes(order.status) && (!record || record.status === "INTENT_CREATED")) {
    await prisma.bstockAutoOrder.update({ where: { id: order.id }, data: { status: "SKIPPED", error: "未广播的中断报价已取消", completedAt: new Date() } });
    return state;
  }
  const orderId = order.orderId || record?.orderId;
  if (!orderId) {
    await prisma.bstockAutoOrder.update({ where: { id: order.id }, data: { status: "UNKNOWN", error: "提交结果未知，禁止重复广播" } });
    await pauseAuto(config.ownerKey, config.generation!, "订单提交结果未知，请核对钱包订单记录后处理；自动交易已暂停", "UNKNOWN");
    return state;
  }
  const result = await invoke<{ final: boolean; successful: boolean; txHash: string | null; matchStrategy: string; createdAt: string | number | null }>(config, state,
    request => handleBstockTradingStatus(request, { automation: true }), { orderId });
  state = result.state;
  await prisma.bstockAutoOrder.update({ where: { id: order.id }, data: { orderId, status: "PENDING" } });
  if (!result.data.final) {
    if (Date.now() - (order.submittedAt || order.createdAt).getTime() > 15 * 60_000) await pauseAuto(config.ownerKey, config.generation!, "订单确认超过 15 分钟，已暂停新单并继续核对回执", "PENDING");
    return state;
  }
  // Similar history rows are diagnostic candidates, not this order's identity.
  // Reject them before either failure finalization or successful settlement.
  if (!["ORDER_ID", "TX_HASH"].includes(result.data.matchStrategy)) {
    throw new Error("订单身份尚未精确匹配，保留待确认状态并继续核对");
  }
  if (!result.data.successful) {
    await finishFailed(orderId, result.data.txHash);
    return state;
  }
  const asset = market.assets.find(a => a.symbol === order.symbol);
  if (!asset || !result.data.txHash || !record) throw new Error("成交证据不完整，继续等待账户资金流回执");
  const recordedAsset = object(evidence.asset);
  if (typeof recordedAsset.contractAddress !== "string" || recordedAsset.contractAddress.toLowerCase() !== asset.contractAddress.toLowerCase()
    || typeof recordedAsset.multiplier !== "string" || compareDecimals(recordedAsset.multiplier, asset.multiplier) !== 0) {
    await pauseAuto(config.ownerKey, config.generation!, "标的合约或拆股倍率已变化，等待核对订单资产单位", "RECONCILIATION_REQUIRED");
    throw new Error("成交期间标的元数据变化，不能直接入账");
  }
  const settlement = await readAutoSettlement({ txHash: result.data.txHash, walletAddress: config.walletAddress,
    contractAddress: asset.contractAddress, multiplier: asset.multiplier, side: order.side,
    usdtPriceUsd: number(evidence.usdtPriceUsd), bnbPriceUsd: number(evidence.bnbPriceUsd) });
  const actualInput = order.side === "buy" ? number(settlement.paymentAmount) : number(settlement.quantity);
  if (actualInput <= 0 || number(settlement.quantity) <= 0 || number(settlement.usd) <= 0 || number(settlement.gasUsd) < 0 || number(order.requestedAmount) <= 0) {
    throw new Error("链上结算金额或费用无效");
  }
  if (Math.abs(actualInput - number(order.requestedAmount)) / number(order.requestedAmount) > 0.005) {
    throw new Error("链上实际支出与自动订单不匹配，暂停重复下单并核对");
  }
  await withAutoLock(config.ownerKey, async tx => {
    const freshOrder = await tx.bstockAutoOrder.findUnique({ where: { id: order.id } });
    if (!freshOrder || freshOrder.status === "FINISHED") return;
    const quantity = new Prisma.Decimal(settlement.quantity);
    const usd = new Prisma.Decimal(settlement.usd);
    let pnl: Prisma.Decimal | null = null;
    if (order.side === "buy") {
      const existing = await tx.bstockAutoPosition.findUnique({ where: { ownerKey_symbol: { ownerKey: config.ownerKey, symbol: order.symbol } } });
      if (existing && number(existing.quantity) > 0) throw new Error("自动仓位已存在，禁止重复入账");
      const position = { quantity: settlement.quantity, costUsd: usd, highPrice: usd.div(quantity), strategy: order.strategy,
        contractAddress: asset.contractAddress, multiplier: asset.multiplier, entryOrderId: order.id };
      await tx.bstockAutoPosition.upsert({ where: { ownerKey_symbol: { ownerKey: config.ownerKey, symbol: order.symbol } },
        create: { ownerKey: config.ownerKey, symbol: order.symbol, ...position }, update: position });
    } else {
      const position = await tx.bstockAutoPosition.findUniqueOrThrow({ where: { ownerKey_symbol: { ownerKey: config.ownerKey, symbol: order.symbol } } });
      const held = new Prisma.Decimal(position.quantity);
      if (quantity.gt(held)) throw new Error("卖出数量超过机器人所属仓位");
      const soldCost = position.costUsd.mul(quantity).div(held);
      pnl = usd.sub(soldCost);
      const remainder = held.sub(quantity);
      // Sub-unit rounding dust retains its cost basis until a real disposal.
      await tx.bstockAutoPosition.update({ where: { id: position.id }, data: { quantity: remainder.toFixed(), costUsd: position.costUsd.sub(soldCost) } });
    }
    await tx.bstockAutoOrder.update({ where: { id: order.id }, data: { status: "FINISHED", orderId, txHash: result.data.txHash,
      actualQuantity: settlement.quantity, actualUsd: usd, realizedPnlUsd: pnl, completedAt: new Date(), decision: jsonValue({ ...evidence, settlement }) } });
    await tx.bstockTradeRecord.update({ where: { id: record.id }, data: { status: "FINISHED", txHash: result.data.txHash,
      actualFromAmount: order.side === "buy" ? settlement.paymentAmount : settlement.rawQuantity,
      actualToAmount: order.side === "buy" ? settlement.rawQuantity : settlement.paymentAmount, completedAt: new Date() } });
    await tx.bstockAutoEvent.create({ data: { ownerKey: config.ownerKey, generation: order.generation, kind: "FILLED", status: "FINISHED",
      symbol: order.symbol, side: order.side, strategy: order.strategy, orderId, txHash: result.data.txHash,
      reason: "链上两次区块确认，已按实际资金流入账", metadata: jsonValue({ autoOrderId: order.id, tradeRecordId: record.id, ...settlement, realizedPnlUsd: pnl?.toString(), pnlExcludesGas: true }) } });
  });
  return state;
}

async function submitOrder(config: BstockAutoConfig, state: AgentSessionState, input: {
  asset: Asset; side: "buy" | "sell"; amount: string; strategy: string; reason: string; signalKey: string; decision: unknown; targetPct: number;
  leaseToken: string; usdtPriceUsd: number; bnbPriceUsd: number; availableCapitalUsd: number;
}) {
  const evidence = { ...object(input.decision), asset: input.asset, usdtPriceUsd: input.usdtPriceUsd, bnbPriceUsd: input.bnbPriceUsd };
  const assertCurrent = (current: BstockAutoConfig) => {
    if (!current.enabled || current.generation !== config.generation || !current.expiresAt || timestamp(current.expiresAt) <= Date.now()) throw new Error("自动交易已停止或授权已过期");
    if (current.leaseToken !== input.leaseToken || !current.leaseUntil || timestamp(current.leaseUntil) <= Date.now()) throw new Error("自动交易执行租约已失效");
    if (input.side === "buy" && object(current.stats).riskExitOnly === true) throw new Error("风险退出已锁定，不再允许新开仓");
  };
  let order: BstockAutoOrder;
  try {
    order = await withAutoLock(config.ownerKey, async tx => {
      const current = await tx.bstockAutoConfig.findUniqueOrThrow({ where: { ownerKey: config.ownerKey } });
      assertCurrent(current);
      if (await tx.bstockAutoOrder.count({ where: { ownerKey: config.ownerKey, status: { in: AUTO_PENDING } } })) throw new Error("存在未完成的自动订单，等待回执后再提交");
      return tx.bstockAutoOrder.create({ data: { ownerKey: config.ownerKey, generation: config.generation!, signalKey: input.signalKey,
        symbol: input.asset.symbol, side: input.side, strategy: input.strategy, strategyVersion: AUTO_STRATEGY_VERSION,
        reason: input.reason, decision: jsonValue(evidence), requestedAmount: input.amount } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return state;
    throw error;
  }
  try {
    const quoted = await invoke<Quote>(config, state, handleBstockTradingQuote, { mode: "policy", side: input.side,
      symbol: input.asset.symbol, payToken: "USDT", amount: input.amount, slippagePct: 0.3 });
    state = quoted.state;
    const quote = quoted.data;
    const notionalUsd = number(quote.notionalUsd), toAmount = number(quote.toAmount), feeUsd = number(quote.feeUsd), gasUsd = number(quote.gasUsd);
    const quoteExpiresAt = timestamp(quote.expiresAt);
    if (notionalUsd <= 0 || toAmount <= 0 || feeUsd < 0 || gasUsd < 0 || !Number.isFinite(quoteExpiresAt) || quoteExpiresAt <= Date.now()
      || !quote.intent || !quote.tradeRecordId || number(input.usdtPriceUsd) <= 0 || number(input.bnbPriceUsd) <= 0 || number(input.asset.price) <= 0) throw new Error("报价无效或已过期");
    // Buy notional uses the quote's fresh stablecoin valuation; sell output is in USDT units.
    const usdtPriceUsd = input.side === "buy" ? notionalUsd / number(input.amount) : input.usdtPriceUsd;
    if (!Number.isFinite(usdtPriceUsd) || usdtPriceUsd < 0.98 || usdtPriceUsd > 1.02) throw new Error("USDT 价格偏离自动交易范围");
    evidence.usdtPriceUsd = usdtPriceUsd;
    const expected = input.side === "buy" ? notionalUsd / input.asset.price! : number(input.amount) * input.asset.price! / usdtPriceUsd;
    const friction = assessAutoQuoteFriction({ notionalUsd: quote.notionalUsd, expectedOutput: expected,
      quotedOutput: toAmount, estimatedFeeUsd: 2 * (feeUsd + gasUsd), takeProfitPct: input.targetPct, maxSlippagePct: 0.5 });
    // Emergency exits still honor the quote slippage and price-deviation gate, not a profit hurdle.
    if (!friction.allowed && !(input.side === "sell" && friction.reason === "QUOTE_COST_EXCEEDS_TARGET_BUFFER")) throw new Error(`报价成本/价差检查未通过：${friction.reason}`);
    const settings = autoSettingsSchema.parse(config.settings);
    if (input.side === "buy" && (notionalUsd > settings.orderUsd + 0.000001 || notionalUsd + 2 * gasUsd > input.availableCapitalUsd + 0.000001)) throw new Error("含往返 Gas 预留的订单金额超过可用自动交易预算");
    await withAutoLock(config.ownerKey, async tx => {
      const current = await tx.bstockAutoConfig.findUniqueOrThrow({ where: { ownerKey: config.ownerKey } });
      assertCurrent(current);
      const reserved = await tx.bstockAutoOrder.findUniqueOrThrow({ where: { id: order.id } });
      if (reserved.status !== "QUOTING") throw new Error("原自动报价已取消，不能继续提交");
      await tx.bstockAutoOrder.update({ where: { id: order.id }, data: { status: "QUOTED", tradeRecordId: quote.tradeRecordId,
        gasEstimateUsd: gasUsd, decision: jsonValue({ ...evidence, quote: { ...quote, intent: undefined }, friction }) } });
    });
    await autoEvent(config.ownerKey, config.generation, "QUOTE", input.reason, { symbol: input.asset.symbol, side: input.side, strategy: input.strategy,
      metadata: { autoOrderId: order.id, tradeRecordId: quote.tradeRecordId, settings: config.settings, decision: input.decision, friction } });
    const executed = await invoke<{ orderId: string; status: string }>(config, state,
      request => handleBstockTradingExecute(request, { automation: { ownerKey: config.ownerKey, generation: config.generation!, orderId: order.id, leaseToken: input.leaseToken } }),
      { intent: quote.intent, confirmation: "确认实盘交易", acknowledged: true, eligibilityAcknowledged: true });
    state = executed.state;
    await prisma.bstockAutoOrder.update({ where: { id: order.id }, data: { status: "PENDING", orderId: executed.data.orderId, submittedAt: new Date() } });
    await autoEvent(config.ownerKey, config.generation, "SUBMITTED", "订单已提交，等待链上成交回执", { symbol: input.asset.symbol, side: input.side,
      strategy: input.strategy, orderId: executed.data.orderId, metadata: { autoOrderId: order.id, tradeRecordId: quote.tradeRecordId } });
  } catch (error) {
    const current = await prisma.bstockAutoOrder.findUniqueOrThrow({ where: { id: order.id } });
    const ambiguous = ["SUBMITTING", "PENDING", "UNKNOWN"].includes(current.status);
    await prisma.bstockAutoOrder.update({ where: { id: order.id }, data: { status: ambiguous ? "UNKNOWN" : "SKIPPED", error: safeAutoError(error),
      ...(ambiguous ? {} : { completedAt: new Date() }) } });
    await autoEvent(config.ownerKey, config.generation, ambiguous ? "UNKNOWN" : "SKIPPED", safeAutoError(error), { symbol: input.asset.symbol, side: input.side, metadata: { autoOrderId: order.id } });
    if (ambiguous) await pauseAuto(config.ownerKey, config.generation!, "提交结果待核对，机器人已暂停且不会重复广播", "UNKNOWN");
  }
  return state;
}

export async function runAutoCycle(ownerKey: string, generation: string): Promise<{ stop: boolean; waitMs: number }> {
  const config = await prisma.bstockAutoConfig.findUnique({ where: { ownerKey } });
  if (!config || config.generation !== generation) return { stop: true, waitMs: 60_000 };
  const lease = await acquireAutoLease(ownerKey, generation);
  if (!lease) return { stop: false, waitMs: 60_000 };
  let continueTracking = false;
  try {
    const parsedSettings = autoSettingsSchema.safeParse(config.settings);
    if (!parsedSettings.success) {
      await pauseAuto(ownerKey, generation, "自动交易参数无效，请重新保存策略设置", "SETTINGS_INVALID");
      return { stop: true, waitMs: 60_000 };
    }
    const settings = parsedSettings.data;
    const pending = await prisma.bstockAutoOrder.findMany({ where: { ownerKey, status: { in: AUTO_PENDING } }, orderBy: { createdAt: "asc" } });
    if (!config.enabled && !pending.length) return { stop: true, waitMs: 60_000 };
    if (!config.sessionEncrypted || !config.expiresAt || !Number.isFinite(timestamp(config.expiresAt)) || timestamp(config.expiresAt) <= Date.now()) {
      await pauseAuto(ownerKey, generation, "Agentic Wallet 授权已过期，请重新扫码并启动", "EXPIRED");
      return { stop: true, waitMs: 60_000 };
    }
    let state: AgentSessionState;
    try { state = decodeAgentSession(config.sessionEncrypted); }
    catch {
      await pauseAuto(ownerKey, generation, "自动交易会话无法读取，请重新扫码授权", "SESSION_INVALID");
      return { stop: true, waitMs: 60_000 };
    }
    await validateSession(config, state);
    const market = await fetchOfficialBstockMarket();
    if (pending.length) {
      for (const order of pending) state = await reconcileOrder(config, state, order, market);
      continueTracking = await prisma.bstockAutoOrder.count({ where: { ownerKey, status: { in: AUTO_PENDING } } }) > 0;
      return { stop: !config.enabled && !continueTracking, waitMs: 30_000 };
    }
    if (!config.enabled) return { stop: true, waitMs: 60_000 };
    const wallet = await fetchAgentWalletData(state);
    state = wallet.state;
    await saveSession(config, state);
    const dto = walletSnapshotDto(wallet.tokens, new Map(market.assets.map(a => [a.contractAddress.toLowerCase(), a.multiplier])));
    const positions = await prisma.bstockAutoPosition.findMany({ where: { ownerKey } });
    const open = positions.filter(p => number(p.quantity) > 0 && number(p.costUsd) > 0.01);
    const settled = await prisma.bstockAutoOrder.findMany({ where: { ownerKey, status: { in: ["FINISHED", "FAILED"] } },
      select: { status: true, generation: true, decision: true, gasEstimateUsd: true, side: true, realizedPnlUsd: true, actualUsd: true, completedAt: true } });
    const filled = settled.filter(o => o.status === "FINISHED");
    const realized = filled.reduce((sum, o) => sum + number(o.realizedPnlUsd || 0), 0);
    const gasCost = (order: typeof settled[number]) => number(object(object(order.decision).settlement).gasUsd ?? order.gasEstimateUsd ?? 0);
    const lifetimeGasUsd = settled.reduce((sum, order) => sum + gasCost(order), 0);
    const generationGasUsd = settled.filter(order => order.generation === generation).reduce((sum, order) => sum + gasCost(order), 0);
    let unrealized = 0, cost = 0;
    for (const position of open) {
      const asset = market.assets.find(a => a.symbol === position.symbol);
      if (!asset || asset.contractAddress.toLowerCase() !== position.contractAddress.toLowerCase() || compareDecimals(asset.multiplier, position.multiplier) !== 0) {
        await pauseAuto(ownerKey, generation, "持仓合约或拆股倍率已变化，请先核对机器人持仓账本", "RECONCILIATION_REQUIRED");
        return { stop: true, waitMs: 60_000 };
      }
      if (!asset.price || !Number.isFinite(asset.price) || !fresh(asset.marketUpdatedAt, 120_000) || market.deliveryMode === "CACHE_STALE"
        || !market.registrySourceAvailable) throw new Error("持仓行情过期，无法可靠评估止盈止损，等待行情恢复");
      const held = dto.bstockBalances.find(p => p.address.toLowerCase() === position.contractAddress.toLowerCase());
      if (!held || compareDecimals(held.balanceExact, position.quantity) < 0) {
        await pauseAuto(ownerKey, generation, "钱包持仓小于机器人账本，可能存在外部转出或手动卖出，请核对后处理", "RECONCILIATION_REQUIRED");
        return { stop: true, waitMs: 60_000 };
      }
      cost += number(position.costUsd);
      unrealized += number(position.quantity) * asset.price - number(position.costUsd);
    }
    const botEquity = settings.budgetUsd + realized - number(config.realizedBaseline) + unrealized - generationGasUsd;
    const high = Math.max(number(config.equityHighUsd), botEquity);
    const today = new Date().toISOString().slice(0, 10);
    const todayTrades = filled.filter(o => o.completedAt?.toISOString().startsWith(today));
    const dailyGasUsd = settled.filter(o => o.completedAt?.toISOString().startsWith(today)).reduce((sum, order) => sum + gasCost(order), 0);
    const dailyPnl = todayTrades.reduce((s, o) => s + number(o.realizedPnlUsd || 0), 0) + unrealized - dailyGasUsd;
    const spentToday = todayTrades.filter(o => o.side === "buy").reduce((s, o) => s + number(o.actualUsd || 0), 0);
    const drawdown = high > 0 ? (high - botEquity) / high * 100 : 0;
    const newlyTripped = drawdown >= settings.maxDrawdownPct || dailyPnl <= -settings.budgetUsd * settings.dailyLossPct / 100;
    // Persist the risk latch before the first disposal. A later recovery cannot restart buying.
    const circuit = await withAutoLock(ownerKey, async tx => {
      const current = await tx.bstockAutoConfig.findUniqueOrThrow({ where: { ownerKey } });
      if (!current.enabled || current.generation !== generation || current.leaseToken !== lease || !current.leaseUntil || timestamp(current.leaseUntil) <= Date.now()) return null;
      const riskExitOnly = object(current.stats).riskExitOnly === true || newlyTripped;
      await tx.bstockAutoConfig.updateMany({ where: { ownerKey, generation, leaseToken: lease }, data: { equityHighUsd: high,
        status: riskExitOnly ? "RISK_EXITING" : "RUNNING", heartbeatAt: new Date(),
        lastError: riskExitOnly ? "已触发风险上限，仅退出机器人持仓，不再开新仓" : null,
        stats: jsonValue({ ...object(current.stats), riskExitOnly, riskTriggeredAt: riskExitOnly ? object(current.stats).riskTriggeredAt || new Date().toISOString() : null,
          realizedPnlUsd: realized, unrealizedPnlUsd: unrealized, botEquityUsd: botEquity,
          generationGasUsd, lifetimeGasUsd, dailyGasUsd, dailyPnlUsd: dailyPnl, drawdownPct: drawdown,
          closedTrades: filled.filter(o => o.side === "sell").length, wins: filled.filter(o => number(o.realizedPnlUsd || 0) > 0).length,
          openPositions: open.length, openCostUsd: cost, spentTodayUsd: spentToday, pnlExcludesGas: true, riskEquityIncludesGas: true }) } });
      return riskExitOnly;
    });
    if (circuit === null) return { stop: true, waitMs: 60_000 };
    // Risk exits have priority; they only sell inventory bought by this bot.
    for (const position of open) {
      const asset = market.assets.find(a => a.symbol === position.symbol)!;
      const entryPrice = number(position.costUsd) / number(position.quantity);
      const highPrice = Math.max(number(position.highPrice), asset.price!);
      await prisma.bstockAutoPosition.update({ where: { id: position.id }, data: { highPrice } });
      const entryOrder = position.strategy === "mean_reversion" ? await prisma.bstockAutoOrder.findUnique({ where: { id: position.entryOrderId }, select: { decision: true } }) : null;
      const entryMidBand = object(object(object(entryOrder?.decision).signal).indicators).midBand;
      const midBand = typeof entryMidBand === "number" && Number.isFinite(entryMidBand) && entryMidBand > 0 ? entryMidBand : null;
      const exit = selectAutoExit({ price: asset.price!, entryPrice, highPrice, ...settings,
        strategy: position.strategy === "trend" ? "trend" : "mean_reversion", midBand });
      if (exit.exit || circuit) {
        const rawToken = wallet.tokens.find(t => t.contractAddress.toLowerCase() === asset.contractAddress.toLowerCase());
        if (!rawToken) throw new Error("机器人持仓的链上余额不可用");
        // Each slice remains below the existing 50% wallet / $2,000 quote cap.
        const maxExitUsd = Math.min(1900, number(dto.totalWalletValueUsd) * 0.45);
        if (maxExitUsd <= 0) throw new Error("钱包净值无效，无法计算退出金额");
        const sliceQuantity = Prisma.Decimal.min(new Prisma.Decimal(position.quantity), new Prisma.Decimal(maxExitUsd).div(asset.price!)).toFixed(36, Prisma.Decimal.ROUND_DOWN);
        const rawQty = resolveBstockSellRawAmount(sliceQuantity, asset.multiplier, rawToken.balance, Number(rawToken.decimals) || 18);
        const amount = multiplyDecimals(rawQty, asset.multiplier);
        if (number(amount) <= 0) throw new Error("剩余持仓不足链上最小可卖单位，保留账本待核对");
        const symbolKey = `${ownerKey}:${position.id}:${position.quantity}:sell:${Math.floor(Date.now() / 300_000)}`;
        state = await submitOrder(config, state, { asset, side: "sell", amount, strategy: position.strategy, targetPct: settings.takeProfitPct,
          leaseToken: lease, usdtPriceUsd: number(dto.paymentBalances.USDT?.price), bnbPriceUsd: number(dto.paymentBalances.BNB?.price), availableCapitalUsd: 0,
          reason: circuit ? "RISK_CIRCUIT_EXIT" : exit.reason, signalKey: createHash("sha256").update(symbolKey).digest("hex"),
          decision: { exit, entryPrice, highPrice, midBand, circuit, drawdownPct: drawdown, dailyPnl, settings, slicedExit: compareDecimals(amount, position.quantity) < 0 } });
        return { stop: false, waitMs: 30_000 };
      }
    }
    if (circuit) { await pauseAuto(ownerKey, generation, "已触发回撤/当日亏损上限，自动交易停止", "RISK_STOPPED"); return { stop: true, waitMs: 60_000 }; }
    const cmc = await fetchCmcLiveSnapshot();
    if (cmc.deliveryMode === "CACHE_STALE" || !fresh(cmc.fetchedAt, 120_000) || cmc.regime === "RISK_OFF") {
      await autoEvent(ownerKey, generation, "WAIT", "宏观风险或数据新鲜度不满足开仓条件");
      return { stop: false, waitMs: settings.intervalSeconds * 1000 };
    }
    if (open.length >= settings.maxPositions || cost + settings.orderUsd > Math.min(settings.budgetUsd, botEquity) || spentToday + settings.orderUsd > settings.budgetUsd * 2) {
      await autoEvent(ownerKey, generation, "WAIT", "仓位数、可用预算或每日成交周转上限已达到");
      return { stop: false, waitMs: settings.intervalSeconds * 1000 };
    }
    const scan = await scanAutoCandidates(ownerKey, agentSessionKey(state), settings, market);
    await autoEvent(ownerKey, generation, "SCAN", `已扫描 ${scan.diagnostics.scanned} 个具有有效研报和流动性的标的`, { metadata: scan.diagnostics });
    for (const candidate of scan.candidates) {
      const { asset, signal } = candidate;
      if (signal.action !== "buy" || !signal.barTime || open.some(p => p.symbol === asset.symbol)) continue;
      const existing = dto.bstockBalances.find(p => p.address.toLowerCase() === asset.contractAddress.toLowerCase());
      if ((existing?.valueUsd || 0) + settings.orderUsd >= dto.totalWalletValueUsd * 0.25) continue;
      const usd = dto.paymentBalances.USDT;
      if (!usd || !Number.isFinite(usd.price) || !Number.isFinite(usd.balance) || usd.price < 0.98 || usd.price > 1.02
        || usd.balance * usd.price < settings.orderUsd || (dto.paymentBalances.BNB?.balance || 0) < 0.0002) continue;
      // Express budget in actual USD using the live USDT rate; floor, never round up.
      const amount = (Math.floor(settings.orderUsd / usd.price * 1e6) / 1e6).toFixed(6);
      const signalKey = createHash("sha256").update(`${ownerKey}:${asset.symbol}:${signal.barTime}:buy`).digest("hex");
      if (await prisma.bstockAutoOrder.findUnique({ where: { signalKey }, select: { id: true } })) continue;
      await submitOrder(config, state, { asset, side: "buy", amount, strategy: signal.strategy, reason: signal.reason, signalKey,
        leaseToken: lease, usdtPriceUsd: usd.price, bnbPriceUsd: number(dto.paymentBalances.BNB?.price), availableCapitalUsd: Math.min(settings.budgetUsd, botEquity) - cost,
        targetPct: signal.indicators.expectedUpsidePct || settings.takeProfitPct,
        decision: { signal, reportId: candidate.reportId, reportCompletedAt: candidate.reportCompletedAt, cmc: { score: cmc.score, regime: cmc.regime, fetchedAt: cmc.fetchedAt }, settings } });
      break;
    }
    return { stop: false, waitMs: settings.intervalSeconds * 1000 };
  } catch (error) {
    const message = safeAutoError(error);
    const current = await prisma.bstockAutoConfig.findUnique({ where: { ownerKey } });
    if (!current || current.generation !== generation) return { stop: true, waitMs: 60_000 };
    await prisma.bstockAutoConfig.updateMany({ where: { ownerKey, generation, enabled: true }, data: {
      status: object(current.stats).riskExitOnly === true ? "RISK_EXITING" : "WAITING", lastError: message, heartbeatAt: new Date() } });
    await autoEvent(ownerKey, generation, "ERROR", message);
    return { stop: !current.enabled && !await prisma.bstockAutoOrder.count({ where: { ownerKey, status: { in: AUTO_PENDING } } }), waitMs: 60_000 };
  } finally {
    await prisma.bstockAutoConfig.updateMany({ where: { ownerKey, generation, leaseToken: lease }, data: { leaseToken: null, leaseUntil: null } });
  }
}
