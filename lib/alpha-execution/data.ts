import "server-only";
import { AlphaExecutionMode, AlphaExecutionState, AlphaMarketType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { maskProxy } from "@/lib/alpha-execution/credentials";
import { automationFillBindings } from "./automation-origin";

export async function getOrCreateAlphaExecutionConfig(userId: string) {
  // An empty-update upsert performs multiple reads in Prisma. Polls normally
  // find an existing row; retain atomic upsert only for first-use races.
  const config = await prisma.alphaExecutionConfig.findUnique({ where: { userId } }) ?? await prisma.alphaExecutionConfig.upsert({
    where: { userId },
    update: {},
    create: { userId }
  });
  if (config.activeMode !== AlphaExecutionMode.MOCK_EXCHANGE && config.activeMode !== AlphaExecutionMode.TESTNET) return config;
  // Retired interactive environments return to paper; never promote an account to live.
  await prisma.alphaExecutionConfig.updateMany({
    where: { userId, activeMode: { in: [AlphaExecutionMode.MOCK_EXCHANGE, AlphaExecutionMode.TESTNET] } },
    data: { activeMode: AlphaExecutionMode.PAPER, autoExecuteEnabled: false, testnetEnabled: false }
  });
  return prisma.alphaExecutionConfig.findUniqueOrThrow({ where: { userId } });
}

export async function alphaCredentialSummary(userId: string) {
  const credentials = await prisma.alphaTradingCredential.findMany({
    where: { userId },
    select: {
      id: true,
      environment: true,
      market: true,
      label: true,
      apiKeyHint: true,
      proxyEncrypted: true,
      enabled: true,
      verifiedAt: true,
      permissionSummary: true,
      lastError: true,
      updatedAt: true
    },
    orderBy: [{ environment: "asc" }, { market: "asc" }]
  });

  return credentials.map((credential) => ({
    ...credential,
    proxyConfigured: Boolean(credential.proxyEncrypted),
    proxyEncrypted: undefined
  }));
}

export async function writeAlphaAudit(input: {
  userId: string;
  state: AlphaExecutionState;
  status: string;
  message: string;
  intentId?: string | null;
  planId?: string | null;
  orderId?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  return prisma.alphaTradingAudit.create({
    data: {
      userId: input.userId,
      state: input.state,
      status: input.status,
      message: input.message,
      intentId: input.intentId ?? null,
      planId: input.planId ?? null,
      orderId: input.orderId ?? null,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined
    },
    select: { id: true }
  });
}

export function modeFrom(value: string) {
  const normalized = value.trim().toUpperCase();
  if (normalized === "MOCK_EXCHANGE") return AlphaExecutionMode.MOCK_EXCHANGE;
  if (normalized === "TESTNET") return AlphaExecutionMode.TESTNET;
  if (normalized === "LIVE") return AlphaExecutionMode.LIVE;
  return AlphaExecutionMode.PAPER;
}

export function marketFrom(value: string) {
  return value.trim().toUpperCase() === "SPOT" ? AlphaMarketType.SPOT : AlphaMarketType.FUTURES;
}

export function publicConfig(config: Awaited<ReturnType<typeof getOrCreateAlphaExecutionConfig>>) {
  return {
    activeMode: config.activeMode.toLowerCase(),
    defaultMarket: config.defaultMarket.toLowerCase(),
    testnetEnabled: config.testnetEnabled,
    liveEnabled: config.liveEnabled,
    autoExecuteEnabled: config.autoExecuteEnabled,
    killSwitchActive: config.killSwitchActive,
    requireManualConfirmation: config.requireManualConfirmation,
    requireProtectionOrders: config.requireProtectionOrders,
    riskPerTradePct: config.riskPerTradePct,
    maxLeverage: config.maxLeverage,
    dailyLossLimitPct: config.dailyLossLimitPct,
    dedupeWindowMinutes: config.dedupeWindowMinutes,
    maxOpenPositions: config.maxOpenPositions,
    maxPortfolioExposurePct: config.maxPortfolioExposurePct,
    minAlphaScore: config.minAlphaScore,
    perOrderNotionalLimit: config.perOrderNotionalLimit,
    dailyNotionalLimit: config.dailyNotionalLimit,
    liveUnlocked: Boolean(config.liveUnlockedAt && config.liveEnabled),
    liveUnlockedAt: config.liveUnlockedAt?.toISOString() ?? null,
    lastReconciledAt: config.lastReconciledAt?.toISOString() ?? null,
    reconciliationHealthy: config.reconciliationHealthy
  };
}

export async function executionSnapshot(userId: string) {
  const riskWindowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [config, credentials, plans, orders, positions, audits, closedPositionTotals, rejectedIntentTotals] = await Promise.all([
    getOrCreateAlphaExecutionConfig(userId),
    alphaCredentialSummary(userId),
    prisma.alphaExecutionPlan.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, state: true, environment: true, market: true, createdAt: true,
        intent: { select: { symbol: true, side: true, source: true, alphaScore: true } } }
    }),
    prisma.alphaTradingOrder.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 40,
      omit: { rawResponse: true }, include: { plan: { select: { intent: { select: { source: true } } } } } }),
    prisma.alphaTradingPosition.findMany({
      where: { userId },
      orderBy: { openedAt: "desc" },
      take: 40,
      include: { plan: { select: { intent: { select: { source: true, alphaScore: true, leverage: true } } } } }
    }),
    prisma.alphaTradingAudit.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 60,
      select: { id: true, state: true, status: true, message: true, createdAt: true } }),
    prisma.alphaTradingPosition.groupBy({
      by: ["environment", "market"],
      where: { userId, state: AlphaExecutionState.CLOSED },
      _sum: { unrealizedPnl: true },
      _count: { _all: true }
    }),
    prisma.alphaTradeIntent.groupBy({
      by: ["environment", "market"],
      where: { userId, state: AlphaExecutionState.RISK_REJECTED, createdAt: { gte: riskWindowStart } },
      _count: { _all: true }
    })
  ]);

  const automatedPlanIds = [...new Set([...orders, ...positions].filter(row => row.environment === "LIVE"
    && row.plan.intent.source.startsWith("alpha-auto:")).map(row => row.planId))];
  const [reservations, filledEntries] = automatedPlanIds.length ? await Promise.all([
    prisma.alphaAutomationOrder.findMany({ where: { userId, planId: { in: automatedPlanIds } }, select: { id: true, planId: true, symbol: true, side: true } }),
    prisma.alphaTradingOrder.findMany({ where: { userId, planId: { in: automatedPlanIds }, environment: "LIVE", market: "FUTURES", role: "ENTRY", filledQuantity: { gt: 0 }, exchangeOrderId: { not: null } },
      select: { id: true, planId: true, symbol: true, side: true, environment: true, market: true, role: true, filledQuantity: true, exchangeOrderId: true,
        plan: { select: { intent: { select: { source: true } } } } } }),
  ]) : [[], []];
  const automationBindings = automationFillBindings(reservations, filledEntries);
  const origin = (row: { planId: string; symbol: string; environment: string; market: string }) => {
    const binding = automationBindings.get(row.planId);
    const verified = binding && row.environment === "LIVE" && row.market === "FUTURES" && row.symbol === binding.symbol;
    return { isAutomation: Boolean(verified), automationOrder: verified
      ? { reservationId: binding.reservationId, source: binding.source, entryOrderId: binding.entryOrderId } : null };
  };

  const activePositionStates = new Set<AlphaExecutionState>([
    AlphaExecutionState.MONITORING,
    AlphaExecutionState.PROTECTION_ACTIVE,
    AlphaExecutionState.RECONCILING,
    AlphaExecutionState.UNKNOWN
  ]);
  const portfolioStats = credentials.map((credential) => {
    const permissionSummary = credential.permissionSummary
      && typeof credential.permissionSummary === "object"
      && !Array.isArray(credential.permissionSummary)
      ? credential.permissionSummary as Record<string, unknown>
      : {};
    const activePositions = positions.filter((position) =>
      position.environment === credential.environment
      && position.market === credential.market
      && activePositionStates.has(position.state)
    );
    const equity = Number(permissionSummary.equity);
    const localRiskExposureNotional = activePositions.reduce((total, position) =>
      total + Math.abs(position.quantity * Number(position.markPrice ?? position.entryPrice)), 0);
    const localUnrealizedPnl = activePositions.reduce((total, position) => total + position.unrealizedPnl, 0);
    const accountRiskExposure = Number(permissionSummary.riskExposureNotional);
    const accountUnrealizedPnl = Number(permissionSummary.unrealizedPnl);
    const riskExposureNotional = permissionSummary.riskExposureNotional != null && Number.isFinite(accountRiskExposure)
      ? accountRiskExposure
      : localRiskExposureNotional;
    const unrealizedPnl = permissionSummary.unrealizedPnl != null && Number.isFinite(accountUnrealizedPnl)
      ? accountUnrealizedPnl
      : localUnrealizedPnl;
    const closed = closedPositionTotals.find((item) => item.environment === credential.environment && item.market === credential.market);
    const historicalRealizedPnl = Number(closed?._sum.unrealizedPnl ?? 0);
    return {
      environment: credential.environment.toLowerCase(),
      market: credential.market.toLowerCase(),
      equity: Number.isFinite(equity) ? equity : null,
      riskExposureNotional,
      riskExposurePct: Number.isFinite(equity) && equity > 0 ? riskExposureNotional / equity * 100 : null,
      unrealizedPnl,
      estimatedClosedPnl: historicalRealizedPnl,
      historicalRealizedPnl: null,
      historicalRealizedPnlSource: "use_exchange_income_endpoint",
      closedTradeCount: closed?._count._all ?? 0,
      refreshedAt: String(permissionSummary.updateTime ?? credential.updatedAt.toISOString())
    };
  });

  return {
    config: publicConfig(config),
    credentials,
    plans,
    orders: orders.map(row => ({ ...row, ...origin(row) })),
    positions: positions.map(row => ({ ...row, ...origin(row) })),
    audits,
    portfolioStats,
    riskMetrics: {
      windowStart: riskWindowStart.toISOString(),
      updatedAt: new Date().toISOString(),
      rejectedIntents: rejectedIntentTotals.map((item) => ({
        environment: item.environment.toLowerCase(),
        market: item.market.toLowerCase(),
        count: item._count._all
      }))
    }
  };
}

export { maskProxy };
