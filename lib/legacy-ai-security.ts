import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { configuredAccess } from "@/lib/content-gates";
import { quotaFor } from "@/lib/entitlements";
import { getViewer, type Viewer } from "@/lib/membership";
import { isDatabaseConfigured, prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { assertSameOrigin, requestContext } from "@/lib/request-security";
import { writeAudit } from "@/lib/audit";

export const protectedLegacyAiRoutes = new Set([
  "ai-ops-adapt", "ai-ops-generate", "ai-ops-image", "ai-ops-library", "ai-ops-polish", "ai-ops-publish",
  "surf-research", "asset-daily-report"
]);

export class LegacyAiSecurityError extends Error {
  constructor(message: string, public status: number, public retryAfterSeconds?: number) { super(message); }
}

type ResearchConversation = { userId: string; surf: string; openai: string; expiresAt: number };
function conversationSignature(value: string) {
  const key = process.env.TWO_FACTOR_SIGNING_KEY;
  if (!key || key.length < 32) throw new LegacyAiSecurityError("研究会话保护服务暂不可用。", 503);
  return createHmac("sha256", key).update(`welinkbtc-research-conversation-v1:${value}`).digest("base64url");
}

export function prepareResearchConversation(body: unknown, userId: string) {
  const input = body as Record<string, unknown>;
  let previous: ResearchConversation | null = null;
  if (input.conversationProof) {
    try {
      const token = String(input.conversationProof);
      if (token.length > 2048) throw new Error();
      const [encoded, signature, extra] = token.split(".");
      const expected = conversationSignature(encoded);
      const a = Buffer.from(signature ?? ""), b = Buffer.from(expected);
      if (extra || a.length !== b.length || !timingSafeEqual(a, b)) throw new Error();
      const decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
      if (decoded.userId !== userId || typeof decoded.expiresAt !== "number" || decoded.expiresAt < Date.now()) throw new Error();
      previous = decoded;
    } catch { throw new LegacyAiSecurityError("研究会话已失效，请开启新会话。", 400); }
  }
  const surf = typeof input.surfPreviousResponseId === "string" ? input.surfPreviousResponseId : "";
  const openai = typeof input.openaiPreviousResponseId === "string" ? input.openaiPreviousResponseId : "";
  if ((surf && surf !== previous?.surf) || (openai && openai !== previous?.openai) || input.previousResponseId) {
    throw new LegacyAiSecurityError("研究会话不匹配，请开启新会话。", 400);
  }
  return { ...input, previousResponseId: undefined, surfPreviousResponseId: surf, openaiPreviousResponseId: openai };
}

export function researchConversationResponse(payload: unknown, body: unknown, userId: string) {
  if (!payload || typeof payload !== "object") return payload;
  const result = payload as Record<string, unknown>;
  if (!result.ok || (!result.surfResponseId && !result.openaiResponseId)) return payload;
  const previous = body as Record<string, unknown>;
  const state: ResearchConversation = {
    userId, surf: String(result.surfResponseId ?? previous.surfPreviousResponseId ?? "").slice(0, 160),
    openai: String(result.openaiResponseId ?? previous.openaiPreviousResponseId ?? "").slice(0, 160),
    expiresAt: Date.now() + 2 * 60 * 60_000
  };
  const encoded = Buffer.from(JSON.stringify(state)).toString("base64url");
  return { ...result, conversationProof: `${encoded}.${conversationSignature(encoded)}` };
}

export function monthlyAiBucket(userId: string, now = new Date()) {
  const year = now.getUTCFullYear(), month = now.getUTCMonth();
  return {
    key: `legacy:ai:monthly:${userId}`,
    windowStart: new Date(Date.UTC(year, month, 1)),
    expiresAt: new Date(Date.UTC(year, month + 1, 2))
  };
}

export async function authorizeLegacyAiRequest(request: Request, legacy: string): Promise<Viewer | null> {
  if (!protectedLegacyAiRoutes.has(legacy)) return null;
  if (legacy === "asset-daily-report" && ["GET", "HEAD"].includes(request.method)) return null;
  if (request.method !== "POST") throw new LegacyAiSecurityError("仅支持 POST 请求。", 405);
  try { assertSameOrigin(request); }
  catch { throw new LegacyAiSecurityError("跨站请求已拒绝。", 403); }
  if (!isDatabaseConfigured()) throw new LegacyAiSecurityError("安全验证服务暂不可用。", 503);
  const viewer = await getViewer();
  if (!viewer) throw new LegacyAiSecurityError("请先登录。", 401);
  if (viewer.status !== "ACTIVE") throw new LegacyAiSecurityError("账户暂不可用。", 403);
  if (viewer.needsSecondFactor || !viewer.twoFactorPassed) throw new LegacyAiSecurityError("请先完成双重验证。", 403);
  if (viewer.role === "admin" && !viewer.twoFactorEnabled) throw new LegacyAiSecurityError("管理员必须启用双重验证。", 403);
  if (legacy === "ai-ops-publish") {
    if (viewer.role !== "admin" || !viewer.twoFactorEnabled) throw new LegacyAiSecurityError("发布需要管理员及双重验证权限。", 403);
  } else {
    const entitlement = legacy === "asset-daily-report" ? "ai.low" : "ai.standard";
    if (!(await configuredAccess(viewer, entitlement)).allowed) throw new LegacyAiSecurityError("当前会员权限不支持此 AI 功能。", 403);
  }
  return viewer;
}

export async function consumeLegacyAiBudget(request: Request, legacy: string, viewer: Viewer) {
  const { ipAddress } = await requestContext(request);
  const ip = createHash("sha256").update(ipAddress ?? "unknown").digest("hex").slice(0, 40);
  const limits = [
    { key: `legacy:ai:ip:${ip}`, maximum: 40, windowMs: 10 * 60_000 },
    { key: `legacy:ai:user:${viewer.id}`, maximum: 12, windowMs: 10 * 60_000 },
    { key: `legacy:ai:route:${legacy}:${viewer.id}`, maximum: legacy === "ai-ops-image" ? 3 : 20, windowMs: 60 * 60_000 }
  ];
  for (const limit of limits) {
    const rate = await checkRateLimit(limit.key, limit.maximum, limit.windowMs);
    if (!rate.allowed) throw new LegacyAiSecurityError("请求过于频繁，请稍后重试。", 429, rate.retryAfterSeconds);
  }
  // The same persisted monthly budget is shared across endpoints. It cannot
  // be bypassed by switching to another AI endpoint or another server instance.
  const definition = monthlyAiBucket(viewer.id);
  const bucket = await prisma.rateLimitBucket.upsert({
    where: { key_windowStart: { key: definition.key, windowStart: definition.windowStart } },
    update: { count: { increment: 1 }, expiresAt: definition.expiresAt },
    create: { ...definition, count: 1 }, select: { count: true }
  });
  if (bucket.count > quotaFor(viewer).aiResearchMonthly) throw new LegacyAiSecurityError("本月 AI 调用额度已用完。", 429);
  await writeAudit({ actorUserId: viewer.id, action: legacy === "ai-ops-publish" ? "ai.publish.requested" : "ai.requested",
    targetType: "api", targetId: legacy, metadata: { plan: viewer.plan }, request });
}

export async function readLegacyAiBody(request: Request) {
  const maxBytes = 64 * 1024;
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new LegacyAiSecurityError("请求需使用 JSON 格式。", 415);
  }
  if (Number(request.headers.get("content-length")) > maxBytes) throw new LegacyAiSecurityError("请求内容过大。", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new LegacyAiSecurityError("请求内容无效。", 400);
  const parts: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxBytes) { await reader.cancel(); throw new LegacyAiSecurityError("请求内容过大。", 413); }
    parts.push(value);
  }
  try {
    const body: unknown = JSON.parse(Buffer.concat(parts).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw new LegacyAiSecurityError("请求内容无效。", 400); }
}
