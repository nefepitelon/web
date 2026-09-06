import "server-only";
import { AlphaExecutionMode, AlphaExecutionState, AlphaMarketType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { maskProxy } from "@/lib/alpha-execution/credentials";

export async function getOrCreateAlphaExecutionConfig(userId: string) {
  return prisma.alphaExecutionConfig.upsert({
    where: { userId },
    update: {},
    create: { userId }
  });
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
    }
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
  const [config, credentials, plans, orders, positions, audits, closedPositionTotals] = await Promise.all([
    getOrCreateAlphaExecutionConfig(userId),
    alphaCredentialSummary(userId),
    prisma.alphaExecutionPlan.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { intent: { select: { symbol: true, side: true, source: true, alphaScore: true } } }
    }),
    prisma.alphaTradingOrder.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 40 }),
    prisma.alphaTradingPosition.findMany({
      where: { userId },
      orderBy: { openedAt: "desc" },
      take: 40,
      include: { plan: { select: { intent: { select: { source: true, alphaScore: true, leverage: true } } } } }
    }),
    prisma.alphaTradingAudit.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 60 }),
    prisma.alphaTradingPosition.groupBy({
      by: ["environment", "market"],
      where: { userId, state: AlphaExecutionState.CLOSED },
      _sum: { unrealizedPnl: true },
      _count: { _all: true }
    })
  ]);

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
      historicalRealizedPnl,
      closedTradeCount: closed?._count._all ?? 0,
      refreshedAt: String(permissionSummary.updateTime ?? credential.updatedAt.toISOString())
    };
  });

  return {
    config: publicConfig(config),
    credentials,
    plans,
    orders,
    positions,
    audits,
    portfolioStats
  };
}

export { maskProxy };
