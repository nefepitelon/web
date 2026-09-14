import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma, AlphaExecutionState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrCreateAlphaExecutionConfig, publicConfig, writeAlphaAudit } from "./data";
import { alphaAutomationSettingsSchema, DEFAULT_ALPHA_AUTOMATION_SETTINGS, ALPHA_AUTOMATION_STRATEGY_VERSION } from "./automation-strategy";
import { readSavedAutomationSettings, requiresAutomationStrategySelection } from "./automation-settings";

export const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export const TERMINAL_AUTO_ORDER = ["CLOSED", "REJECTED", "CANCELED"];
export async function autoConfig(userId: string) {
  return await prisma.alphaAutomationConfig.findUnique({ where: { userId } }) ?? prisma.alphaAutomationConfig.upsert({ where: { userId }, update: {},
    create: { userId, settings: json(DEFAULT_ALPHA_AUTOMATION_SETTINGS), version: randomUUID() } });
}
export async function autoEvent(userId: string, kind: string, message: string, metadata: Record<string, unknown> = {}) {
  return writeAlphaAudit({ userId, state: AlphaExecutionState.NORMALIZED, status: `AUTO_${kind}`, message,
    metadata: { ...metadata, automation: true, environment: "LIVE", market: "FUTURES" } });
}

/** Persisted consent is invalidated when the administrator, factor, key or execution policy changes. */
export async function currentAutoGrant(userId: string, options: { management?: boolean } = {}) {
  const [user, execution, credential] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, include: { roles: { include: { role: true } }, twoFactor: true } }),
    getOrCreateAlphaExecutionConfig(userId),
    prisma.alphaTradingCredential.findUnique({ where: { userId_environment_market: { userId, environment: "LIVE", market: "FUTURES" } } }),
  ]);
  if (!user || user.status !== "ACTIVE" || !user.roles.some((entry) => entry.role.key === "admin") || !user.twoFactor?.enabledAt)
    throw new Error("自动实盘授权失效：需要启用双重验证的有效管理员");
  if (!options.management && (execution.activeMode !== "LIVE" || execution.defaultMarket !== "FUTURES" || !execution.liveEnabled || !execution.liveUnlockedAt
      || !execution.requireProtectionOrders || execution.killSwitchActive))
    throw new Error("自动交易需要已解锁的 LIVE USDT 合约环境、保护单与未触发的总开关");
  if (!credential?.enabled || !credential.verifiedAt) throw new Error("LIVE 合约凭据尚未验证");
  const managementFingerprint = createHash("sha256").update(JSON.stringify([
    user.id, user.twoFactor.factorId, user.twoFactor.enabledAt, credential.id, credential.apiKeyEncrypted,
    credential.apiSecretEncrypted, credential.proxyEncrypted, credential.verifiedAt,
  ])).digest("hex");
  const policyFingerprint = createHash("sha256").update(JSON.stringify([
    ALPHA_AUTOMATION_STRATEGY_VERSION,
    execution.liveUnlockedAt, execution.liveUnlockedBy, execution.riskPerTradePct, execution.maxLeverage,
    execution.dailyLossLimitPct, execution.dedupeWindowMinutes, execution.maxOpenPositions,
    execution.maxPortfolioExposurePct, execution.minAlphaScore, execution.perOrderNotionalLimit, execution.dailyNotionalLimit,
  ])).digest("hex");
  return { fingerprint: `${managementFingerprint}:${policyFingerprint}`, managementFingerprint, execution, credential };
}

export async function automationSnapshot(userId: string) {
  const [config, execution, events] = await Promise.all([
    autoConfig(userId), getOrCreateAlphaExecutionConfig(userId),
    prisma.alphaTradingAudit.findMany({ where: { userId, status: { startsWith: "AUTO_" } }, orderBy: { createdAt: "desc" }, take: 30,
      select: { id: true, status: true, message: true, createdAt: true } }),
  ]);
  const { grantFingerprint: _fingerprint, leaseToken: _token, leaseUntil: _lease, submissionToken: _submissionToken,
    submissionUntil: _submissionUntil, settings, dailyBaseline: _baseline, ...visible } = config;
  return { ok: true, settings: readSavedAutomationSettings(settings), config: visible,
    strategySelectionRequired: requiresAutomationStrategySelection(settings),
    currentExecutionConfig: publicConfig(execution),
    events: events.map((event) => ({ ...event, kind: event.status.slice(5), detailAvailable: event.status === "AUTO_SCAN" })) };
}

export async function saveAutomationSettings(userId: string, input: unknown) {
  const settings = alphaAutomationSettingsSchema.parse(input);
  settings.enabled = false;
  await autoConfig(userId);
  // Saving never grants execution, and cannot race a currently running/finishing session.
  const changed = await prisma.alphaAutomationConfig.updateMany({
    where: { userId, enabled: false, status: { in: ["STOPPED", "ERROR", "EXPIRED"] }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] },
    data: { settings: json(settings), version: randomUUID(), lastError: null },
  });
  if (!changed.count) throw new Error("请先停止自动开仓，等待本策略持仓管理结束后再修改配置");
  await autoEvent(userId, "SAVED", "自动交易参数已保存，尚未授权启动。", { settings });
}

export async function stopAutomation(userId: string) {
  const config = await autoConfig(userId);
  const remaining = await prisma.alphaAutomationOrder.count({ where: { userId, status: { notIn: TERMINAL_AUTO_ORDER } } });
  const running = config.leaseUntil && config.leaseUntil.getTime() > Date.now();
  await prisma.alphaAutomationConfig.update({ where: { userId }, data: { enabled: false, status: remaining || running ? "STOPPING" : "STOPPED", nextScanAt: null } });
  await autoEvent(userId, "STOP", "已停止接收新开仓；已提交订单继续对账，本策略持仓继续执行保护单与到期平仓。");
}
