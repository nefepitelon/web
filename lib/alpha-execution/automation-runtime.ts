import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { autoConfig, autoEvent, currentAutoGrant, json, TERMINAL_AUTO_ORDER } from "./automation-data";
import { alphaAutomationSettingsSchema, selectAlphaAutomationCandidates, type AlphaAutomationSettings, type AlphaAutomationCandidate } from "./automation-strategy";
import { loadAlphaAutomationMarket, refreshAlphaAutomationQuote, type AlphaAutomationMarketResult } from "./automation-market";
import { loadAutomationAccount } from "./automation-account";
import { validateAutomaticOrder } from "./automation-guard";
import { readSavedAutomationSettings } from "./automation-settings";
import { approveTradeIntent, cancelExecutionPlan, closeLivePosition, executePlan, reconcileExecution } from "./service";

const LEASE_MS = 5 * 60_000;
class LeaseLost extends Error {}
async function renewLease(userId: string, generation: string, token: string) {
  const renewed = await prisma.alphaAutomationConfig.updateMany({ where: { userId, generation, leaseToken: token, leaseUntil: { gt: new Date() } },
    data: { leaseUntil: new Date(Date.now() + LEASE_MS), heartbeatAt: new Date() } });
  if (!renewed.count) throw new LeaseLost("任务租约失效，停止旧任务操作");
}
type Execution = Awaited<ReturnType<typeof currentAutoGrant>>["execution"];
function effectiveSettings(settings: AlphaAutomationSettings, execution: Execution) {
  return { ...settings, enabled: true, orderNotional: Math.min(settings.orderNotional, execution.perOrderNotionalLimit),
    maxOrderNotional: Math.min(settings.maxOrderNotional, execution.perOrderNotionalLimit), leverage: Math.min(settings.leverage, execution.maxLeverage),
    maxPositions: Math.min(settings.maxPositions, execution.maxOpenPositions), minScore: Math.max(settings.minScore, execution.minAlphaScore),
    maxPortfolioEquityPct: Math.min(settings.maxPortfolioEquityPct, execution.maxPortfolioExposurePct),
    riskPerTradePct: Math.min(settings.riskPerTradePct, execution.riskPerTradePct),
    dailyLossLimitPct: Math.min(settings.dailyLossLimitPct, execution.dailyLossLimitPct),
    minOrderGapMinutes: Math.max(settings.minOrderGapMinutes, execution.dedupeWindowMinutes) };
}
async function recentEntries(userId: string) {
  const orders = await prisma.alphaTradingOrder.findMany({ where: { userId, environment: "LIVE", market: "FUTURES", role: "ENTRY",
    createdAt: { gte: new Date(Date.now() - 86_400_000) }, status: { notIn: ["REJECTED", "CANCELED", "EXPIRED"] } }, select: { symbol: true, side: true, createdAt: true } });
  return orders.map((order) => ({ symbol: order.symbol, side: (order.side === "BUY" ? "LONG" : "SHORT") as "LONG" | "SHORT", createdAt: order.createdAt.getTime(), blocksDedupe: true }));
}
async function freshCandidate(candidate: AlphaAutomationCandidate, settings: AlphaAutomationSettings, quantity = candidate.quantity) {
  if (!Number.isFinite(candidate.evidenceExpiresAt) || candidate.evidenceExpiresAt <= Date.now()) throw new Error("原始候选证据已过期，请等待下一轮筛选");
  const quote = await refreshAlphaAutomationQuote(settings, candidate.symbol);
  const price = candidate.side === "LONG" ? quote.ask : quote.bid;
  const spread = (quote.ask - quote.bid) / ((quote.ask + quote.bid) / 2) * 100;
  const notional = quantity * price;
  const filters = quote.filters;
  if (spread > settings.maxSpreadPct || quote.estimatedSlippagePct > settings.maxSlippagePct || quote.liquidityNotional < notional
    || quantity < filters.minQty || quantity > filters.maxQty || notional < filters.minNotional || (filters.maxNotional !== null && notional > filters.maxNotional)
    || Math.abs(quantity / filters.stepSize - Math.round(quantity / filters.stepSize)) > 1e-5)
    throw new Error("最新盘口、流动性或交易所数量规则不满足候选要求");
  const oldCost = (candidate.estimatedLossWithCosts - candidate.quantity * Math.abs(candidate.entryPrice - candidate.stopLoss)) / candidate.notional;
  const cost = Math.max(oldCost, (2 * (quote.takerFeePct + quote.estimatedSlippagePct) + spread) / 100);
  return { price, filters, candidate: { ...candidate, expiresAt: Math.min(candidate.evidenceExpiresAt, quote.quoteAt + settings.maxQuoteAgeSeconds * 1000),
    estimatedLossWithCosts: candidate.quantity * Math.abs(candidate.entryPrice - candidate.stopLoss) + candidate.notional * cost } };
}

/** Slow source/account collection must not make an otherwise valid strategy use an old book.
 * Refresh only execution fields; original market and signal timestamps remain unchanged. */
async function refreshSelectionBooks(market: AlphaAutomationMarketResult, settings: AlphaAutomationSettings) {
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(3, market.markets.length) }, async () => {
    while (index < market.markets.length) {
      const item = market.markets[index++];
      if (Date.now() - item.quoteAt < settings.maxQuoteAgeSeconds * 500) continue;
      try {
        const quote = await refreshAlphaAutomationQuote(settings, item.symbol);
        Object.assign(item, { bid: quote.bid, ask: quote.ask, quoteAt: quote.quoteAt, filters: quote.filters,
          estimatedSlippagePct: quote.estimatedSlippagePct, liquidityNotional: quote.liquidityNotional, takerFeePct: quote.takerFeePct });
      } catch {
        // An unsuccessful refresh cannot leave an executable old book in the selection.
        item.quoteAt = 0;
      }
    }
  }));
}
function withMarketDiagnostics(selection: ReturnType<typeof selectAlphaAutomationCandidates>, market: AlphaAutomationMarketResult) {
  const reasons = new Map((market.marketRejections ?? []).map(item => [item.symbol, item]));
  return { ...selection, rejections: selection.rejections.map(item => {
    const reason = item.reason === "MARKET_SNAPSHOT_MISSING_OR_AMBIGUOUS" ? reasons.get(item.symbol) : undefined;
    return reason ? { ...item, reason: reason.reason, message: reason.message } : item;
  }), sourceStatus: market.sourceStatus };
}
function scanMessage(selection: ReturnType<typeof selectAlphaAutomationCandidates>) {
  if (selection.candidates.length) return `本轮筛选 ${selection.candidates.length} 个候选，将逐一检查最新报价并送入风控审批。`;
  if (selection.blockedReason && selection.blockedReason !== "NO_ELIGIBLE_CANDIDATE") return selection.blockedReason;
  const counts = new Map<string, number>();
  for (const item of selection.rejections) counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1);
  const labels: Record<string, string> = { NO_SELECTED_STRATEGY_MATCH: "未命中已选策略", ATR_STOP_EXCEEDS_LIMIT: "ATR 止损超限",
    MARKET_NOT_TRADABLE: "非可交易 USDT 永续", MARKET_ENRICHMENT_LIMIT: "本轮行情名额已满", MARKET_DATA_UNAVAILABLE: "行情暂不可用",
    INSUFFICIENT_QUOTE_VOLUME: "成交额未达门槛", CONFLICTING_DIRECTIONS: "方向冲突" };
  const details = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([reason, count]) => `${labels[reason] ?? reason} ${count} 个`).join("；");
  return `本轮无可执行候选${details ? `：${details}` : "，请展开本轮数据源与筛选明细"}。`;
}
export async function previewAutomation(userId: string, input?: unknown) {
  const config = await autoConfig(userId);
  const settings = input === undefined ? readSavedAutomationSettings(config.settings) : alphaAutomationSettingsSchema.parse(input);
  const market = await loadAlphaAutomationMarket(settings);
  // Multi-source market scans can outlast the short account freshness window.
  // Read account risk immediately before selection, as the worker does.
  let { account, execution } = await loadAutomationAccount(userId);
  const entries = await recentEntries(userId);
  await refreshSelectionBooks(market, settings);
  if (Date.now() - account.observedAt > Math.min(30_000, settings.maxQuoteAgeSeconds * 1000) - 2000)
    ({ account, execution } = await loadAutomationAccount(userId));
  return { ...withMarketDiagnostics(selectAlphaAutomationCandidates({ settings: effectiveSettings(settings, execution), market: "futures", now: Date.now(),
    observations: market.observations, markets: market.markets, account, recentEntries: entries, lastOrderAt: config.lastOrderAt?.getTime() ?? null }), market),
    account: { equity: account.equity, availableMargin: account.availableMargin, openPositions: account.openPositions.length,
      pendingEntries: account.pendingEntries.length, dailyPnl: account.dailyPnl }, previewOnly: true };
}

/** Invoked by the common executor, including attempts to execute the plan from another API. */
export async function assertAutoPlanExecution(userId: string, planId: string, _referencePrice?: number) {
  const [config, reservation, grant, plan] = await Promise.all([autoConfig(userId),
    prisma.alphaAutomationOrder.findFirst({ where: { userId, planId } }), currentAutoGrant(userId),
    prisma.alphaExecutionPlan.findFirst({ where: { id: planId, userId }, include: { intent: true } })]);
  const now = Date.now();
  if (!config.enabled || config.status !== "RUNNING" || !config.expiresAt || now >= config.expiresAt.getTime()
    || config.grantFingerprint !== grant.fingerprint || !config.leaseUntil || config.leaseUntil.getTime() <= now
    || !reservation || reservation.generation !== config.generation || reservation.status !== "SUBMITTING" || !plan)
    throw new Error("自动交易会话已停止、授权失效或执行预留不可用");
  const candidate = reservation.candidate as unknown as AlphaAutomationCandidate;
  if (plan.intent.source !== `alpha-auto:${reservation.id}`) throw new Error("自动审批计划来源不匹配");
  const { account } = await loadAutomationAccount(userId, { excludePlanId: planId, excludeReservationId: reservation.id });
  const settings = effectiveSettings(alphaAutomationSettingsSchema.parse(config.settings), grant.execution);
  const quantity = Number((plan.mainOrder as { quantity: number }).quantity);
  const refreshed = await freshCandidate(candidate, settings, quantity);
  validateAutomaticOrder({ ...refreshed, settings, account, quantity, leverage: plan.intent.leverage, now: Date.now() });
  const fresh = await prisma.alphaAutomationConfig.findUniqueOrThrow({ where: { userId } });
  if (!fresh.enabled || fresh.generation !== config.generation || fresh.leaseToken !== config.leaseToken || fresh.grantFingerprint !== config.grantFingerprint
    || !fresh.leaseUntil || fresh.leaseUntil.getTime() <= Date.now() || !fresh.expiresAt || fresh.expiresAt.getTime() <= Date.now())
    throw new Error("自动开仓已被停止或当前任务租约失效");
}

async function settleAutomationOrders(userId: string, generation: string, token: string) {
  const reservations = await prisma.alphaAutomationOrder.findMany({ where: { userId, status: { notIn: TERMINAL_AUTO_ORDER } } });
  for (const reservation of reservations) {
    await renewLease(userId, generation, token);
    const plan = reservation.planId
      ? await prisma.alphaExecutionPlan.findFirst({ where: { id: reservation.planId, userId }, include: { intent: true, position: true, orders: true } })
      : await prisma.alphaExecutionPlan.findFirst({ where: { userId, intent: { source: `alpha-auto:${reservation.id}` } }, include: { intent: true, position: true, orders: true } });
    if (!plan) {
      // A durable retry cannot infer whether a remote operation happened. Missing approval is
      // abandoned; no exchange request was possible before a persisted plan/entry order.
      await prisma.alphaAutomationOrder.update({ where: { id: reservation.id }, data: { status: "CANCELED", error: "上次任务在创建执行计划前中断" } });
      continue;
    }
    if (plan.intent.source !== `alpha-auto:${reservation.id}` || plan.environment !== "LIVE" || plan.market !== "FUTURES")
      throw new Error("自动持仓与原始策略计划绑定不匹配，请人工核对");
    if (!reservation.planId) await prisma.alphaAutomationOrder.update({ where: { id: reservation.id }, data: { planId: plan.id } });
    if (["AWAITING_CONFIRMATION", "PLANNED"].includes(plan.state)) {
      await cancelExecutionPlan(plan.id, userId);
      await prisma.alphaAutomationOrder.update({ where: { id: reservation.id }, data: { status: "CANCELED", error: "中断的审批计划不自动重放" } });
      continue;
    }
    if (plan.position?.closedAt || plan.state === "CLOSED") {
      await prisma.alphaAutomationOrder.update({ where: { id: reservation.id }, data: { status: "CLOSED" } }); continue;
    }
    const entry = plan.orders.find((order) => order.role === "ENTRY");
    if (!plan.position && entry && ["REJECTED", "CANCELED", "EXPIRED"].includes(entry.status) && entry.filledQuantity === 0) {
      await prisma.alphaAutomationOrder.update({ where: { id: reservation.id }, data: { status: "REJECTED" } }); continue;
    }
    if (!plan.position || plan.state === "UNKNOWN" || plan.state === "EXECUTING") {
      await prisma.alphaAutomationConfig.update({ where: { userId }, data: { enabled: false, status: "STOPPING", lastError: "自动订单状态未确定；只对账，不重复下单" } });
      continue;
    }
    if (Date.now() >= reservation.closeAfter.getTime()) {
      if (!entry || !Number.isFinite(entry.filledQuantity) || entry.filledQuantity <= 0 || !Number.isFinite(plan.position.quantity) || plan.position.quantity <= 0
        || Math.abs(plan.position.quantity - entry.filledQuantity) > Math.max(1e-9, entry.filledQuantity * 1e-6))
        throw new Error(`${reservation.symbol} 实际持仓数量与策略成交数量不同，已暂停自动平仓，请核对手动交易`);
      // Only plans created by this module are eligible for holding-time exits.
      await renewLease(userId, generation, token);
      await closeLivePosition(plan.position.id, userId);
      await autoEvent(userId, "TIME_EXIT", `${reservation.symbol} 已达到授权持仓时限，提交到期平仓。`, { planId: plan.id });
    }
  }
}

export async function runAlphaAutoCycle(userId: string, generation: string): Promise<{ stop: boolean; waitMs: number }> {
  const token = randomUUID();
  const lease = await prisma.alphaAutomationConfig.updateMany({ where: { userId, generation,
    OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] }, data: { leaseToken: token, leaseUntil: new Date(Date.now() + LEASE_MS), heartbeatAt: new Date() } });
  if (!lease.count) {
    const current = await autoConfig(userId);
    return { stop: current.generation !== generation || current.status === "STOPPED", waitMs: 60_000 };
  }
  try {
    let config = await autoConfig(userId);
    const management = await currentAutoGrant(userId, { management: true });
    if (config.grantFingerprint?.split(":")[0] !== management.managementFingerprint)
      throw new Error("持仓管理授权或凭据已变更，自动管理暂停；交易所保护单保留，请人工处理");
    await renewLease(userId, generation, token);
    await reconcileExecution(userId, { environment: "LIVE", market: "FUTURES" });
    await renewLease(userId, generation, token);
    await settleAutomationOrders(userId, generation, token);
    config = await autoConfig(userId);
    if (!config.expiresAt || Date.now() >= config.expiresAt.getTime()) {
      await prisma.alphaAutomationConfig.update({ where: { userId }, data: { enabled: false, status: "STOPPING", nextScanAt: null } });
      config = await autoConfig(userId);
    }
    if (!config.enabled) {
      const remaining = await prisma.alphaAutomationOrder.count({ where: { userId, status: { notIn: TERMINAL_AUTO_ORDER } } });
      if (!remaining) {
        await prisma.alphaAutomationConfig.update({ where: { userId }, data: { status: "STOPPED", nextScanAt: null } });
        return { stop: true, waitMs: 60_000 };
      }
      return { stop: false, waitMs: 60_000 };
    }
    const grant = await currentAutoGrant(userId);
    if (config.grantFingerprint !== grant.fingerprint) throw new Error("执行配置已变更；已有持仓仍受管理，请重新确认后开启新交易");
    if (config.nextScanAt && config.nextScanAt.getTime() > Date.now()) return { stop: false, waitMs: 60_000 };
    const settings = effectiveSettings(alphaAutomationSettingsSchema.parse(config.settings), grant.execution);
    const cycleAt = new Date();
    // Consume the scan slot before work: a timed-out scan is never replayed as another entry.
    await prisma.alphaAutomationConfig.update({ where: { userId }, data: { lastScanAt: cycleAt, nextScanAt: new Date(cycleAt.getTime() + settings.intervalMinutes * 60_000) } });
    const market = await loadAlphaAutomationMarket(settings);
    await renewLease(userId, generation, token);
    let { account } = await loadAutomationAccount(userId, { persistBaseline: true });
    await renewLease(userId, generation, token);
    const entries = await recentEntries(userId);
    await refreshSelectionBooks(market, settings);
    if (Date.now() - account.observedAt > Math.min(30_000, settings.maxQuoteAgeSeconds * 1000) - 2000)
      ({ account } = await loadAutomationAccount(userId, { persistBaseline: true }));
    const selection = withMarketDiagnostics(selectAlphaAutomationCandidates({ settings, now: Date.now(), market: "futures", observations: market.observations,
      markets: market.markets, account, recentEntries: entries, lastOrderAt: config.lastOrderAt?.getTime() ?? null }), market);
    await autoEvent(userId, "SCAN", scanMessage(selection), { candidates: selection.candidates, rejections: selection.rejections,
      parameterWarnings: selection.parameterWarnings, sourceStatus: selection.sourceStatus });
    for (const candidate of selection.candidates) {
      await renewLease(userId, generation, token);
      const latest = await autoConfig(userId);
      if (!latest.enabled || latest.leaseToken !== token || latest.generation !== generation || !latest.expiresAt || latest.expiresAt.getTime() <= Date.now()) break;
      if (latest.lastOrderAt && Date.now() - latest.lastOrderAt.getTime() < settings.minOrderGapMinutes * 60_000) break;
      const reservation = await prisma.alphaAutomationOrder.create({ data: { userId, generation, cycleKey: cycleAt.toISOString(),
        symbol: candidate.symbol, side: candidate.side, candidate: json(candidate), notional: candidate.worstCaseNotional ?? candidate.notional,
        closeAfter: new Date(Date.now() + settings.maxHoldingMinutes * 60_000) } });
      const { account: freshAccount } = await loadAutomationAccount(userId, { excludeReservationId: reservation.id });
      let approvalFilters: Awaited<ReturnType<typeof freshCandidate>>["filters"];
      try {
        const refreshed = await freshCandidate(candidate, settings);
        approvalFilters = refreshed.filters;
        validateAutomaticOrder({ ...refreshed, settings, account: freshAccount, quantity: candidate.quantity, leverage: candidate.leverage, now: Date.now() });
      } catch (caught) {
        // No intent or exchange order exists yet. Reject this expired/unexecutable candidate
        // and allow another independently qualified symbol in the same scan to be checked.
        const reason = caught instanceof Error ? caught.message : "最终行情或候选校验未通过";
        await prisma.alphaAutomationOrder.update({ where: { id: reservation.id }, data: { status: "REJECTED", error: reason } });
        await autoEvent(userId, "REJECTED", `${candidate.symbol}：${reason}`, { matchedStrategies: candidate.matchedStrategies, stage: "BEFORE_APPROVAL" });
        continue;
      }
      const approval = await approveTradeIntent({ symbol: candidate.symbol, side: candidate.side, entryPrice: candidate.entryPrice,
        stopLoss: candidate.stopLoss, takeProfit: candidate.takeProfit, leverage: candidate.leverage, riskPct: candidate.riskPct,
        source: `alpha-auto:${reservation.id}`, alphaScore: candidate.alphaScore, mode: "live", market: "futures", orderType: "MARKET" }, userId, true, {
        maxQuantity: candidate.quantity,
        quantityStep: approvalFilters.stepSize, minQuantity: approvalFilters.minQty, minNotional: approvalFilters.minNotional,
        matchedStrategies: candidate.matchedStrategies,
        context: { equity: freshAccount.equity, dailyPnl: freshAccount.dailyPnl, openPositions: freshAccount.openPositions.length + freshAccount.pendingEntries.length,
          openNotional: [...freshAccount.openPositions, ...freshAccount.pendingEntries].reduce((sum, item) => sum + item.notional, 0), reconciliationHealthy: freshAccount.reconciliationHealthy },
        policy: { riskPerTradePct: settings.riskPerTradePct, maxLeverage: settings.leverage, dailyLossLimitPct: settings.dailyLossLimitPct,
          maxOpenPositions: settings.maxPositions, maxPortfolioExposurePct: settings.maxPortfolioEquityPct, minAlphaScore: settings.minScore,
          perOrderNotionalLimit: settings.maxOrderNotional, dedupeWindowMinutes: settings.minOrderGapMinutes },
      });
      await renewLease(userId, generation, token);
      if (!approval.ok || !approval.executionPlan?.planId) {
        await prisma.alphaAutomationOrder.update({ where: { id: reservation.id }, data: { status: "REJECTED", error: "Risk Engine 拒绝候选" } });
        const reasons = Array.isArray(approval.violations) ? approval.violations.map((item: { code?: string; message?: string }) => ({ code: item.code, message: item.message })) : [];
        await autoEvent(userId, "REJECTED", `${candidate.symbol} 未通过 Risk Engine：${reasons.map((item: { code?: string; message?: string }) => item.message || item.code).join("；") || "审批未生成执行计划"}`, { matchedStrategies: candidate.matchedStrategies, reasons }); continue;
      }
      const planId = String(approval.executionPlan.planId);
      await prisma.alphaAutomationOrder.update({ where: { id: reservation.id }, data: { planId, status: "SUBMITTING" } });
      // Reserve the interval before any request. Unknown response keeps this slot consumed.
      await prisma.alphaAutomationConfig.update({ where: { userId }, data: { lastOrderAt: new Date() } });
      await executePlan(planId, userId);
      await renewLease(userId, generation, token);
      await prisma.alphaAutomationOrder.update({ where: { id: reservation.id }, data: { status: "MONITORING" } });
      await autoEvent(userId, "SUBMITTED", `${candidate.symbol} 已通过风控并提交，进入保护单、监控与对账流程。`, { planId, reservationId: reservation.id });
    }
    return { stop: false, waitMs: 60_000 };
  } catch (caught) {
    if (caught instanceof LeaseLost) return { stop: false, waitMs: 60_000 };
    const message = caught instanceof Error ? caught.message : "自动交易任务失败";
    const [remaining, current] = await Promise.all([
      prisma.alphaAutomationOrder.count({ where: { userId, status: { notIn: TERMINAL_AUTO_ORDER } } }), autoConfig(userId),
    ]);
    // Failures stop new entries, but keep the durable monitor alive for already-owned positions.
    await prisma.alphaAutomationConfig.updateMany({ where: { userId, generation, leaseToken: token }, data: { enabled: false, status: remaining ? "STOPPING" : "ERROR", lastError: message, nextScanAt: null } });
    if (current.lastError !== message) await autoEvent(userId, "ERROR", message);
    return { stop: !remaining, waitMs: 60_000 };
  } finally {
    await prisma.alphaAutomationConfig.updateMany({ where: { userId, generation, leaseToken: token }, data: { leaseToken: null, leaseUntil: null, heartbeatAt: new Date() } });
  }
}
