import "server-only";
import {
  AlphaExecutionMode,
  AlphaExecutionState,
  AlphaMarketType,
  AlphaOrderRole,
  AlphaOrderStatus,
  Prisma
} from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  TideSightBinanceClient,
  BinanceRequestError,
  getLiveBinanceReferencePrice,
  isBinanceMissingOrderError,
  type BinanceOrderResult
} from "@/lib/tidesight/execution/binance";
import { decryptTradingSecret } from "@/lib/tidesight/execution/credentials";
import { getOrCreateTideSightExecutionConfig, marketFrom, modeFrom, writeTideSightAudit } from "@/lib/tidesight/execution/data";
import riskEngine from "@/workers/tidesight_risk_engine.js";
import { TIDESIGHT_FEATURED_MARKETS } from "@/lib/tidesight/market-universe";
import { withExecutionLease } from "./lease";

const { evaluateTradeIntent, createDedupeHash, shouldBlockDedupeFromEntryOrder } = riskEngine as {
  evaluateTradeIntent: (intent: Record<string, unknown>, context: Record<string, unknown>, options?: Record<string, unknown>) => Record<string, any>;
  createDedupeHash: (intent: Record<string, unknown>) => string;
  shouldBlockDedupeFromEntryOrder: (order: Record<string, unknown>) => boolean;
};

const ACTIVE_POSITION_STATES = [AlphaExecutionState.MONITORING, AlphaExecutionState.PROTECTION_ACTIVE, AlphaExecutionState.RECONCILING, AlphaExecutionState.UNKNOWN];
const TERMINAL_ORDER_STATES = [AlphaOrderStatus.FILLED, AlphaOrderStatus.CANCELED, AlphaOrderStatus.REJECTED, AlphaOrderStatus.EXPIRED];
const ACTIVE_PROTECTION_ORDER_STATES: AlphaOrderStatus[] = [AlphaOrderStatus.SUBMITTED, AlphaOrderStatus.NEW, AlphaOrderStatus.PARTIALLY_FILLED];
const MISSING_ORDER_SETTLEMENT_GRACE_MS = 60_000;
const KILL_SWITCH_RECONCILIATION_MAX_AGE_MS = 5 * 60_000;

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function engineMode(mode: AlphaExecutionMode) {
  return mode.toLowerCase();
}

function engineMarket(market: AlphaMarketType) {
  return market.toLowerCase();
}

function orderStatus(value: string) {
  const normalized = value.toUpperCase();
  if (normalized === "NEW") return AlphaOrderStatus.NEW;
  if (normalized === "SUBMITTED" || normalized === "TRIGGERING" || normalized === "TRIGGERED") return AlphaOrderStatus.SUBMITTED;
  if (normalized === "PARTIALLY_FILLED") return AlphaOrderStatus.PARTIALLY_FILLED;
  if (normalized === "FILLED" || normalized === "FINISHED") return AlphaOrderStatus.FILLED;
  if (normalized === "CANCELED") return AlphaOrderStatus.CANCELED;
  if (normalized === "REJECTED") return AlphaOrderStatus.REJECTED;
  if (normalized === "EXPIRED") return AlphaOrderStatus.EXPIRED;
  return AlphaOrderStatus.UNKNOWN;
}

function stateForOrder(value: AlphaOrderStatus) {
  if (value === AlphaOrderStatus.FILLED) return AlphaExecutionState.FILLED;
  if (value === AlphaOrderStatus.PARTIALLY_FILLED) return AlphaExecutionState.PARTIALLY_FILLED;
  if (value === AlphaOrderStatus.NEW || value === AlphaOrderStatus.SUBMITTED) return AlphaExecutionState.SUBMITTED;
  return AlphaExecutionState.UNKNOWN;
}

function safeClientOrderId(prefix: string, id: string) {
  return `ts${prefix}${id.replace(/[^a-zA-Z0-9]/g, "").slice(-24)}`.slice(0, 36);
}

function idempotency(environment: AlphaExecutionMode, market: AlphaMarketType, planId: string, role: AlphaOrderRole) {
  return createHash("sha256").update(`${environment}|${market}|${planId}|${role}`).digest("hex");
}

async function credentialFor(userId: string, environment: AlphaExecutionMode, market: AlphaMarketType) {
  if (environment !== AlphaExecutionMode.TESTNET && environment !== AlphaExecutionMode.LIVE) return null;
  return prisma.tideSightTradingCredential.findUnique({
    where: { userId_environment_market: { userId, environment, market } }
  });
}

function clientFromCredential(credential: NonNullable<Awaited<ReturnType<typeof credentialFor>>>) {
  const summary = credential.permissionSummary as Record<string, unknown> | null;
  const accountMode = summary?.accountMode === "portfolio" ? "portfolio" : summary?.accountMode === "classic" || credential.verifiedAt ? "classic" : "auto";
  return new TideSightBinanceClient({
    environment: credential.environment === AlphaExecutionMode.LIVE ? "live" : "testnet",
    market: credential.market === AlphaMarketType.SPOT ? "spot" : "futures",
    apiKey: decryptTradingSecret(credential.apiKeyEncrypted),
    apiSecret: decryptTradingSecret(credential.apiSecretEncrypted),
    proxy: credential.proxyEncrypted ? decryptTradingSecret(credential.proxyEncrypted) : null,
    accountMode
  });
}

export async function preflightCredential(userId: string, environment: AlphaExecutionMode, market: AlphaMarketType) {
  return withExecutionLease(userId, () => preflightCredentialLocked(userId, environment, market));
}

async function preflightCredentialLocked(userId: string, environment: AlphaExecutionMode, market: AlphaMarketType) {
  const credential = await credentialFor(userId, environment, market);
  if (!credential) throw new Error("请先保存当前环境的 Binance API Key");
  const client = clientFromCredential(credential);
  try {
    const result = await client.preflight();
    if (result.accountMode === "portfolio" && (credential.permissionSummary as Record<string, unknown> | null)?.accountMode !== "portfolio") {
      await getOrCreateTideSightExecutionConfig(userId);
      await prisma.tideSightExecutionConfig.update({ where: { userId }, data: { activeMode: "PAPER", liveEnabled: false, liveUnlockedAt: null, autoExecuteEnabled: false, autoGeneration: null, reconciliationHealthy: false, lastReconciledAt: null } });
    }
    await prisma.tideSightTradingCredential.update({
      where: { id: credential.id },
      data: { verifiedAt: new Date(), permissionSummary: json(result), lastError: null, enabled: true }
    });
    await writeTideSightAudit({
      userId,
      state: AlphaExecutionState.RECONCILED,
      status: "OK",
      message: `${environment}/${market} Binance ${result.accountType} 连接、签名、权限与账户风险校验通过。`,
      metadata: { environment, market, canTrade: result.canTrade, accountType: result.accountType, accountMode: result.accountMode, adapterVersion: result.adapterVersion }
    });
    return result;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Binance preflight failed";
    await prisma.tideSightTradingCredential.update({ where: { id: credential.id }, data: { lastError: message, verifiedAt: null } });
    throw caught;
  } finally {
    await client.close();
  }
}

function policyFrom(config: Awaited<ReturnType<typeof getOrCreateTideSightExecutionConfig>>) {
  return {
    riskPerTradePct: config.riskPerTradePct, maxLeverage: config.maxLeverage,
    dailyLossLimitPct: config.dailyLossLimitPct, dedupeWindowMinutes: config.dedupeWindowMinutes,
    maxOpenPositions: config.maxOpenPositions, maxPortfolioExposurePct: config.maxPortfolioExposurePct,
    minTideSightScore: config.minTideSightScore, perOrderNotionalLimit: config.perOrderNotionalLimit,
    dailyNotionalLimit: config.dailyNotionalLimit,
  };
}

async function riskContext(userId: string, environment: AlphaExecutionMode, twoFactorPassed: boolean) {
  const config = await getOrCreateTideSightExecutionConfig(userId);
  const market = AlphaMarketType.FUTURES;
  const credential = await credentialFor(userId, environment, market);
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [recent, positions, todayOrders, uncertain] = await Promise.all([
    prisma.tideSightTradingOrder.findMany({
      where: { userId, environment, market, role: AlphaOrderRole.ENTRY, createdAt: { gte: new Date(now.getTime() - config.dedupeWindowMinutes * 60_000) } },
      select: { symbol: true, side: true, status: true, exchangeOrderId: true, filledQuantity: true, createdAt: true },
    }),
    prisma.tideSightTradingPosition.findMany({ where: { userId, environment, market, state: { in: ACTIVE_POSITION_STATES } } }),
    prisma.tideSightTradingOrder.findMany({
      where: { userId, environment, market, role: AlphaOrderRole.ENTRY, createdAt: { gte: startOfDay }, status: { in: [AlphaOrderStatus.SUBMITTED, AlphaOrderStatus.NEW, AlphaOrderStatus.PARTIALLY_FILLED, AlphaOrderStatus.FILLED] } },
      include: { plan: { select: { intent: { select: { entryPrice: true } } } } },
    }),
    prisma.tideSightTradingOrder.count({ where: { userId, environment, status: { in: [AlphaOrderStatus.UNKNOWN, AlphaOrderStatus.PENDING, AlphaOrderStatus.SUBMITTED, AlphaOrderStatus.NEW, AlphaOrderStatus.PARTIALLY_FILLED] }, role: AlphaOrderRole.ENTRY } }),
  ]);
  let equity = 10_000, availableBalance = 10_000, dailyPnl = 0;
  let openNotional = positions.reduce((sum, p) => sum + Math.abs(p.quantity * Number(p.markPrice ?? p.entryPrice)), 0);
  let openPositions = positions.length;
  let portfolioMargin: Record<string, unknown> | null = null;
  if (environment === AlphaExecutionMode.LIVE) {
    if (!credential?.verifiedAt || !credential.enabled) throw new Error("请先配置并验证 TideSight 独立凭据");
    const client = clientFromCredential(credential);
    try {
      const account = await client.tradingRiskSnapshot();
      if ("portfolioMargin" in account) {
        portfolioMargin = account.portfolioMargin;
        if (account.positionSymbols.some((symbol) => !positions.some((p) => p.symbol === symbol))) throw new Error("PAPI 账户存在 TideSight 未管理的 UM 仓位，禁止共用账户新增风险");
        const managedOrders = await prisma.tideSightTradingOrder.findMany({ where: { userId, environment, market, status: { notIn: TERMINAL_ORDER_STATES } }, select: { clientOrderId: true } });
        if (account.openOrderClientIds.some(id => !managedOrders.some(o => o.clientOrderId === id))) throw new Error("PAPI 账户存在 TideSight 未管理的挂单，禁止新增风险");
      }
      equity = Number(account.equity); availableBalance = Number(account.availableBalance);
      dailyPnl = Number(account.dailyPnl);
      openNotional = Math.max(openNotional, Number(account.riskExposureNotional));
      openPositions = Math.max(openPositions, Number(account.openPositionCount));
      if (![equity, availableBalance, dailyPnl, openNotional, openPositions].every(Number.isFinite)) throw new Error("账户风险快照不完整");
    } finally { await client.close(); }
  }
  return { config, credential, context: {
    equity, availableBalance, dailyPnl, openPositions, openNotional, portfolioMargin,
    dailyExecutedNotional: todayOrders.reduce((sum, order) => sum + order.quantity * Number(order.averagePrice ?? order.price ?? order.plan.intent.entryPrice), 0),
    recentIntents: recent.filter((order) => shouldBlockDedupeFromEntryOrder(order)).map((order) => ({ symbol: order.symbol, side: order.side, createdAt: order.createdAt })),
    killSwitch: config.killSwitchActive || uncertain > 0,
    environmentEnabled: environment === AlphaExecutionMode.LIVE ? config.liveEnabled : true,
    credentialConfigured: Boolean(credential?.verifiedAt && credential.enabled),
    liveUnlocked: Boolean(config.liveUnlockedAt), liveTradingEnabled: config.liveEnabled, twoFactorPassed,
    reconciliationHealthy: config.reconciliationHealthy && Boolean(config.lastReconciledAt && now.getTime() - config.lastReconciledAt.getTime() < 300_000),
    requireManualConfirmation: true,
  } };
}

export async function approveTradeIntent(input: Record<string, unknown>, userId: string, twoFactorPassed: boolean, automaticGeneration?: string): Promise<Record<string, any>> {
  const current = await getOrCreateTideSightExecutionConfig(userId);
  const environment = modeFrom(String(input.mode ?? current.activeMode));
  const market = marketFrom(String(input.market ?? current.defaultMarket));
  if (market !== AlphaMarketType.FUTURES) throw new Error("TideSight 仅支持 USDT 永续合约");
  const submitted = String(input.symbol).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const normalizedSymbol = submitted.endsWith("USDT") ? submitted : `${submitted}USDT`;
  if (!TIDESIGHT_FEATURED_MARKETS.some((item) => item.symbol === normalizedSymbol)) throw new Error("交易对不在 TideSight 12 个标的白名单中");
  const marketReferencePrice = await getLiveBinanceReferencePrice("futures", normalizedSymbol);
  const { config, context } = await riskContext(userId, environment, twoFactorPassed);
  if (automaticGeneration && (!config.autoExecuteEnabled || config.autoGeneration !== automaticGeneration)) throw new Error("自动授权已失效");
  const result = evaluateTradeIntent(
    { ...input, symbol: normalizedSymbol, entryPrice: marketReferencePrice, mode: engineMode(environment), market: "futures" },
    { ...context, trustedMacdSignal: Boolean(automaticGeneration), riskCappedSizing: Boolean(automaticGeneration) }, { policy: policyFrom(config) },
  );

  const intent = result.intent;
  const savedIntent = await prisma.tideSightTradeIntent.create({
    data: {
      id: String(intent.intentId),
      userId,
      environment,
      market,
      symbol: String(intent.symbol),
      side: String(intent.side),
      orderType: String(intent.orderType),
      entryPrice: Number(intent.entryPrice),
      stopLoss: Number(intent.stopLoss),
      takeProfit: Number(intent.takeProfit),
      leverage: Number(intent.leverage),
      riskPct: Number(intent.riskPct),
      source: String(intent.source),
      tideSightScore: intent.tideSightScore == null ? null : Number(intent.tideSightScore),
      dedupeHash: String(intent.dedupeHash ?? createDedupeHash(intent)),
      state: result.ok ? AlphaExecutionState.RISK_APPROVED : AlphaExecutionState.RISK_REJECTED,
      rejectionReason: result.ok ? null : result.violations.map((item: { message: string }) => item.message).join("；")
    }
  });

  for (const event of result.audit as Array<Record<string, unknown>>) {
    const state = event.state === "REJECTED" ? AlphaExecutionState.RISK_REJECTED
      : event.state === "PLANNED" ? AlphaExecutionState.PLANNED
        : event.state === "AWAITING_CONFIRMATION" ? AlphaExecutionState.AWAITING_CONFIRMATION
          : event.state === "NORMALIZED" ? AlphaExecutionState.NORMALIZED
            : event.state === "DEDUPE_CHECKED" ? AlphaExecutionState.DEDUPE_CHECKED
              : event.state === "RISK_CHECKED" ? (result.ok ? AlphaExecutionState.RISK_APPROVED : AlphaExecutionState.RISK_REJECTED)
                : AlphaExecutionState.CREATED;
    await writeTideSightAudit({ userId, intentId: savedIntent.id, state, status: String(event.status), message: String(event.message), metadata: event.details as Record<string, unknown> | null });
  }

  if (!result.ok || !result.executionPlan) return { ...result, intent: savedIntent };
  const planData = result.executionPlan;
  const plan = await prisma.tideSightExecutionPlan.create({
    data: {
      id: String(planData.planId),
      intentId: savedIntent.id,
      userId,
      environment,
      market,
      state: AlphaExecutionState.AWAITING_CONFIRMATION,
      mainOrder: json(planData.mainOrder),
      protectionOrders: json(planData.protectionOrders),
      riskSnapshot: json(planData.risk),
      safeguards: json({ ...planData.safeguards, automaticGeneration: automaticGeneration ?? null }),
      expiresAt: new Date(planData.expiresAt)
    }
  });
  return { ...result, intent: savedIntent, executionPlan: { ...planData, planId: plan.id } };
}

export async function readLiveReferencePrice(symbol: string, market: AlphaMarketType) {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const price = await getLiveBinanceReferencePrice(engineMarket(market) as "spot" | "futures", normalizedSymbol);
  return {
    symbol: normalizedSymbol,
    market: engineMarket(market),
    price,
    validation: "LIVE_PRICE_REPLACEMENT_ONLY",
    source: "BINANCE_LIVE",
    checkedAt: new Date().toISOString()
  };
}

export async function cancelExecutionPlan(planId: string, userId: string) {
  const plan = await prisma.tideSightExecutionPlan.findFirst({ where: { id: planId, userId }, include: { intent: true } });
  if (!plan) throw new Error("执行计划不存在");
  if (plan.state !== AlphaExecutionState.PLANNED && plan.state !== AlphaExecutionState.AWAITING_CONFIRMATION) {
    if (plan.state === AlphaExecutionState.CANCELED) return { ok: true, idempotent: true, planId, state: plan.state };
    throw new Error(`当前计划状态为 ${plan.state}，不能取消已提交的订单`);
  }
  await prisma.$transaction([
    prisma.tideSightExecutionPlan.update({ where: { id: plan.id }, data: { state: AlphaExecutionState.CANCELED } }),
    prisma.tideSightTradeIntent.update({ where: { id: plan.intentId }, data: { state: AlphaExecutionState.CANCELED } })
  ]);
  await writeTideSightAudit({
    userId,
    intentId: plan.intentId,
    planId: plan.id,
    state: AlphaExecutionState.CANCELED,
    status: "FINAL",
    message: `${plan.intent.symbol} 待确认执行计划已由操作员取消；未向任何交易所提交订单。`
  });
  return { ok: true, planId, state: AlphaExecutionState.CANCELED };
}

async function createOrderRecord(input: {
  userId: string;
  planId: string;
  credentialId?: string | null;
  environment: AlphaExecutionMode;
  market: AlphaMarketType;
  role: AlphaOrderRole;
  symbol: string;
  side: string;
  orderType: string;
  quantity: number;
  price?: number | null;
  stopPrice?: number | null;
  clientOrderId: string;
}) {
  return prisma.tideSightTradingOrder.upsert({
    where: { idempotencyKey: idempotency(input.environment, input.market, input.planId, input.role) },
    update: {},
    create: {
      ...input,
      credentialId: input.credentialId ?? null,
      price: input.price ?? null,
      stopPrice: input.stopPrice ?? null,
      idempotencyKey: idempotency(input.environment, input.market, input.planId, input.role),
      status: AlphaOrderStatus.PENDING
    }
  });
}

async function createPosition(plan: Awaited<ReturnType<typeof prisma.tideSightExecutionPlan.findFirstOrThrow>>, result: BinanceOrderResult | null) {
  const main = plan.mainOrder as Record<string, unknown>;
  const protection = plan.protectionOrders as Array<Record<string, unknown>>;
  const intent = await prisma.tideSightTradeIntent.findUniqueOrThrow({ where: { id: plan.intentId } });
  const entry = Number(result?.averagePrice ?? main.price ?? intent.entryPrice);
  const quantity = Number(result?.filledQuantity || main.quantity);
  return prisma.tideSightTradingPosition.upsert({
    where: { planId: plan.id },
    update: { quantity, entryPrice: entry, markPrice: entry, state: AlphaExecutionState.MONITORING, lastReconciledAt: new Date() },
    create: {
      userId: plan.userId,
      planId: plan.id,
      environment: plan.environment,
      market: plan.market,
      symbol: intent.symbol,
      side: intent.side,
      quantity,
      entryPrice: entry,
      markPrice: entry,
      stopLoss: Number(protection[0]?.stopPrice ?? intent.stopLoss),
      takeProfit: Number(protection[1]?.stopPrice ?? intent.takeProfit),
      state: AlphaExecutionState.MONITORING,
      lastReconciledAt: new Date()
    }
  });
}

async function attachSimulatedProtection(planId: string) {
  const plan = await prisma.tideSightExecutionPlan.findUniqueOrThrow({ where: { id: planId }, include: { intent: true } });
  const position = await prisma.tideSightTradingPosition.findUniqueOrThrow({ where: { planId } });
  const protection = plan.protectionOrders as Array<Record<string, unknown>>;
  const stopPlan = protection.find((order) => String(order.type).includes("STOP"));
  const targetPlan = protection.find((order) => String(order.type).includes("TAKE_PROFIT"));
  if (!stopPlan || !targetPlan) throw new Error("模拟执行计划缺少完整止损或止盈保护单");
  const stop = await createOrderRecord({
    userId: plan.userId,
    planId,
    environment: plan.environment,
    market: plan.market,
    role: AlphaOrderRole.STOP_LOSS,
    symbol: plan.intent.symbol,
    side: plan.intent.side === "LONG" ? "SELL" : "BUY",
    orderType: String(stopPlan.type),
    quantity: position.quantity,
    stopPrice: Number(stopPlan.stopPrice),
    clientOrderId: safeClientOrderId("sl", plan.id)
  });
  const target = await createOrderRecord({
    userId: plan.userId,
    planId,
    environment: plan.environment,
    market: plan.market,
    role: AlphaOrderRole.TAKE_PROFIT,
    symbol: plan.intent.symbol,
    side: plan.intent.side === "LONG" ? "SELL" : "BUY",
    orderType: String(targetPlan.type),
    quantity: position.quantity,
    stopPrice: Number(targetPlan.stopPrice),
    clientOrderId: safeClientOrderId("tp", plan.id)
  });
  await prisma.tideSightTradingOrder.updateMany({
    where: { id: { in: [stop.id, target.id] } },
    data: { status: AlphaOrderStatus.NEW, rawResponse: json({ simulated: true, protected: true, environment: plan.environment }) }
  });
  await writeTideSightAudit({ userId: plan.userId, intentId: plan.intentId, planId, state: AlphaExecutionState.PROTECTION_ACTIVE, status: "OK", message: `${plan.environment} 止损与止盈保护单已建立并进入模拟监控。` });
}

async function attachProtection(planId: string, client: TideSightBinanceClient, credentialId: string) {
  const plan = await prisma.tideSightExecutionPlan.findUniqueOrThrow({ where: { id: planId }, include: { intent: true, orders: true } });
  if (plan.orders.some((order) => order.role === AlphaOrderRole.STOP_LOSS || order.role === AlphaOrderRole.TAKE_PROFIT)) return;
  const position = await prisma.tideSightTradingPosition.findUniqueOrThrow({ where: { planId } });
  const stopClientOrderId = safeClientOrderId("sl", plan.id);
  const takeProfitClientOrderId = safeClientOrderId("tp", plan.id);
  const response = await client.placeProtection({
    symbol: plan.intent.symbol,
    quantity: position.quantity,
    stopLoss: position.stopLoss,
    takeProfit: position.takeProfit,
    side: plan.intent.side as "LONG" | "SHORT",
    stopClientOrderId,
    takeProfitClientOrderId,
    listClientOrderId: safeClientOrderId("oco", plan.id)
  });
  const stop = await createOrderRecord({
    userId: plan.userId, planId, credentialId, environment: plan.environment, market: plan.market,
    role: AlphaOrderRole.STOP_LOSS, symbol: plan.intent.symbol, side: plan.intent.side === "LONG" ? "SELL" : "BUY",
    orderType: plan.market === AlphaMarketType.SPOT ? "OCO_STOP_LOSS_LIMIT" : "STOP_MARKET", quantity: position.quantity,
    stopPrice: position.stopLoss, clientOrderId: stopClientOrderId
  });
  const target = await createOrderRecord({
    userId: plan.userId, planId, credentialId, environment: plan.environment, market: plan.market,
    role: AlphaOrderRole.TAKE_PROFIT, symbol: plan.intent.symbol, side: plan.intent.side === "LONG" ? "SELL" : "BUY",
    orderType: plan.market === AlphaMarketType.SPOT ? "OCO_TAKE_PROFIT_LIMIT" : "TAKE_PROFIT_MARKET", quantity: position.quantity,
    stopPrice: position.takeProfit, clientOrderId: takeProfitClientOrderId
  });
  const raw = response as Record<string, any>;
  await prisma.tideSightTradingOrder.updateMany({
    where: { id: { in: [stop.id, target.id] } },
    data: { status: AlphaOrderStatus.NEW, rawResponse: json(raw) }
  });
  await prisma.tideSightExecutionPlan.update({ where: { id: planId }, data: { state: AlphaExecutionState.PROTECTION_ACTIVE } });
  await writeTideSightAudit({ userId: plan.userId, intentId: plan.intentId, planId, state: AlphaExecutionState.PROTECTION_ACTIVE, status: "OK", message: "止损与止盈保护单已在 Binance 侧创建。" });
}

export async function executePlan(planId: string, userId: string, automaticGeneration?: string) {
  return withExecutionLease(userId, (token) => executePlanLocked(planId, userId, token, automaticGeneration));
}
async function executePlanLocked(planId: string, userId: string, leaseToken: string, automaticGeneration?: string) {
  const plan = await prisma.tideSightExecutionPlan.findFirst({ where: { id: planId, userId }, include: { intent: true, orders: true } });
  if (!plan) throw new Error("执行计划不存在");
  const safeguards = plan.safeguards as Record<string, unknown>;
  if (safeguards.automaticGeneration && safeguards.automaticGeneration !== automaticGeneration) throw new Error("自动策略计划不能经人工入口绕过自动授权");
  if (plan.expiresAt.getTime() <= Date.now()) throw new Error("执行计划已过期，请重新提交风控审批");
  const config = await getOrCreateTideSightExecutionConfig(userId);
  if (config.killSwitchActive) throw new Error("Kill Switch 已触发，禁止执行新订单");
  if (config.activeMode !== plan.environment || config.defaultMarket !== plan.market) throw new Error("当前环境已变更，请在新环境下重新生成执行计划");
  if (plan.environment === AlphaExecutionMode.TESTNET && !config.testnetEnabled) throw new Error("Binance Testnet 执行闸门已关闭");
  if (plan.environment === AlphaExecutionMode.LIVE && (!config.liveEnabled || !config.liveUnlockedAt || !config.reconciliationHealthy)) {
    throw new Error("生产实盘加锁或对账不健康，禁止提交订单");
  }
  if (plan.state !== AlphaExecutionState.AWAITING_CONFIRMATION && plan.state !== AlphaExecutionState.PLANNED) {
    const submittedStates: AlphaExecutionState[] = [
      AlphaExecutionState.EXECUTING,
      AlphaExecutionState.SUBMITTED,
      AlphaExecutionState.PARTIALLY_FILLED,
      AlphaExecutionState.FILLED,
      AlphaExecutionState.PROTECTION_ACTIVE,
      AlphaExecutionState.MONITORING,
      AlphaExecutionState.RECONCILING,
      AlphaExecutionState.RECONCILED,
      AlphaExecutionState.CLOSED
    ];
    const alreadySubmitted = submittedStates.includes(plan.state);
    if (alreadySubmitted) return { idempotent: true, plan, orders: plan.orders };
    throw new Error(`执行计划当前状态为 ${plan.state}，不可再次执行；请处理失败原因后重新创建交易意图。`);
  }
  const currentReferencePrice = await getLiveBinanceReferencePrice("futures", plan.intent.symbol);
  if (Math.abs(currentReferencePrice / plan.intent.entryPrice - 1) * 10_000 > 25) throw new Error("实时价格偏移超过 25 bps，请重新生成计划");
  const liveRisk = await riskContext(userId, plan.environment, true);
  const approvedMain = plan.mainOrder as Record<string, unknown>;
  const recheck = evaluateTradeIntent({
    ...plan.intent, mode: engineMode(plan.environment), market: "futures",
    entryPrice: currentReferencePrice, requestedNotional: Number(approvedMain.quantity) * currentReferencePrice,
    orderType: String(approvedMain.type),
  }, { ...liveRisk.context, trustedMacdSignal: Boolean(automaticGeneration) }, { policy: policyFrom(liveRisk.config) });
  if (!recheck.ok) throw new Error(`执行前风控拒绝：${recheck.violations.map((v: { message: string }) => v.message).join("；")}`);
  const credential = liveRisk.credential;
  const latest = await getOrCreateTideSightExecutionConfig(userId);
  if (latest.executionLeaseToken !== leaseToken || !latest.executionLeaseUntil || latest.executionLeaseUntil.getTime() <= Date.now()) throw new Error("执行锁已失效");
  if (latest.killSwitchActive || latest.activeMode !== plan.environment || (plan.environment === AlphaExecutionMode.LIVE && (!latest.liveEnabled || !latest.liveUnlockedAt))) throw new Error("执行权限已撤回");
  if (automaticGeneration && (!latest.autoExecuteEnabled || latest.autoGeneration !== automaticGeneration)) throw new Error("自动交易已停止");
  await writeTideSightAudit({ userId, intentId: plan.intentId, planId, state: AlphaExecutionState.AWAITING_CONFIRMATION, status: "RISK_RECHECKED", message: "提交前已重新校验实时价格、账户净值、损益、持仓及独立风控额度。", metadata: { currentReferencePrice } });
  const claimed = await prisma.tideSightExecutionPlan.updateMany({
    where: { id: planId, userId, state: { in: [AlphaExecutionState.AWAITING_CONFIRMATION, AlphaExecutionState.PLANNED] } },
    data: { state: AlphaExecutionState.EXECUTING, confirmedAt: new Date() }
  });
  if (!claimed.count) return { idempotent: true, plan: await prisma.tideSightExecutionPlan.findUnique({ where: { id: planId } }) };

  const main = plan.mainOrder as Record<string, unknown>;
  const clientOrderId = safeClientOrderId("en", plan.id);
  const entryOrder = await createOrderRecord({
    userId, planId, environment: plan.environment, market: plan.market, role: AlphaOrderRole.ENTRY,
    symbol: plan.intent.symbol, side: String(main.side), orderType: String(main.type), quantity: Number(main.quantity),
    price: main.price == null ? null : Number(main.price), clientOrderId
  });

  if (plan.environment === AlphaExecutionMode.PAPER || plan.environment === AlphaExecutionMode.MOCK_EXCHANGE) {
    const simulated: BinanceOrderResult = {
      exchangeOrderId: `${plan.environment}-${randomUUID().slice(0, 10)}`,
      clientOrderId,
      status: "FILLED",
      filledQuantity: Number(main.quantity),
      averagePrice: Number(main.price ?? plan.intent.entryPrice),
      raw: { simulated: true, environment: plan.environment }
    };
    await prisma.tideSightTradingOrder.update({
      where: { id: entryOrder.id },
      data: { status: AlphaOrderStatus.FILLED, exchangeOrderId: simulated.exchangeOrderId, filledQuantity: simulated.filledQuantity, averagePrice: simulated.averagePrice, rawResponse: json(simulated.raw) }
    });
    await createPosition(plan, simulated);
    await attachSimulatedProtection(plan.id);
    await prisma.tideSightExecutionPlan.update({ where: { id: planId }, data: { state: AlphaExecutionState.MONITORING, executedAt: new Date() } });
    await writeTideSightAudit({ userId, intentId: plan.intentId, planId, orderId: entryOrder.id, state: AlphaExecutionState.MONITORING, status: "OK", message: `${plan.environment} 主订单已成交，模拟保护单和持仓监控已启用。` });
    return { ok: true, simulated: true, planId, order: simulated };
  }

  if (!credential?.verifiedAt || !credential.enabled) throw new Error("当前 Binance 凭据尚未通过连接和权限校验");
  const client = clientFromCredential(credential);
  await prisma.tideSightTradingOrder.update({ where: { id: entryOrder.id }, data: { credentialId: credential.id } });
  let entryAcknowledged = false;
  try {
    const result = await client.placeOrder({
      symbol: plan.intent.symbol,
      side: String(main.side) as "BUY" | "SELL",
      type: String(main.type) as "MARKET" | "LIMIT",
      quantity: Number(main.quantity),
      price: main.price == null ? null : Number(main.price),
      leverage: plan.intent.leverage,
      referencePrice: currentReferencePrice,
      maxSlippageBps: 25,
      beforeSubmit: async () => {
        const gate = await getOrCreateTideSightExecutionConfig(userId);
        if (gate.executionLeaseToken !== leaseToken || gate.killSwitchActive || !gate.liveEnabled || !gate.liveUnlockedAt || gate.activeMode !== AlphaExecutionMode.LIVE || !gate.reconciliationHealthy) throw new Error("最终执行闸门已关闭");
        if (JSON.stringify(policyFrom(gate)) !== JSON.stringify(policyFrom(liveRisk.config))) throw new Error("风控策略已变化，请重新审批");
        if (automaticGeneration && (!gate.autoExecuteEnabled || gate.autoGeneration !== automaticGeneration)) throw new Error("自动交易已停止，未提交新订单");
        if (plan.expiresAt.getTime() <= Date.now()) throw new Error("计划已过期");
      },
      clientOrderId
    });
    entryAcknowledged = true;
    const status = orderStatus(result.status);
    await prisma.tideSightTradingOrder.update({
      where: { id: entryOrder.id },
      data: { status, exchangeOrderId: result.exchangeOrderId, filledQuantity: result.filledQuantity, averagePrice: result.averagePrice, rawResponse: json(result.raw), lastReconciledAt: new Date() }
    });
    await prisma.tideSightExecutionPlan.update({ where: { id: planId }, data: { state: stateForOrder(status), executedAt: new Date() } });
    await writeTideSightAudit({ userId, intentId: plan.intentId, planId, orderId: entryOrder.id, state: stateForOrder(status), status: "OK", message: `Binance ${plan.environment}/${plan.market} 主订单已提交，客户端订单号 ${clientOrderId}。` });
    if (status === AlphaOrderStatus.FILLED || (status === AlphaOrderStatus.PARTIALLY_FILLED && result.filledQuantity > 0)) {
      if (status === AlphaOrderStatus.PARTIALLY_FILLED) await client.cancelOrder(plan.intent.symbol, clientOrderId);
      await createPosition(plan, result);
      try {
        await attachProtection(planId, client, credential.id);
      } catch (protectionError) {
        await prisma.tideSightExecutionConfig.update({ where: { userId }, data: { killSwitchActive: true, reconciliationHealthy: false, autoExecuteEnabled: false, autoGeneration: null } });
        const emergency = await client.closePosition({ symbol: plan.intent.symbol, side: plan.intent.side as "LONG" | "SHORT", quantity: result.filledQuantity, clientOrderId: safeClientOrderId("em", plan.id) });
        if (emergency.status === "FILLED") await client.cancelAll(plan.intent.symbol).catch(() => undefined);
        await prisma.tideSightExecutionPlan.update({ where: { id: planId }, data: { state: AlphaExecutionState.KILLED } });
        await writeTideSightAudit({ userId, intentId: plan.intentId, planId, state: AlphaExecutionState.KILLED, status: "EMERGENCY", message: `保护单创建失败，已提交紧急平仓并触发 Kill Switch；须对账确认最终仓位：${protectionError instanceof Error ? protectionError.message : "unknown"}` });
        throw protectionError;
      }
    }
    return { ok: true, planId, order: result };
  } catch (caught) {
    const unknown = entryAcknowledged || (caught instanceof BinanceRequestError && caught.statusUnknown);
    await prisma.tideSightTradingOrder.update({ where: { id: entryOrder.id }, data: { ...(!entryAcknowledged ? { status: unknown ? AlphaOrderStatus.UNKNOWN : AlphaOrderStatus.REJECTED } : {}), errorMessage: caught instanceof Error ? caught.message : "execution failed" } });
    await prisma.tideSightExecutionPlan.update({ where: { id: planId }, data: { state: unknown ? AlphaExecutionState.UNKNOWN : AlphaExecutionState.FAILED } });
    if (unknown) await prisma.tideSightExecutionConfig.update({ where: { userId }, data: { reconciliationHealthy: false } });
    await writeTideSightAudit({ userId, intentId: plan.intentId, planId, orderId: entryOrder.id, state: unknown ? AlphaExecutionState.UNKNOWN : AlphaExecutionState.FAILED, status: "ERROR", message: caught instanceof Error ? caught.message : "执行失败" });
    throw caught;
  } finally {
    await client.close();
  }
}

export async function reconcileExecution(userId: string, scope: { environment?: AlphaExecutionMode; market?: AlphaMarketType } = {}) {
  return withExecutionLease(userId, () => reconcileExecutionLocked(userId, scope));
}
async function reconcileExecutionLocked(userId: string, scope: { environment?: AlphaExecutionMode; market?: AlphaMarketType } = {}) {
  const config = await getOrCreateTideSightExecutionConfig(userId);
  const orders = await prisma.tideSightTradingOrder.findMany({
    where: {
      userId,
      environment: scope.environment ?? { in: [AlphaExecutionMode.TESTNET, AlphaExecutionMode.LIVE] },
      ...(scope.market ? { market: scope.market } : {}),
      status: { notIn: TERMINAL_ORDER_STATES }
    },
    orderBy: { createdAt: "asc" },
      take: 100,
    include: { plan: { include: { intent: true } }, credential: true }
  });
  const errors: string[] = [];
  const accountSnapshots: Array<{ environment: AlphaExecutionMode; market: AlphaMarketType; equity: number; updatedAt: string }> = [];
  let reconciled = 0;
  for (const order of orders) {
    if (!order.credential) continue;
    const client = clientFromCredential(order.credential);
    try {
      const isConditional = order.market === AlphaMarketType.FUTURES
        && (order.role === AlphaOrderRole.STOP_LOSS || order.role === AlphaOrderRole.TAKE_PROFIT);
      const result = await client.getOrder(order.symbol, order.clientOrderId, isConditional);
      const status = orderStatus(result.status);
      if (status === AlphaOrderStatus.UNKNOWN) throw new BinanceRequestError("交易所订单状态未确认，对账保持异常", 409, null, true);
      await prisma.tideSightTradingOrder.update({
        where: { id: order.id },
        data: { status, exchangeOrderId: result.exchangeOrderId, filledQuantity: result.filledQuantity, averagePrice: result.averagePrice, rawResponse: json(result.raw), errorMessage: null, lastReconciledAt: new Date() }
      });
      reconciled++;
      if (order.role === AlphaOrderRole.ENTRY && status === AlphaOrderStatus.FILLED) {
        const plan = await prisma.tideSightExecutionPlan.findUniqueOrThrow({ where: { id: order.planId } });
        await createPosition(plan, result);
        await attachProtection(order.planId, client, order.credential.id);
      }
      if (order.role === AlphaOrderRole.CLOSE && status === AlphaOrderStatus.FILLED) {
        const position = await prisma.tideSightTradingPosition.findUnique({ where: { planId: order.planId } });
        if (position) {
          const exitPrice = Number(result.averagePrice ?? position.markPrice ?? position.entryPrice);
          const direction = position.side === "LONG" ? 1 : -1;
          await prisma.tideSightTradingPosition.update({
            where: { id: position.id },
            data: { state: AlphaExecutionState.CLOSED, markPrice: exitPrice, unrealizedPnl: (exitPrice - position.entryPrice) * position.quantity * direction, lastReconciledAt: new Date(), closedAt: new Date() }
          });
          await prisma.tideSightExecutionPlan.update({ where: { id: order.planId }, data: { state: AlphaExecutionState.RECONCILED } });
          await writeTideSightAudit({ userId, intentId: order.plan.intentId, planId: order.planId, orderId: order.id, state: AlphaExecutionState.CLOSED, status: "MANUAL_CLOSE_FILLED", message: `${order.symbol} 人工平仓订单已成交并完成对账。` });
        }
      }
      if (isConditional && status === AlphaOrderStatus.FILLED) {
        const sibling = await prisma.tideSightTradingOrder.findFirst({
          where: {
            planId: order.planId,
            id: { not: order.id },
            role: { in: [AlphaOrderRole.STOP_LOSS, AlphaOrderRole.TAKE_PROFIT] },
            status: { notIn: TERMINAL_ORDER_STATES }
          }
        });
        if (sibling) {
          try {
            await client.cancelOrder(sibling.symbol, sibling.clientOrderId, true);
            await prisma.tideSightTradingOrder.update({
              where: { id: sibling.id },
              data: { status: AlphaOrderStatus.CANCELED, lastReconciledAt: new Date() }
            });
          } catch (caught) {
            const message = caught instanceof Error ? caught.message : "Algo sibling cancel failed";
            errors.push(`${sibling.symbol} sibling protection: ${message}`);
            await prisma.tideSightTradingOrder.update({
              where: { id: sibling.id },
              data: { status: AlphaOrderStatus.UNKNOWN, errorMessage: message, lastReconciledAt: new Date() }
            });
          }
        }
        const position = await prisma.tideSightTradingPosition.findUnique({ where: { planId: order.planId } });
        if (position) {
          const exitPrice = Number(result.averagePrice ?? position.markPrice ?? position.entryPrice);
          const direction = position.side === "LONG" ? 1 : -1;
          await prisma.tideSightTradingPosition.update({
            where: { id: position.id },
            data: {
              state: AlphaExecutionState.CLOSED,
              markPrice: exitPrice,
              unrealizedPnl: (exitPrice - position.entryPrice) * position.quantity * direction,
              lastReconciledAt: new Date(),
              closedAt: new Date()
            }
          });
        }
        await prisma.tideSightExecutionPlan.update({ where: { id: order.planId }, data: { state: AlphaExecutionState.RECONCILED } });
        await writeTideSightAudit({
          userId,
          intentId: order.plan.intentId,
          planId: order.planId,
          orderId: order.id,
          state: AlphaExecutionState.RECONCILED,
          status: "CLOSED",
          message: `${order.symbol} ${order.role} 已成交；另一张 Algo 保护单已撤销，持仓已结案。`
        });
      }
    } catch (caught) {
      const missingLongEnough = isBinanceMissingOrderError(caught)
        && Date.now() - order.createdAt.getTime() >= MISSING_ORDER_SETTLEMENT_GRACE_MS;
      if (missingLongEnough) {
        const status = order.status === AlphaOrderStatus.PENDING && !order.exchangeOrderId && !order.rawResponse
          ? AlphaOrderStatus.REJECTED
          : AlphaOrderStatus.CANCELED;
        const message = `Binance 已确认订单不存在；本地 ${order.status} 已归一化为 ${status}`;
        await prisma.tideSightTradingOrder.update({
          where: { id: order.id },
          data: { status, errorMessage: message, lastReconciledAt: new Date() }
        });
        if (order.role === AlphaOrderRole.ENTRY && status === AlphaOrderStatus.REJECTED) {
          await prisma.tideSightExecutionPlan.update({ where: { id: order.planId }, data: { state: AlphaExecutionState.FAILED } });
        }
        reconciled++;
        await writeTideSightAudit({
          userId,
          intentId: order.plan.intentId,
          planId: order.planId,
          orderId: order.id,
          state: AlphaExecutionState.RECONCILED,
          status: "REMOTE_ORDER_MISSING",
          message: `${order.symbol} ${order.role} 在 Binance 不存在；已按可证明的交易所终态完成本地归一化。`,
          metadata: { previousStatus: order.status, status, binanceCode: caught instanceof BinanceRequestError ? caught.code : null }
        });
      } else {
        errors.push(`${order.symbol}: ${caught instanceof Error ? caught.message : "unknown"}`);
        await prisma.tideSightTradingOrder.update({ where: { id: order.id }, data: { status: AlphaOrderStatus.UNKNOWN, errorMessage: caught instanceof Error ? caught.message : "订单状态未确认", lastReconciledAt: new Date() } });
      }
    } finally {
      await client.close();
    }
  }

  const positions = await prisma.tideSightTradingPosition.findMany({
    where: {
      userId,
      ...(scope.environment ? { environment: scope.environment } : {}),
      ...(scope.market ? { market: scope.market } : {}),
      state: { in: ACTIVE_POSITION_STATES }
    }
  });
  for (const position of positions) {
    if (position.environment !== AlphaExecutionMode.TESTNET && position.environment !== AlphaExecutionMode.LIVE) continue;
    const credential = await credentialFor(userId, position.environment, position.market);
    if (!credential) continue;
    const client = clientFromCredential(credential);
    try {
      if (position.market === AlphaMarketType.FUTURES) {
        const remote = await client.getFuturesPosition(position.symbol);
        if (!remote || remote.quantity <= 0 || !remote.side) {
          if ((credential.permissionSummary as Record<string, unknown> | null)?.accountMode === "portfolio") {
            // A zero position is not evidence that an unknown triggered child
            // was canceled (nor evidence of its fill price).
            const unsettled = await prisma.tideSightTradingOrder.count({ where: { planId: position.planId, status: AlphaOrderStatus.UNKNOWN } });
            if (unsettled) throw new Error("PAPI 仓位归零但仍有未确认订单，保留待对账状态，不伪造撤单或退出成交");
            await client.cancelAll(position.symbol);
            const confirmed = await client.getFuturesPosition(position.symbol);
            if (!confirmed || confirmed.quantity !== 0) throw new Error("PAPI 清理残余挂单后仓位仍未确认归零");
          }
          const mark = remote?.markPrice ?? position.markPrice ?? position.entryPrice;
          const direction = position.side === "LONG" ? 1 : -1;
          await prisma.$transaction([
            prisma.tideSightTradingPosition.update({
              where: { id: position.id },
              data: { state: AlphaExecutionState.CLOSED, markPrice: mark, unrealizedPnl: (mark - position.entryPrice) * position.quantity * direction, lastReconciledAt: new Date(), closedAt: new Date() }
            }),
            prisma.tideSightExecutionPlan.update({ where: { id: position.planId }, data: { state: AlphaExecutionState.RECONCILED } }),
            prisma.tideSightTradingOrder.updateMany({
              where: { planId: position.planId, status: { notIn: TERMINAL_ORDER_STATES } },
              data: { status: AlphaOrderStatus.CANCELED, errorMessage: "Binance 持仓已归零，剩余本地订单已终结", lastReconciledAt: new Date() }
            })
          ]);
          await writeTideSightAudit({
            userId,
            intentId: undefined,
            planId: position.planId,
            state: AlphaExecutionState.CLOSED,
            status: "POSITION_CLOSED_EXTERNALLY",
            message: `${position.symbol} Binance 持仓已归零；本地持仓和残留订单已按交易所事实结案。`
          });
          continue;
        }
        if (remote.side !== position.side) {
          const message = `${position.symbol} 本地 ${position.side} 与 Binance ${remote.side} 持仓方向不一致`;
          errors.push(message);
          await prisma.tideSightTradingPosition.update({
            where: { id: position.id },
            data: { state: AlphaExecutionState.UNKNOWN, markPrice: remote.markPrice, unrealizedPnl: remote.unrealizedPnl, lastReconciledAt: new Date() }
          });
          continue;
        }

        const activeOrders = await prisma.tideSightTradingOrder.findMany({
          where: { planId: position.planId, status: { in: ACTIVE_PROTECTION_ORDER_STATES } },
          select: { role: true }
        });
        const activeClose = activeOrders.some((order) => order.role === AlphaOrderRole.CLOSE);
        const hasStopLoss = activeOrders.some((order) => order.role === AlphaOrderRole.STOP_LOSS);
        const hasTakeProfit = activeOrders.some((order) => order.role === AlphaOrderRole.TAKE_PROFIT);
        const protectionComplete = hasStopLoss && hasTakeProfit;
        const protectionRequired = config.requireProtectionOrders && !activeClose;
        const nextState = activeClose
          ? AlphaExecutionState.RECONCILING
          : protectionRequired
            ? protectionComplete ? AlphaExecutionState.PROTECTION_ACTIVE : AlphaExecutionState.UNKNOWN
            : AlphaExecutionState.MONITORING;
        const nextEntry = remote.entryPrice ?? position.entryPrice;
        const nextMark = remote.markPrice ?? position.markPrice ?? nextEntry;
        const quantityTolerance = Math.max(1e-9, Math.max(position.quantity, remote.quantity) * 1e-8);
        const quantityChanged = Math.abs(position.quantity - remote.quantity) > quantityTolerance;
        const entryChanged = Math.abs(position.entryPrice - nextEntry) > Math.max(1e-9, Math.abs(nextEntry) * 1e-8);
        const recovered = position.state === AlphaExecutionState.UNKNOWN && nextState !== AlphaExecutionState.UNKNOWN;
        await prisma.tideSightTradingPosition.update({
          where: { id: position.id },
          data: {
            quantity: remote.quantity,
            entryPrice: nextEntry,
            markPrice: nextMark,
            unrealizedPnl: remote.unrealizedPnl,
            lastReconciledAt: new Date(),
            state: nextState
          }
        });
        if (quantityChanged || entryChanged || recovered) {
          await writeTideSightAudit({
            userId,
            planId: position.planId,
            state: nextState,
            status: "POSITION_SYNCED",
            message: `${position.symbol} 本地持仓已按 Binance 权威持仓同步。`,
            metadata: {
              previousQuantity: position.quantity,
              quantity: remote.quantity,
              previousEntryPrice: position.entryPrice,
              entryPrice: nextEntry,
              recovered
            }
          });
        }
        if (protectionRequired && !protectionComplete) {
          errors.push(`${position.symbol} protection: Binance 活跃持仓缺少${!hasStopLoss && !hasTakeProfit ? "止损与止盈" : !hasStopLoss ? "止损" : "止盈"}保护单`);
        }
      } else {
        const mark = await client.getPrice(position.symbol);
        const direction = position.side === "LONG" ? 1 : -1;
        await prisma.tideSightTradingPosition.update({
          where: { id: position.id },
          data: { markPrice: mark, unrealizedPnl: (mark - position.entryPrice) * position.quantity * direction, lastReconciledAt: new Date(), state: position.state }
        });
      }
    } catch (caught) {
      errors.push(`${position.symbol} mark: ${caught instanceof Error ? caught.message : "unknown"}`);
    } finally {
      await client.close();
    }
  }

  const scopedCredentials = await prisma.tideSightTradingCredential.findMany({
    where: {
      userId,
      environment: scope.environment ?? { in: [AlphaExecutionMode.TESTNET, AlphaExecutionMode.LIVE] },
      ...(scope.market ? { market: scope.market } : {}),
      enabled: true,
      verifiedAt: { not: null }
    }
  });
  for (const credential of scopedCredentials) {
    const client = clientFromCredential(credential);
    try {
      const snapshot = await client.preflight();
      await prisma.tideSightTradingCredential.update({
        where: { id: credential.id },
        data: { permissionSummary: json(snapshot), lastError: null }
      });
      accountSnapshots.push({
        environment: credential.environment,
        market: credential.market,
        equity: Number(snapshot.equity) || 0,
        updatedAt: snapshot.updateTime
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "account snapshot failed";
      errors.push(`${credential.environment}/${credential.market} account: ${message}`);
      await prisma.tideSightTradingCredential.update({ where: { id: credential.id }, data: { lastError: message } }).catch(() => undefined);
    } finally {
      await client.close();
    }
  }

  await prisma.tideSightExecutionConfig.update({
    where: { userId },
    data: { lastReconciledAt: new Date(), reconciliationHealthy: errors.length === 0 }
  });
  await writeTideSightAudit({
    userId,
    state: AlphaExecutionState.RECONCILED,
    status: errors.length ? "WARNING" : "OK",
    message: errors.length ? `本轮对账完成，但有 ${errors.length} 项异常。` : `本轮订单与持仓对账完成，共核对 ${reconciled} 笔订单。`,
    metadata: { reconciled, accountSnapshots, errors: errors.slice(0, 8), previousHealthy: config.reconciliationHealthy }
  });
  return { ok: errors.length === 0, reconciled, accountSnapshots, errors };
}

async function requireLivePosition(positionId: string, userId: string) {
  const position = await prisma.tideSightTradingPosition.findFirst({
    where: { id: positionId, userId, environment: AlphaExecutionMode.LIVE, state: { in: ACTIVE_POSITION_STATES } },
    include: { plan: { include: { intent: true, orders: true } } }
  });
  if (!position) throw new Error("生产实盘持仓不存在、已关闭或不属于当前账户");
  const credential = await credentialFor(userId, AlphaExecutionMode.LIVE, position.market);
  if (!credential?.verifiedAt || !credential.enabled) throw new Error("生产实盘 Binance 凭据尚未通过校验");
  return { position, credential };
}

async function cancelPositionProtectionOrders(client: TideSightBinanceClient, position: Awaited<ReturnType<typeof requireLivePosition>>["position"]) {
  const activeProtection = position.plan.orders.filter((order) =>
    (order.role === AlphaOrderRole.STOP_LOSS || order.role === AlphaOrderRole.TAKE_PROFIT)
    && order.status !== AlphaOrderStatus.FILLED
    && order.status !== AlphaOrderStatus.CANCELED
    && order.status !== AlphaOrderStatus.REJECTED
    && order.status !== AlphaOrderStatus.EXPIRED
  );
  if (!activeProtection.length) return;
  if (position.market === AlphaMarketType.SPOT) {
    await client.cancelOrder(position.symbol, activeProtection[0].clientOrderId, false);
  } else {
    for (const order of activeProtection) await client.cancelOrder(position.symbol, order.clientOrderId, true);
  }
  await prisma.tideSightTradingOrder.updateMany({
    where: { id: { in: activeProtection.map((order) => order.id) } },
    data: { status: AlphaOrderStatus.CANCELED, lastReconciledAt: new Date() }
  });
}

export async function closeLivePosition(positionId: string, userId: string) {
  const { position, credential } = await requireLivePosition(positionId, userId);
  const existingClose = position.plan.orders.find((order) => order.role === AlphaOrderRole.CLOSE);
  if (existingClose && existingClose.status !== AlphaOrderStatus.REJECTED && existingClose.status !== AlphaOrderStatus.CANCELED && existingClose.status !== AlphaOrderStatus.EXPIRED) {
    return { ok: true, idempotent: true, positionId, order: existingClose };
  }
  const client = clientFromCredential(credential);
  const clientOrderId = safeClientOrderId("cl", position.planId);
  let closeOrder: Awaited<ReturnType<typeof createOrderRecord>> | null = null;
  try {
    closeOrder = await createOrderRecord({
      userId,
      planId: position.planId,
      credentialId: credential.id,
      environment: AlphaExecutionMode.LIVE,
      market: position.market,
      role: AlphaOrderRole.CLOSE,
      symbol: position.symbol,
      side: position.side === "LONG" ? "SELL" : "BUY",
      orderType: "MARKET",
      quantity: position.quantity,
      clientOrderId
    });
    const result = await client.closePosition({
      symbol: position.symbol,
      side: position.side as "LONG" | "SHORT",
      quantity: position.quantity,
      clientOrderId
    });
    const status = orderStatus(result.status);
    const exitPrice = Number(result.averagePrice ?? position.markPrice ?? position.entryPrice);
    const direction = position.side === "LONG" ? 1 : -1;
    if (status === AlphaOrderStatus.FILLED) await cancelPositionProtectionOrders(client, position);
    await prisma.$transaction([
      prisma.tideSightTradingOrder.update({
        where: { id: closeOrder.id },
        data: { status, exchangeOrderId: result.exchangeOrderId, filledQuantity: result.filledQuantity, averagePrice: result.averagePrice, rawResponse: json(result.raw), lastReconciledAt: new Date() }
      }),
      prisma.tideSightTradingPosition.update({
        where: { id: position.id },
        data: status === AlphaOrderStatus.FILLED
          ? { state: AlphaExecutionState.CLOSED, markPrice: exitPrice, unrealizedPnl: (exitPrice - position.entryPrice) * position.quantity * direction, closedAt: new Date(), lastReconciledAt: new Date() }
          : { state: AlphaExecutionState.RECONCILING, lastReconciledAt: new Date() }
      }),
      prisma.tideSightExecutionPlan.update({ where: { id: position.planId }, data: { state: status === AlphaOrderStatus.FILLED ? AlphaExecutionState.RECONCILED : AlphaExecutionState.RECONCILING } })
    ]);
    await writeTideSightAudit({ userId, intentId: position.plan.intentId, planId: position.planId, orderId: closeOrder.id, state: status === AlphaOrderStatus.FILLED ? AlphaExecutionState.CLOSED : AlphaExecutionState.RECONCILING, status: "MANUAL_CLOSE", message: `${position.symbol} 已提交生产实盘人工平仓；只在成交确认后撤销原保护单。`, metadata: { clientOrderId, status } });
    return { ok: true, positionId, order: result };
  } catch (caught) {
    const statusUnknown = caught instanceof BinanceRequestError && caught.statusUnknown;
    const message = caught instanceof Error ? caught.message : "生产实盘平仓失败";
    if (closeOrder) {
      await prisma.tideSightTradingOrder.update({
        where: { id: closeOrder.id },
        data: {
          status: statusUnknown ? AlphaOrderStatus.UNKNOWN : AlphaOrderStatus.REJECTED,
          errorMessage: message,
          lastReconciledAt: new Date()
        }
      }).catch(() => undefined);
    }
    await prisma.tideSightTradingPosition.update({ where: { id: position.id }, data: { state: AlphaExecutionState.UNKNOWN, lastReconciledAt: new Date() } }).catch(() => undefined);
    await prisma.tideSightExecutionPlan.update({ where: { id: position.planId }, data: { state: AlphaExecutionState.UNKNOWN } }).catch(() => undefined);
    await prisma.tideSightExecutionConfig.update({ where: { userId }, data: { reconciliationHealthy: false } }).catch(() => undefined);
    await writeTideSightAudit({
      userId,
      intentId: position.plan.intentId,
      planId: position.planId,
      orderId: closeOrder?.id,
      state: AlphaExecutionState.UNKNOWN,
      status: "MANUAL_CLOSE_ERROR",
      message,
      metadata: { statusUnknown, orderStatus: statusUnknown ? AlphaOrderStatus.UNKNOWN : AlphaOrderStatus.REJECTED, binanceCode: caught instanceof BinanceRequestError ? caught.code : null }
    });
    throw caught;
  } finally {
    await client.close();
  }
}

export async function replaceLivePositionProtection(positionId: string, userId: string, stopLoss: number, takeProfit: number) {
  const { position, credential } = await requireLivePosition(positionId, userId);
  const currentPrice = await getLiveBinanceReferencePrice(engineMarket(position.market) as "spot" | "futures", position.symbol);
  const directionValid = position.side === "LONG"
    ? stopLoss < currentPrice && takeProfit > currentPrice
    : takeProfit < currentPrice && stopLoss > currentPrice;
  if (!directionValid) throw new Error(`止损 / 止盈方向无效；当前 Binance 实时价为 ${currentPrice}`);
  const client = clientFromCredential(credential);
  const suffix = randomUUID().replace(/-/g, "").slice(-10);
  const stopClientOrderId = safeClientOrderId("sr", `${position.planId}${suffix}`);
  const takeProfitClientOrderId = safeClientOrderId("tr", `${position.planId}${suffix}`);
  try {
    const response = await client.placeProtection({
      symbol: position.symbol,
      quantity: position.quantity,
      stopLoss,
      takeProfit,
      side: position.side as "LONG" | "SHORT",
      stopClientOrderId,
      takeProfitClientOrderId,
      listClientOrderId: safeClientOrderId("or", `${position.planId}${suffix}`)
    });
    await cancelPositionProtectionOrders(client, position);
    const protection = position.plan.protectionOrders as Array<Record<string, unknown>>;
    const nextProtection = protection.map((order) => ({
      ...order,
      stopPrice: String(order.type).includes("TAKE_PROFIT") ? takeProfit : stopLoss
    }));
    const stopOrder = position.plan.orders.find((order) => order.role === AlphaOrderRole.STOP_LOSS);
    const targetOrder = position.plan.orders.find((order) => order.role === AlphaOrderRole.TAKE_PROFIT);
    if (!stopOrder || !targetOrder) throw new Error("数据库缺少原止损或止盈订单，已停止保护单替换");
    await prisma.$transaction([
      prisma.tideSightTradingOrder.update({ where: { id: stopOrder.id }, data: { clientOrderId: stopClientOrderId, stopPrice: stopLoss, status: AlphaOrderStatus.NEW, rawResponse: json(response), errorMessage: null, lastReconciledAt: new Date() } }),
      prisma.tideSightTradingOrder.update({ where: { id: targetOrder.id }, data: { clientOrderId: takeProfitClientOrderId, stopPrice: takeProfit, status: AlphaOrderStatus.NEW, rawResponse: json(response), errorMessage: null, lastReconciledAt: new Date() } }),
      prisma.tideSightTradingPosition.update({ where: { id: position.id }, data: { stopLoss, takeProfit, state: AlphaExecutionState.PROTECTION_ACTIVE, lastReconciledAt: new Date() } }),
      prisma.tideSightExecutionPlan.update({ where: { id: position.planId }, data: { protectionOrders: json(nextProtection), state: AlphaExecutionState.PROTECTION_ACTIVE } })
    ]);
    await writeTideSightAudit({ userId, intentId: position.plan.intentId, planId: position.planId, state: AlphaExecutionState.PROTECTION_ACTIVE, status: "PROTECTION_REPLACED", message: `${position.symbol} 生产实盘止损 / 止盈已由操作员替换。`, metadata: { previousStopLoss: position.stopLoss, previousTakeProfit: position.takeProfit, stopLoss, takeProfit, currentPrice } });
    return { ok: true, positionId, stopLoss, takeProfit, currentPrice };
  } catch (caught) {
    await prisma.tideSightExecutionConfig.update({ where: { userId }, data: { killSwitchActive: true, reconciliationHealthy: false, autoExecuteEnabled: false, autoGeneration: null } }).catch(() => undefined);
    await prisma.tideSightTradingPosition.update({ where: { id: position.id }, data: { state: AlphaExecutionState.UNKNOWN } }).catch(() => undefined);
    await writeTideSightAudit({ userId, intentId: position.plan.intentId, planId: position.planId, state: AlphaExecutionState.UNKNOWN, status: "EMERGENCY", message: `保护单替换未确认；未主动撤销可能仍有效的保护单，新增风险已冻结。请人工核对交易所保护单：${caught instanceof Error ? caught.message : "unknown"}` });
    throw caught;
  } finally {
    await client.close();
  }
}

export async function releaseKillSwitch(userId: string) {
  const config = await prisma.tideSightExecutionConfig.findUnique({ where: { userId } });
  if (!config) throw new Error("交易执行配置不存在");
  if (!config.killSwitchActive) return { ok: true, idempotent: true };
  if (!config.reconciliationHealthy) throw new Error("最近一次对账不健康，不能解除 Kill Switch");
  if (!config.lastReconciledAt || Date.now() - config.lastReconciledAt.getTime() > KILL_SWITCH_RECONCILIATION_MAX_AGE_MS) {
    throw new Error("最近一次健康对账已过期，请先重新执行实盘对账");
  }

  const [unknownPositions, unknownOrders, inFlightCloseOrders, activeLivePositions] = await Promise.all([
    prisma.tideSightTradingPosition.count({ where: { userId, state: AlphaExecutionState.UNKNOWN } }),
    prisma.tideSightTradingOrder.count({ where: { userId, environment: AlphaExecutionMode.LIVE, status: AlphaOrderStatus.UNKNOWN } }),
    prisma.tideSightTradingOrder.count({
      where: {
        userId,
        environment: AlphaExecutionMode.LIVE,
        role: AlphaOrderRole.CLOSE,
        status: { in: [AlphaOrderStatus.PENDING, AlphaOrderStatus.SUBMITTED, AlphaOrderStatus.NEW, AlphaOrderStatus.PARTIALLY_FILLED] }
      }
    }),
    prisma.tideSightTradingPosition.findMany({
      where: { userId, environment: AlphaExecutionMode.LIVE, state: { in: ACTIVE_POSITION_STATES } },
      select: {
        symbol: true,
        plan: { select: { orders: { select: { role: true, status: true } } } }
      }
    })
  ]);
  if (unknownPositions) throw new Error(`仍有 ${unknownPositions} 个状态未知的持仓，不能解除 Kill Switch`);
  if (unknownOrders) throw new Error(`仍有 ${unknownOrders} 笔状态未知的订单，不能解除 Kill Switch`);
  if (inFlightCloseOrders) throw new Error(`仍有 ${inFlightCloseOrders} 笔平仓订单正在对账，不能解除 Kill Switch`);
  if (config.requireProtectionOrders) {
    const unprotected = activeLivePositions.filter((position) => {
      const active = position.plan.orders.filter((order) => ACTIVE_PROTECTION_ORDER_STATES.includes(order.status));
      return !active.some((order) => order.role === AlphaOrderRole.STOP_LOSS)
        || !active.some((order) => order.role === AlphaOrderRole.TAKE_PROFIT);
    });
    if (unprotected.length) throw new Error(`实盘持仓 ${unprotected.map((position) => position.symbol).join(", ")} 缺少完整止损/止盈保护，不能解除 Kill Switch`);
  }

  await prisma.tideSightExecutionConfig.update({ where: { userId }, data: { killSwitchActive: false } });
  await writeTideSightAudit({
    userId,
    state: AlphaExecutionState.RECONCILED,
    status: "OK",
    message: "管理员在健康对账、零 UNKNOWN 与完整持仓保护校验后解除 Kill Switch。",
    metadata: { lastReconciledAt: config.lastReconciledAt.toISOString(), activeLivePositions: activeLivePositions.length }
  });
  return { ok: true, idempotent: false };
}

export async function triggerKillSwitch(userId: string) {
  await prisma.tideSightExecutionConfig.update({ where: { userId }, data: { killSwitchActive: true, autoExecuteEnabled: false, autoGeneration: null } });
  const positions = await prisma.tideSightTradingPosition.findMany({ where: { userId, state: { in: ACTIVE_POSITION_STATES } } });
  const outcomes: Array<Record<string, unknown>> = [];
  for (const position of positions) {
    if (position.environment === AlphaExecutionMode.PAPER || position.environment === AlphaExecutionMode.MOCK_EXCHANGE) {
      await prisma.tideSightTradingPosition.update({ where: { id: position.id }, data: { state: AlphaExecutionState.KILLED, closedAt: new Date() } });
      outcomes.push({ symbol: position.symbol, environment: position.environment, closed: true });
      continue;
    }
    const credential = await credentialFor(userId, position.environment, position.market);
    if (!credential) {
      outcomes.push({ symbol: position.symbol, environment: position.environment, closed: false, error: "credential unavailable" });
      continue;
    }
    const client = clientFromCredential(credential);
    try {
      const result = await client.closePosition({ symbol: position.symbol, side: position.side as "LONG" | "SHORT", quantity: position.quantity, clientOrderId: safeClientOrderId("ks", position.planId) });
      if (result.status !== "FILLED") throw new Error("紧急平仓尚未确认成交；保留保护单并等待对账");
      await client.cancelAll(position.symbol);
      await prisma.tideSightTradingPosition.update({ where: { id: position.id }, data: { state: AlphaExecutionState.KILLED, closedAt: new Date() } });
      outcomes.push({ symbol: position.symbol, environment: position.environment, closed: true });
    } catch (caught) {
      await prisma.tideSightTradingPosition.update({ where: { id: position.id }, data: { state: AlphaExecutionState.UNKNOWN } });
      outcomes.push({ symbol: position.symbol, environment: position.environment, closed: false, error: caught instanceof Error ? caught.message : "unknown" });
    } finally {
      await client.close();
    }
  }
  await prisma.tideSightExecutionPlan.updateMany({ where: { userId, state: { in: [AlphaExecutionState.PLANNED, AlphaExecutionState.AWAITING_CONFIRMATION] } }, data: { state: AlphaExecutionState.KILLED } });
  await writeTideSightAudit({ userId, state: AlphaExecutionState.KILLED, status: outcomes.some((item) => item.closed === false) ? "WARNING" : "FINAL", message: "Kill Switch 已触发：停止自动执行、撤销待执行计划，并处置所有可识别持仓。", metadata: { outcomes } });
  return { ok: outcomes.every((item) => item.closed !== false), outcomes };
}
