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
  AlphaBinanceClient,
  BinanceRequestError,
  getLiveBinanceReferencePrice,
  isBinanceMissingOrderError,
  type BinanceOrderResult
} from "@/lib/alpha-execution/binance";
import { decryptTradingSecret } from "@/lib/alpha-execution/credentials";
import { getOrCreateAlphaExecutionConfig, marketFrom, modeFrom, writeAlphaAudit } from "@/lib/alpha-execution/data";
import riskEngine from "@/workers/risk_engine.js";
import type { AlphaAutomationStrategy } from "./automation-strategy";

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
const credentialSecretSelect = {
  id: true,
  userId: true,
  environment: true,
  market: true,
  apiKeyEncrypted: true,
  apiSecretEncrypted: true,
  proxyEncrypted: true,
  verifiedAt: true,
  enabled: true
} satisfies Prisma.AlphaTradingCredentialSelect;

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
  return `ar${prefix}${id.replace(/[^a-zA-Z0-9]/g, "").slice(-24)}`.slice(0, 36);
}

function idempotency(environment: AlphaExecutionMode, market: AlphaMarketType, planId: string, role: AlphaOrderRole) {
  return createHash("sha256").update(`${environment}|${market}|${planId}|${role}`).digest("hex");
}

async function credentialFor(userId: string, environment: AlphaExecutionMode, market: AlphaMarketType) {
  if (environment !== AlphaExecutionMode.TESTNET && environment !== AlphaExecutionMode.LIVE) return null;
  return prisma.alphaTradingCredential.findUnique({
    where: { userId_environment_market: { userId, environment, market } },
    select: credentialSecretSelect
  });
}

function clientFromCredential(credential: NonNullable<Awaited<ReturnType<typeof credentialFor>>>) {
  return new AlphaBinanceClient({
    environment: credential.environment === AlphaExecutionMode.LIVE ? "live" : "testnet",
    market: credential.market === AlphaMarketType.SPOT ? "spot" : "futures",
    apiKey: decryptTradingSecret(credential.apiKeyEncrypted),
    apiSecret: decryptTradingSecret(credential.apiSecretEncrypted),
    proxy: credential.proxyEncrypted ? decryptTradingSecret(credential.proxyEncrypted) : null
  });
}

export async function preflightCredential(userId: string, environment: AlphaExecutionMode, market: AlphaMarketType) {
  const credential = await credentialFor(userId, environment, market);
  if (!credential) throw new Error("请先保存当前环境的 Binance API Key");
  const client = clientFromCredential(credential);
  try {
    const result = await client.preflight();
    await prisma.alphaTradingCredential.update({
      where: { id: credential.id },
      data: { verifiedAt: new Date(), permissionSummary: json(result), lastError: null, enabled: true }
    });
    await writeAlphaAudit({
      userId,
      state: AlphaExecutionState.RECONCILED,
      status: "OK",
      message: `${environment}/${market} Binance 连接、签名与交易权限校验通过。`,
      metadata: { environment, market, canTrade: result.canTrade, accountType: result.accountType }
    });
    return result;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Binance preflight failed";
    await prisma.alphaTradingCredential.update({ where: { id: credential.id }, data: { lastError: message, verifiedAt: null } });
    throw caught;
  } finally {
    await client.close();
  }
}

export async function approveTradeIntent(input: Record<string, unknown>, userId: string, twoFactorPassed: boolean,
  automation?: { context: Record<string, unknown>; policy: Record<string, number>; maxQuantity: number;
    quantityStep: number; minQuantity: number; minNotional: number; matchedStrategies: AlphaAutomationStrategy[] }): Promise<Record<string, any>> {
  if (String(input.source ?? "").startsWith("alpha-auto:") && !automation) throw new Error("自动交易意图只能由已授权的服务端任务创建");
  const config = await getOrCreateAlphaExecutionConfig(userId);
  const environment = modeFrom(String(input.mode ?? config.activeMode));
  const market = marketFrom(String(input.market ?? config.defaultMarket));
  const credential = await credentialFor(userId, environment, market);
  const submittedSymbol = String(input.symbol).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const normalizedSymbol = submittedSymbol.endsWith("USDT") ? submittedSymbol : `${submittedSymbol}USDT`;
  const marketReferencePrice = await getLiveBinanceReferencePrice(engineMarket(market) as "spot" | "futures", normalizedSymbol);
  const now = new Date();
  const dedupeWindowStart = new Date(now.getTime() - config.dedupeWindowMinutes * 60_000);
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const [recentEntryOrders, positions, todayOrders] = await Promise.all([
    prisma.alphaTradingOrder.findMany({
      where: { userId, environment, market, role: AlphaOrderRole.ENTRY, createdAt: { gte: dedupeWindowStart } },
      select: { symbol: true, side: true, status: true, exchangeOrderId: true, filledQuantity: true, createdAt: true }
    }),
    prisma.alphaTradingPosition.findMany({
      where: { userId, environment, market, state: { in: ACTIVE_POSITION_STATES } },
      select: { quantity: true, markPrice: true, entryPrice: true }
    }),
    prisma.alphaTradingOrder.findMany({
      where: { userId, environment, market, role: AlphaOrderRole.ENTRY, createdAt: { gte: startOfDay }, status: { in: [AlphaOrderStatus.SUBMITTED, AlphaOrderStatus.NEW, AlphaOrderStatus.PARTIALLY_FILLED, AlphaOrderStatus.FILLED] } },
      select: { quantity: true, averagePrice: true, price: true }
    })
  ]);

  let runtimeEquity = Number(input.equity ?? 10_000);
  if (environment === AlphaExecutionMode.TESTNET || environment === AlphaExecutionMode.LIVE) {
    if (!credential?.verifiedAt || !credential.enabled) runtimeEquity = 0;
    else {
      const client = clientFromCredential(credential);
      try {
        runtimeEquity = Number((await client.preflight()).equity ?? 0);
      } finally {
        await client.close();
      }
    }
  }

  const result = evaluateTradeIntent(
    {
      ...input,
      symbol: normalizedSymbol,
      entryPrice: marketReferencePrice,
      mode: engineMode(environment),
      market: engineMarket(market),
      leverage: market === AlphaMarketType.SPOT ? 1 : input.leverage
    },
    {
      equity: runtimeEquity,
      dailyPnl: environment === AlphaExecutionMode.PAPER || environment === AlphaExecutionMode.MOCK_EXCHANGE
        ? Number(input.dailyPnl ?? 0)
        : 0,
      openPositions: positions.length,
      openNotional: positions.reduce((total, position) => total + position.quantity * Number(position.markPrice ?? position.entryPrice), 0),
      dailyExecutedNotional: todayOrders.reduce((total, order) => total + order.quantity * Number(order.averagePrice ?? order.price ?? 0), 0),
      recentIntents: recentEntryOrders
        .filter((order) => shouldBlockDedupeFromEntryOrder(order))
        .map((order) => ({ symbol: order.symbol, side: order.side, createdAt: order.createdAt })),
      killSwitch: config.killSwitchActive,
      environmentEnabled: environment === AlphaExecutionMode.TESTNET ? config.testnetEnabled : environment === AlphaExecutionMode.LIVE ? config.liveEnabled : true,
      credentialConfigured: Boolean(credential?.verifiedAt && credential.enabled),
      liveUnlocked: Boolean(config.liveUnlockedAt),
      liveTradingEnabled: config.liveEnabled,
      twoFactorPassed,
      reconciliationHealthy: config.reconciliationHealthy,
      requireManualConfirmation: config.requireManualConfirmation,
      ...(automation?.context ?? {})
    },
    {
      ...(automation ? { strategyQualification: { matchedStrategies: automation.matchedStrategies } } : {}),
      policy: {
        riskPerTradePct: config.riskPerTradePct,
        maxLeverage: config.maxLeverage,
        dailyLossLimitPct: config.dailyLossLimitPct,
        dedupeWindowMinutes: config.dedupeWindowMinutes,
        maxOpenPositions: config.maxOpenPositions,
        maxPortfolioExposurePct: config.maxPortfolioExposurePct,
        minAlphaScore: config.minAlphaScore,
        perOrderNotionalLimit: config.perOrderNotionalLimit,
        dailyNotionalLimit: config.dailyNotionalLimit,
        ...(automation?.policy ?? {})
      }
    }
  );

  if (automation && result.ok && result.executionPlan) {
    const planData = result.executionPlan;
    const rawQuantity = Number(planData.mainOrder?.quantity);
    const { maxQuantity, quantityStep, minQuantity, minNotional } = automation;
    const actualEquity = Number(automation.context.equity ?? runtimeEquity);
    const leverage = Number(result.intent.leverage);
    let violation: { code: string; message: string } | null = null;
    let quantity: number | null = null;
    if (![rawQuantity, maxQuantity, quantityStep, minQuantity, minNotional, marketReferencePrice, actualEquity, leverage].every(Number.isFinite)
      || rawQuantity <= 0 || maxQuantity <= 0 || quantityStep <= 0 || minQuantity < 0 || minNotional < 0
      || marketReferencePrice <= 0 || actualEquity <= 0 || leverage <= 0 || !Array.isArray(planData.protectionOrders)) {
      violation = { code: "AUTOMATION_QUANTITY_FILTERS_INVALID", message: "自动审批缺少有效的交易所数量步长、最小数量或名义金额，拒绝生成执行计划。" };
    } else {
      // Decimal arithmetic floors even when a refreshed price shrinks the raw
      // quantity below the candidate cap. Never round up to satisfy a minimum.
      const step = new Prisma.Decimal(quantityStep);
      const units = Prisma.Decimal.min(rawQuantity, maxQuantity).div(step).floor();
      const finalQuantity = units.mul(step);
      const notional = finalQuantity.mul(marketReferencePrice);
      quantity = finalQuantity.toNumber();
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > Math.min(rawQuantity, maxQuantity)
        || finalQuantity.lt(minQuantity) || notional.lt(Math.max(5, minNotional))) {
        violation = { code: "AUTOMATION_ORDER_BELOW_EXCHANGE_MINIMUM", message: "自动审批数量按交易所步长向下取整后，未达到当前最小数量或最小名义金额；不放大订单，等待下一轮。" };
      } else {
        const riskAmount = finalQuantity.mul(new Prisma.Decimal(marketReferencePrice).sub(Number(result.intent.stopLoss)).abs());
        planData.mainOrder.quantity = quantity;
        for (const protection of planData.protectionOrders) protection.quantity = quantity;
        Object.assign(planData.risk, { notional: notional.toNumber(), marginRequired: notional.div(leverage).toNumber(),
          riskAmount: riskAmount.toNumber(), riskPct: riskAmount.div(actualEquity).mul(100).toNumber(),
          exposureCapped: Boolean(planData.risk.exposureCapped) || finalQuantity.lt(rawQuantity) });
      }
    }
    const details = { rawQuantity: Number.isFinite(rawQuantity) ? rawQuantity : null, quantity,
      quantityStep: Number.isFinite(quantityStep) ? quantityStep : null, maxQuantity: Number.isFinite(maxQuantity) ? maxQuantity : null,
      minQuantity: Number.isFinite(minQuantity) ? minQuantity : null, minNotional: Number.isFinite(minNotional) ? minNotional : null };
    const event = { auditId: `AUD-${randomUUID().slice(0, 8).toUpperCase()}`, intentId: result.intent.intentId, timestamp: now.toISOString(),
      state: violation ? "REJECTED" : "RISK_CHECKED", status: violation ? "FINAL" : "QUANTITY_FILTERS_VALIDATED",
      message: violation?.message ?? "自动审批数量已按交易所步长向下量化，并同步主单、保护单与风险金额。",
      details: { ...details, ...(violation ? { violationCodes: [violation.code] } : {}) } };
    if (violation) {
      result.ok = false; result.decision = "REJECTED"; result.state = "REJECTED";
      result.violations = [...result.violations, violation]; result.executionPlan = null;
      result.audit = result.audit.filter((item: { state: string }) => !["PLANNED", "AWAITING_CONFIRMATION"].includes(item.state));
      result.audit.push(event);
    } else {
      const plannedIndex = result.audit.findIndex((item: { state: string }) => item.state === "PLANNED");
      result.audit.splice(plannedIndex < 0 ? result.audit.length : plannedIndex, 0, event);
    }
  }

  const intent = result.intent;
  const savedIntent = await prisma.alphaTradeIntent.create({
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
      alphaScore: intent.alphaScore == null ? null : Number(intent.alphaScore),
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
    await writeAlphaAudit({ userId, intentId: savedIntent.id, state, status: String(event.status), message: String(event.message), metadata: event.details as Record<string, unknown> | null });
  }

  if (!result.ok || !result.executionPlan) return { ...result, intent: savedIntent };
  const planData = result.executionPlan;
  const plan = await prisma.alphaExecutionPlan.create({
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
      safeguards: json(planData.safeguards),
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
  const plan = await prisma.alphaExecutionPlan.findFirst({ where: { id: planId, userId }, include: { intent: true } });
  if (!plan) throw new Error("执行计划不存在");
  if (plan.state !== AlphaExecutionState.PLANNED && plan.state !== AlphaExecutionState.AWAITING_CONFIRMATION) {
    if (plan.state === AlphaExecutionState.CANCELED) return { ok: true, idempotent: true, planId, state: plan.state };
    throw new Error(`当前计划状态为 ${plan.state}，不能取消已提交的订单`);
  }
  await prisma.$transaction([
    prisma.alphaExecutionPlan.update({ where: { id: plan.id }, data: { state: AlphaExecutionState.CANCELED } }),
    prisma.alphaTradeIntent.update({ where: { id: plan.intentId }, data: { state: AlphaExecutionState.CANCELED } })
  ]);
  await writeAlphaAudit({
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
  return prisma.alphaTradingOrder.upsert({
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

async function createPosition(plan: Awaited<ReturnType<typeof prisma.alphaExecutionPlan.findFirstOrThrow>>, result: BinanceOrderResult | null) {
  const main = plan.mainOrder as Record<string, unknown>;
  const protection = plan.protectionOrders as Array<Record<string, unknown>>;
  const intent = await prisma.alphaTradeIntent.findUniqueOrThrow({ where: { id: plan.intentId } });
  const entry = Number(result?.averagePrice ?? main.price ?? intent.entryPrice);
  const quantity = Number(result?.filledQuantity || main.quantity);
  return prisma.alphaTradingPosition.upsert({
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
  const plan = await prisma.alphaExecutionPlan.findUniqueOrThrow({ where: { id: planId }, include: { intent: true } });
  const position = await prisma.alphaTradingPosition.findUniqueOrThrow({ where: { planId } });
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
  await prisma.alphaTradingOrder.updateMany({
    where: { id: { in: [stop.id, target.id] } },
    data: { status: AlphaOrderStatus.NEW, rawResponse: json({ simulated: true, protected: true, environment: plan.environment }) }
  });
  await writeAlphaAudit({ userId: plan.userId, intentId: plan.intentId, planId, state: AlphaExecutionState.PROTECTION_ACTIVE, status: "OK", message: `${plan.environment} 止损与止盈保护单已建立并进入模拟监控。` });
}

async function attachProtection(planId: string, client: AlphaBinanceClient, credentialId: string) {
  const plan = await prisma.alphaExecutionPlan.findUniqueOrThrow({ where: { id: planId }, include: { intent: true, orders: true } });
  if (plan.orders.some((order) => order.role === AlphaOrderRole.STOP_LOSS || order.role === AlphaOrderRole.TAKE_PROFIT)) return;
  const position = await prisma.alphaTradingPosition.findUniqueOrThrow({ where: { planId } });
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
  await prisma.alphaTradingOrder.updateMany({
    where: { id: { in: [stop.id, target.id] } },
    data: { status: AlphaOrderStatus.NEW, rawResponse: json(raw) }
  });
  await prisma.alphaExecutionPlan.update({ where: { id: planId }, data: { state: AlphaExecutionState.PROTECTION_ACTIVE } });
  await writeAlphaAudit({ userId: plan.userId, intentId: plan.intentId, planId, state: AlphaExecutionState.PROTECTION_ACTIVE, status: "OK", message: "止损与止盈保护单已在 Binance 侧创建。" });
}

export async function executePlan(planId: string, userId: string) {
  const scope = await prisma.alphaExecutionPlan.findFirst({ where: { id: planId, userId }, select: { environment: true } });
  if (!scope) throw new Error("执行计划不存在");
  if (scope.environment !== AlphaExecutionMode.LIVE) return executeClaimedPlan(planId, userId);
  // Serialize all LIVE entry requests for an owner, including manual API calls.
  await prisma.alphaAutomationConfig.upsert({ where: { userId }, update: {}, create: { userId, settings: {}, version: randomUUID() } });
  const token = randomUUID();
  const claimed = await prisma.alphaAutomationConfig.updateMany({ where: { userId,
    OR: [{ submissionUntil: null }, { submissionUntil: { lt: new Date() } }] },
    data: { submissionToken: token, submissionUntil: new Date(Date.now() + 5 * 60_000) } });
  if (!claimed.count) throw new Error("当前账户有订单正在提交，请等待订单回报和对账完成");
  try { return await executeClaimedPlan(planId, userId, token); }
  finally {
    await prisma.alphaAutomationConfig.updateMany({ where: { userId, submissionToken: token }, data: { submissionToken: null, submissionUntil: null } });
  }
}

async function executeClaimedPlan(planId: string, userId: string, submissionToken?: string) {
  const plan = await prisma.alphaExecutionPlan.findFirst({ where: { id: planId, userId }, include: { intent: true, orders: true } });
  if (!plan) throw new Error("执行计划不存在");
  if (plan.expiresAt.getTime() <= Date.now()) throw new Error("执行计划已过期，请重新提交风控审批");
  const config = await getOrCreateAlphaExecutionConfig(userId);
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
  const currentReferencePrice = await getLiveBinanceReferencePrice(engineMarket(plan.market) as "spot" | "futures", plan.intent.symbol);
  if (plan.intent.source.startsWith("alpha-auto:")) {
    const { assertAutoPlanExecution } = await import("./automation-runtime");
    await assertAutoPlanExecution(userId, plan.id, currentReferencePrice);
  }
  await writeAlphaAudit({
    userId,
    intentId: plan.intentId,
    planId: plan.id,
    state: AlphaExecutionState.AWAITING_CONFIRMATION,
    status: "LIVE_PRICE_REFRESHED",
    message: "确认执行前已重新读取 Binance 实时价；不再按价格偏差阈值拒绝计划。",
    metadata: { approvedReferencePrice: plan.intent.entryPrice, currentReferencePrice }
  });
  const claimed = await prisma.alphaExecutionPlan.updateMany({
    where: { id: planId, userId, state: { in: [AlphaExecutionState.AWAITING_CONFIRMATION, AlphaExecutionState.PLANNED] } },
    data: { state: AlphaExecutionState.EXECUTING, confirmedAt: new Date() }
  });
  if (!claimed.count) return { idempotent: true, plan: await prisma.alphaExecutionPlan.findUnique({ where: { id: planId } }) };

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
    await prisma.alphaTradingOrder.update({
      where: { id: entryOrder.id },
      data: { status: AlphaOrderStatus.FILLED, exchangeOrderId: simulated.exchangeOrderId, filledQuantity: simulated.filledQuantity, averagePrice: simulated.averagePrice, rawResponse: json(simulated.raw) }
    });
    await createPosition(plan, simulated);
    await attachSimulatedProtection(plan.id);
    await prisma.alphaExecutionPlan.update({ where: { id: planId }, data: { state: AlphaExecutionState.MONITORING, executedAt: new Date() } });
    await writeAlphaAudit({ userId, intentId: plan.intentId, planId, orderId: entryOrder.id, state: AlphaExecutionState.MONITORING, status: "OK", message: `${plan.environment} 主订单已成交，模拟保护单和持仓监控已启用。` });
    return { ok: true, simulated: true, planId, order: simulated };
  }

  const credential = await credentialFor(userId, plan.environment, plan.market);
  if (!credential?.verifiedAt || !credential.enabled) throw new Error("当前 Binance 凭据尚未通过连接和权限校验");
  const client = clientFromCredential(credential);
  await prisma.alphaTradingOrder.update({ where: { id: entryOrder.id }, data: { credentialId: credential.id } });
  let acceptedEntry: BinanceOrderResult | null = null;
  try {
    if (plan.intent.source.startsWith("alpha-auto:")) {
      const { assertAutoPlanExecution } = await import("./automation-runtime");
      await assertAutoPlanExecution(userId, plan.id);
    }
    if (submissionToken) {
      const lock = await prisma.alphaAutomationConfig.findUnique({ where: { userId } });
      if (lock?.submissionToken !== submissionToken || !lock.submissionUntil || lock.submissionUntil.getTime() <= Date.now())
        throw new Error("账户下单锁已失效，禁止提交过期请求");
    }
    const result = await client.placeOrder({
      symbol: plan.intent.symbol,
      side: String(main.side) as "BUY" | "SELL",
      type: String(main.type) as "MARKET" | "LIMIT",
      quantity: Number(main.quantity),
      price: main.price == null ? null : Number(main.price),
      leverage: plan.intent.leverage,
      clientOrderId
    });
    acceptedEntry = result;
    const status = orderStatus(result.status);
    await prisma.alphaTradingOrder.update({
      where: { id: entryOrder.id },
      data: { status, exchangeOrderId: result.exchangeOrderId, filledQuantity: result.filledQuantity, averagePrice: result.averagePrice, rawResponse: json(result.raw), lastReconciledAt: new Date() }
    });
    await prisma.alphaExecutionPlan.update({ where: { id: planId }, data: { state: stateForOrder(status), executedAt: new Date() } });
    await writeAlphaAudit({ userId, intentId: plan.intentId, planId, orderId: entryOrder.id, state: stateForOrder(status), status: "OK", message: `Binance ${plan.environment}/${plan.market} 主订单已提交，客户端订单号 ${clientOrderId}。` });
    if (status === AlphaOrderStatus.FILLED) {
      await createPosition(plan, result);
      try {
        await attachProtection(planId, client, credential.id);
      } catch (protectionError) {
        await client.cancelAll(plan.intent.symbol).catch(() => undefined);
        await client.closePosition({ symbol: plan.intent.symbol, side: plan.intent.side as "LONG" | "SHORT", quantity: result.filledQuantity, clientOrderId: safeClientOrderId("em", plan.id) });
        await prisma.alphaExecutionConfig.update({ where: { userId }, data: { killSwitchActive: true, reconciliationHealthy: false } });
        await prisma.alphaExecutionPlan.update({ where: { id: planId }, data: { state: AlphaExecutionState.KILLED } });
        await writeAlphaAudit({ userId, intentId: plan.intentId, planId, state: AlphaExecutionState.KILLED, status: "EMERGENCY", message: `保护单创建失败，已执行紧急平仓并触发 Kill Switch：${protectionError instanceof Error ? protectionError.message : "unknown"}` });
        throw protectionError;
      }
    }
    return { ok: true, planId, order: result };
  } catch (caught) {
    if (acceptedEntry) {
      // A post-fill persistence/protection error must never relabel an acknowledged fill as rejected.
      await prisma.alphaTradingOrder.update({ where: { id: entryOrder.id }, data: {
        status: orderStatus(acceptedEntry.status), exchangeOrderId: acceptedEntry.exchangeOrderId,
        filledQuantity: acceptedEntry.filledQuantity, averagePrice: acceptedEntry.averagePrice, rawResponse: json(acceptedEntry.raw),
        errorMessage: caught instanceof Error ? caught.message : "成交后的状态处理异常" } }).catch(() => undefined);
      await prisma.alphaExecutionPlan.updateMany({ where: { id: planId, state: { not: AlphaExecutionState.KILLED } }, data: { state: AlphaExecutionState.UNKNOWN } });
      await prisma.alphaExecutionConfig.update({ where: { userId }, data: { reconciliationHealthy: false } });
      throw caught;
    }
    const unknown = caught instanceof BinanceRequestError && caught.statusUnknown;
    await prisma.alphaTradingOrder.update({ where: { id: entryOrder.id }, data: { status: unknown ? AlphaOrderStatus.UNKNOWN : AlphaOrderStatus.REJECTED, errorMessage: caught instanceof Error ? caught.message : "execution failed" } });
    await prisma.alphaExecutionPlan.update({ where: { id: planId }, data: { state: unknown ? AlphaExecutionState.UNKNOWN : AlphaExecutionState.FAILED } });
    if (unknown) await prisma.alphaExecutionConfig.update({ where: { userId }, data: { reconciliationHealthy: false } });
    await writeAlphaAudit({ userId, intentId: plan.intentId, planId, orderId: entryOrder.id, state: unknown ? AlphaExecutionState.UNKNOWN : AlphaExecutionState.FAILED, status: "ERROR", message: caught instanceof Error ? caught.message : "执行失败" });
    throw caught;
  } finally {
    await client.close();
  }
}

export async function reconcileExecution(userId: string, scope: { environment?: AlphaExecutionMode; market?: AlphaMarketType } = {}) {
  const config = await getOrCreateAlphaExecutionConfig(userId);
  const orders = await prisma.alphaTradingOrder.findMany({
    where: {
      userId,
      environment: scope.environment ?? { in: [AlphaExecutionMode.TESTNET, AlphaExecutionMode.LIVE] },
      ...(scope.market ? { market: scope.market } : {}),
      status: { notIn: TERMINAL_ORDER_STATES }
    },
    orderBy: { createdAt: "asc" },
    take: 24,
    omit: { rawResponse: true },
    include: {
      plan: { select: { intentId: true } },
      credential: { select: credentialSecretSelect }
    }
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
      await prisma.alphaTradingOrder.update({
        where: { id: order.id },
        data: { status, exchangeOrderId: result.exchangeOrderId, filledQuantity: result.filledQuantity, averagePrice: result.averagePrice, rawResponse: json(result.raw), errorMessage: null, lastReconciledAt: new Date() },
        select: { id: true }
      });
      reconciled++;
      if (order.role === AlphaOrderRole.ENTRY && status === AlphaOrderStatus.FILLED) {
        const plan = await prisma.alphaExecutionPlan.findUniqueOrThrow({ where: { id: order.planId } });
        await createPosition(plan, result);
        await attachProtection(order.planId, client, order.credential.id);
      }
      if (order.role === AlphaOrderRole.CLOSE && status === AlphaOrderStatus.FILLED) {
        const position = await prisma.alphaTradingPosition.findUnique({ where: { planId: order.planId } });
        if (position) {
          const exitPrice = Number(result.averagePrice ?? position.markPrice ?? position.entryPrice);
          const direction = position.side === "LONG" ? 1 : -1;
          await prisma.alphaTradingPosition.update({
            where: { id: position.id },
            data: { state: AlphaExecutionState.CLOSED, markPrice: exitPrice, unrealizedPnl: (exitPrice - position.entryPrice) * position.quantity * direction, lastReconciledAt: new Date(), closedAt: new Date() },
            select: { id: true }
          });
          await prisma.alphaExecutionPlan.update({ where: { id: order.planId }, data: { state: AlphaExecutionState.RECONCILED }, select: { id: true } });
          await writeAlphaAudit({ userId, intentId: order.plan.intentId, planId: order.planId, orderId: order.id, state: AlphaExecutionState.CLOSED, status: "MANUAL_CLOSE_FILLED", message: `${order.symbol} 人工平仓订单已成交并完成对账。` });
        }
      }
      if (isConditional && status === AlphaOrderStatus.FILLED) {
        const sibling = await prisma.alphaTradingOrder.findFirst({
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
            await prisma.alphaTradingOrder.update({
              where: { id: sibling.id },
              data: { status: AlphaOrderStatus.CANCELED, lastReconciledAt: new Date() },
              select: { id: true }
            });
          } catch (caught) {
            const message = caught instanceof Error ? caught.message : "Algo sibling cancel failed";
            errors.push(`${sibling.symbol} sibling protection: ${message}`);
            await prisma.alphaTradingOrder.update({
              where: { id: sibling.id },
              data: { status: AlphaOrderStatus.UNKNOWN, errorMessage: message, lastReconciledAt: new Date() },
              select: { id: true }
            });
          }
        }
        const position = await prisma.alphaTradingPosition.findUnique({ where: { planId: order.planId } });
        if (position) {
          const exitPrice = Number(result.averagePrice ?? position.markPrice ?? position.entryPrice);
          const direction = position.side === "LONG" ? 1 : -1;
          await prisma.alphaTradingPosition.update({
            where: { id: position.id },
            data: {
              state: AlphaExecutionState.CLOSED,
              markPrice: exitPrice,
              unrealizedPnl: (exitPrice - position.entryPrice) * position.quantity * direction,
              lastReconciledAt: new Date(),
              closedAt: new Date()
            },
            select: { id: true }
          });
        }
        await prisma.alphaExecutionPlan.update({ where: { id: order.planId }, data: { state: AlphaExecutionState.RECONCILED }, select: { id: true } });
        await writeAlphaAudit({
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
        const status = order.status === AlphaOrderStatus.PENDING && !order.exchangeOrderId
          ? AlphaOrderStatus.REJECTED
          : AlphaOrderStatus.CANCELED;
        const message = `Binance 已确认订单不存在；本地 ${order.status} 已归一化为 ${status}`;
        await prisma.alphaTradingOrder.update({
          where: { id: order.id },
          data: { status, errorMessage: message, lastReconciledAt: new Date() },
          select: { id: true }
        });
        if (order.role === AlphaOrderRole.ENTRY && status === AlphaOrderStatus.REJECTED) {
          await prisma.alphaExecutionPlan.update({ where: { id: order.planId }, data: { state: AlphaExecutionState.FAILED }, select: { id: true } });
        }
        reconciled++;
        await writeAlphaAudit({
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
      }
    } finally {
      await client.close();
    }
  }

  const positions = await prisma.alphaTradingPosition.findMany({
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
          const mark = remote?.markPrice ?? position.markPrice ?? position.entryPrice;
          const direction = position.side === "LONG" ? 1 : -1;
          await prisma.$transaction([
            prisma.alphaTradingPosition.update({
              where: { id: position.id },
              data: { state: AlphaExecutionState.CLOSED, markPrice: mark, unrealizedPnl: (mark - position.entryPrice) * position.quantity * direction, lastReconciledAt: new Date(), closedAt: new Date() },
              select: { id: true }
            }),
            prisma.alphaExecutionPlan.update({ where: { id: position.planId }, data: { state: AlphaExecutionState.RECONCILED }, select: { id: true } }),
            prisma.alphaTradingOrder.updateMany({
              where: { planId: position.planId, status: { notIn: TERMINAL_ORDER_STATES } },
              data: { status: AlphaOrderStatus.CANCELED, errorMessage: "Binance 持仓已归零，剩余本地订单已终结", lastReconciledAt: new Date() }
            })
          ]);
          await writeAlphaAudit({
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
          await prisma.alphaTradingPosition.update({
            where: { id: position.id },
            data: { state: AlphaExecutionState.UNKNOWN, markPrice: remote.markPrice, unrealizedPnl: remote.unrealizedPnl, lastReconciledAt: new Date() },
            select: { id: true }
          });
          continue;
        }

        const ownerPlan = await prisma.alphaExecutionPlan.findUnique({
          where: { id: position.planId },
          include: { intent: { select: { source: true } }, orders: { omit: { rawResponse: true } } }
        });
        if (ownerPlan?.intent.source.startsWith("alpha-auto:")) {
          const entryFilled = ownerPlan.orders.filter((order) => order.role === AlphaOrderRole.ENTRY).reduce((sum, order) => sum + order.filledQuantity, 0);
          const exited = ownerPlan.orders.filter((order) => [AlphaOrderRole.CLOSE, AlphaOrderRole.STOP_LOSS, AlphaOrderRole.TAKE_PROFIT].includes(order.role as "CLOSE" | "STOP_LOSS" | "TAKE_PROFIT"))
            .reduce((sum, order) => sum + order.filledQuantity, 0);
          const ownedQuantity = Math.max(0, entryFilled - exited);
          if (Math.abs(remote.quantity - ownedQuantity) > Math.max(1e-9, ownedQuantity * 1e-6)) {
            const message = `${position.symbol} 交易所总仓与本自动策略成交份额不一致；保留保护单，暂停自动仓位操作。`;
            errors.push(message);
            await prisma.alphaTradingPosition.update({ where: { id: position.id }, data: { state: AlphaExecutionState.UNKNOWN, lastReconciledAt: new Date() }, select: { id: true } });
            await prisma.alphaExecutionPlan.update({ where: { id: position.planId }, data: { state: AlphaExecutionState.UNKNOWN }, select: { id: true } });
            await writeAlphaAudit({ userId, planId: position.planId, state: AlphaExecutionState.UNKNOWN, status: "AUTO_OWNERSHIP_CONFLICT", message,
              metadata: { ownedQuantity, exchangeQuantity: remote.quantity, environment: "LIVE", market: "FUTURES", automation: true } });
            continue;
          }
        }

        const activeOrders = await prisma.alphaTradingOrder.findMany({
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
        await prisma.alphaTradingPosition.update({
          where: { id: position.id },
          data: {
            quantity: remote.quantity,
            entryPrice: nextEntry,
            markPrice: nextMark,
            unrealizedPnl: remote.unrealizedPnl,
            lastReconciledAt: new Date(),
            state: nextState
          },
          select: { id: true }
        });
        if (quantityChanged || entryChanged || recovered) {
          await writeAlphaAudit({
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
        await prisma.alphaTradingPosition.update({
          where: { id: position.id },
          data: { markPrice: mark, unrealizedPnl: (mark - position.entryPrice) * position.quantity * direction, lastReconciledAt: new Date(), state: position.state },
          select: { id: true }
        });
      }
    } catch (caught) {
      errors.push(`${position.symbol} mark: ${caught instanceof Error ? caught.message : "unknown"}`);
    } finally {
      await client.close();
    }
  }

  const scopedCredentials = await prisma.alphaTradingCredential.findMany({
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
      await prisma.alphaTradingCredential.update({
        where: { id: credential.id },
        data: { permissionSummary: json(snapshot), lastError: null },
        select: { id: true }
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
      await prisma.alphaTradingCredential.update({ where: { id: credential.id }, data: { lastError: message }, select: { id: true } }).catch(() => undefined);
    } finally {
      await client.close();
    }
  }

  await prisma.alphaExecutionConfig.update({
    where: { userId },
    data: { lastReconciledAt: new Date(), reconciliationHealthy: errors.length === 0 },
    select: { id: true }
  });
  const reconciliationHealthy = errors.length === 0;
  if (errors.length > 0 || config.reconciliationHealthy !== reconciliationHealthy) {
    await writeAlphaAudit({
      userId,
      state: AlphaExecutionState.RECONCILED,
      status: errors.length ? "WARNING" : "RECOVERED",
      message: errors.length ? `本轮对账完成，但有 ${errors.length} 项异常。` : "交易对账已恢复健康。",
      metadata: { reconciled, accountSnapshots, errors: errors.slice(0, 8), previousHealthy: config.reconciliationHealthy }
    });
  }
  return { ok: errors.length === 0, reconciled, accountSnapshots, errors };
}

async function requireLivePosition(positionId: string, userId: string) {
  const position = await prisma.alphaTradingPosition.findFirst({
    where: { id: positionId, userId, environment: AlphaExecutionMode.LIVE, state: { in: ACTIVE_POSITION_STATES } },
    include: { plan: { include: { intent: true, orders: true } } }
  });
  if (!position) throw new Error("生产实盘持仓不存在、已关闭或不属于当前账户");
  const credential = await credentialFor(userId, AlphaExecutionMode.LIVE, position.market);
  if (!credential?.verifiedAt || !credential.enabled) throw new Error("生产实盘 Binance 凭据尚未通过校验");
  return { position, credential };
}

async function cancelPositionProtectionOrders(client: AlphaBinanceClient, position: Awaited<ReturnType<typeof requireLivePosition>>["position"]) {
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
  await prisma.alphaTradingOrder.updateMany({
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
    // Futures reduce-only exits retain exchange protection until the close is confirmed.
    // Spot OCO locks base inventory, so its existing cancellation order is retained.
    if (position.market === AlphaMarketType.SPOT) await cancelPositionProtectionOrders(client, position);
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
    await prisma.$transaction([
      prisma.alphaTradingOrder.update({
        where: { id: closeOrder.id },
        data: { status, exchangeOrderId: result.exchangeOrderId, filledQuantity: result.filledQuantity, averagePrice: result.averagePrice, rawResponse: json(result.raw), lastReconciledAt: new Date() }
      }),
      prisma.alphaTradingPosition.update({
        where: { id: position.id },
        data: status === AlphaOrderStatus.FILLED
          ? { state: AlphaExecutionState.CLOSED, markPrice: exitPrice, unrealizedPnl: (exitPrice - position.entryPrice) * position.quantity * direction, closedAt: new Date(), lastReconciledAt: new Date() }
          : { state: AlphaExecutionState.RECONCILING, lastReconciledAt: new Date() }
      }),
      prisma.alphaExecutionPlan.update({ where: { id: position.planId }, data: { state: status === AlphaOrderStatus.FILLED ? AlphaExecutionState.RECONCILED : AlphaExecutionState.RECONCILING } })
    ]);
    if (position.market === AlphaMarketType.FUTURES && status === AlphaOrderStatus.FILLED) {
      await cancelPositionProtectionOrders(client, position).catch(async () => {
        await writeAlphaAudit({ userId, planId: position.planId, state: AlphaExecutionState.RECONCILING, status: "WARNING", message: `${position.symbol} 平仓已成交；剩余保护单等待对账清理。` });
      });
    }
    await writeAlphaAudit({ userId, intentId: position.plan.intentId, planId: position.planId, orderId: closeOrder.id, state: status === AlphaOrderStatus.FILLED ? AlphaExecutionState.CLOSED : AlphaExecutionState.RECONCILING, status: "MANUAL_CLOSE", message: `${position.symbol} 已提交生产实盘平仓；合约保护单在确认平仓后清理。`, metadata: { clientOrderId, status } });
    return { ok: true, positionId, order: result };
  } catch (caught) {
    const statusUnknown = caught instanceof BinanceRequestError && caught.statusUnknown;
    const message = caught instanceof Error ? caught.message : "生产实盘平仓失败";
    if (closeOrder) {
      await prisma.alphaTradingOrder.update({
        where: { id: closeOrder.id },
        data: {
          status: statusUnknown ? AlphaOrderStatus.UNKNOWN : AlphaOrderStatus.REJECTED,
          errorMessage: message,
          lastReconciledAt: new Date()
        }
      }).catch(() => undefined);
    }
    await prisma.alphaTradingPosition.update({ where: { id: position.id }, data: { state: AlphaExecutionState.UNKNOWN, lastReconciledAt: new Date() } }).catch(() => undefined);
    await prisma.alphaExecutionPlan.update({ where: { id: position.planId }, data: { state: AlphaExecutionState.UNKNOWN } }).catch(() => undefined);
    await prisma.alphaExecutionConfig.update({ where: { userId }, data: { reconciliationHealthy: false } }).catch(() => undefined);
    await writeAlphaAudit({
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
    await cancelPositionProtectionOrders(client, position);
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
    const protection = position.plan.protectionOrders as Array<Record<string, unknown>>;
    const nextProtection = protection.map((order) => ({
      ...order,
      stopPrice: String(order.type).includes("TAKE_PROFIT") ? takeProfit : stopLoss
    }));
    const stopOrder = position.plan.orders.find((order) => order.role === AlphaOrderRole.STOP_LOSS);
    const targetOrder = position.plan.orders.find((order) => order.role === AlphaOrderRole.TAKE_PROFIT);
    if (!stopOrder || !targetOrder) throw new Error("数据库缺少原止损或止盈订单，已停止保护单替换");
    await prisma.$transaction([
      prisma.alphaTradingOrder.update({ where: { id: stopOrder.id }, data: { clientOrderId: stopClientOrderId, stopPrice: stopLoss, status: AlphaOrderStatus.NEW, rawResponse: json(response), errorMessage: null, lastReconciledAt: new Date() } }),
      prisma.alphaTradingOrder.update({ where: { id: targetOrder.id }, data: { clientOrderId: takeProfitClientOrderId, stopPrice: takeProfit, status: AlphaOrderStatus.NEW, rawResponse: json(response), errorMessage: null, lastReconciledAt: new Date() } }),
      prisma.alphaTradingPosition.update({ where: { id: position.id }, data: { stopLoss, takeProfit, state: AlphaExecutionState.PROTECTION_ACTIVE, lastReconciledAt: new Date() } }),
      prisma.alphaExecutionPlan.update({ where: { id: position.planId }, data: { protectionOrders: json(nextProtection), state: AlphaExecutionState.PROTECTION_ACTIVE } })
    ]);
    await writeAlphaAudit({ userId, intentId: position.plan.intentId, planId: position.planId, state: AlphaExecutionState.PROTECTION_ACTIVE, status: "PROTECTION_REPLACED", message: `${position.symbol} 生产实盘止损 / 止盈已由操作员替换。`, metadata: { previousStopLoss: position.stopLoss, previousTakeProfit: position.takeProfit, stopLoss, takeProfit, currentPrice } });
    return { ok: true, positionId, stopLoss, takeProfit, currentPrice };
  } catch (caught) {
    await client.cancelAll(position.symbol).catch(() => undefined);
    await client.closePosition({ symbol: position.symbol, side: position.side as "LONG" | "SHORT", quantity: position.quantity, clientOrderId: safeClientOrderId("ep", `${position.planId}${suffix}`) }).catch(() => undefined);
    await prisma.alphaExecutionConfig.update({ where: { userId }, data: { killSwitchActive: true, reconciliationHealthy: false } }).catch(() => undefined);
    await prisma.alphaTradingPosition.update({ where: { id: position.id }, data: { state: AlphaExecutionState.KILLED, closedAt: new Date() } }).catch(() => undefined);
    await writeAlphaAudit({ userId, intentId: position.plan.intentId, planId: position.planId, state: AlphaExecutionState.KILLED, status: "EMERGENCY", message: `保护单替换失败，已尝试紧急平仓并触发 Kill Switch：${caught instanceof Error ? caught.message : "unknown"}` });
    throw caught;
  } finally {
    await client.close();
  }
}

export async function releaseKillSwitch(userId: string) {
  const config = await prisma.alphaExecutionConfig.findUnique({ where: { userId } });
  if (!config) throw new Error("交易执行配置不存在");
  if (!config.killSwitchActive) return { ok: true, idempotent: true };
  if (!config.reconciliationHealthy) throw new Error("最近一次对账不健康，不能解除 Kill Switch");
  if (!config.lastReconciledAt || Date.now() - config.lastReconciledAt.getTime() > KILL_SWITCH_RECONCILIATION_MAX_AGE_MS) {
    throw new Error("最近一次健康对账已过期，请先重新执行实盘对账");
  }

  const [unknownPositions, unknownOrders, inFlightCloseOrders, activeLivePositions] = await Promise.all([
    prisma.alphaTradingPosition.count({ where: { userId, state: AlphaExecutionState.UNKNOWN } }),
    prisma.alphaTradingOrder.count({ where: { userId, environment: AlphaExecutionMode.LIVE, status: AlphaOrderStatus.UNKNOWN } }),
    prisma.alphaTradingOrder.count({
      where: {
        userId,
        environment: AlphaExecutionMode.LIVE,
        role: AlphaOrderRole.CLOSE,
        status: { in: [AlphaOrderStatus.PENDING, AlphaOrderStatus.SUBMITTED, AlphaOrderStatus.NEW, AlphaOrderStatus.PARTIALLY_FILLED] }
      }
    }),
    prisma.alphaTradingPosition.findMany({
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

  await prisma.alphaExecutionConfig.update({ where: { userId }, data: { killSwitchActive: false } });
  await writeAlphaAudit({
    userId,
    state: AlphaExecutionState.RECONCILED,
    status: "OK",
    message: "管理员在健康对账、零 UNKNOWN 与完整持仓保护校验后解除 Kill Switch。",
    metadata: { lastReconciledAt: config.lastReconciledAt.toISOString(), activeLivePositions: activeLivePositions.length }
  });
  return { ok: true, idempotent: false };
}

export async function triggerKillSwitch(userId: string) {
  await prisma.alphaExecutionConfig.update({ where: { userId }, data: { killSwitchActive: true, autoExecuteEnabled: false } });
  const positions = await prisma.alphaTradingPosition.findMany({ where: { userId, state: { in: ACTIVE_POSITION_STATES } } });
  const outcomes: Array<Record<string, unknown>> = [];
  for (const position of positions) {
    if (position.environment === AlphaExecutionMode.PAPER || position.environment === AlphaExecutionMode.MOCK_EXCHANGE) {
      await prisma.alphaTradingPosition.update({ where: { id: position.id }, data: { state: AlphaExecutionState.KILLED, closedAt: new Date() } });
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
      await client.cancelAll(position.symbol);
      await client.closePosition({ symbol: position.symbol, side: position.side as "LONG" | "SHORT", quantity: position.quantity, clientOrderId: safeClientOrderId("ks", position.planId) });
      await prisma.alphaTradingPosition.update({ where: { id: position.id }, data: { state: AlphaExecutionState.KILLED, closedAt: new Date() } });
      outcomes.push({ symbol: position.symbol, environment: position.environment, closed: true });
    } catch (caught) {
      await prisma.alphaTradingPosition.update({ where: { id: position.id }, data: { state: AlphaExecutionState.UNKNOWN } });
      outcomes.push({ symbol: position.symbol, environment: position.environment, closed: false, error: caught instanceof Error ? caught.message : "unknown" });
    } finally {
      await client.close();
    }
  }
  await prisma.alphaExecutionPlan.updateMany({ where: { userId, state: { in: [AlphaExecutionState.PLANNED, AlphaExecutionState.AWAITING_CONFIRMATION] } }, data: { state: AlphaExecutionState.KILLED } });
  await writeAlphaAudit({ userId, state: AlphaExecutionState.KILLED, status: outcomes.some((item) => item.closed === false) ? "WARNING" : "FINAL", message: "Kill Switch 已触发：停止自动执行、撤销待执行计划，并处置所有可识别持仓。", metadata: { outcomes } });
  return { ok: outcomes.every((item) => item.closed !== false), outcomes };
}
