import "server-only";

import { createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";

export class TideSightApiAccessError extends Error {
  status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.name = "TideSightApiAccessError";
    this.status = status;
  }
}

function hashApiKey(value: string) {
  const signingKey = process.env.TWO_FACTOR_SIGNING_KEY;
  if (!signingKey) throw new TideSightApiAccessError("API Key 验证服务尚未配置", 503);
  return createHmac("sha256", signingKey).update(value).digest("hex");
}

export async function requireTideSightApiKey(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const raw = authorization.match(/^Bearer\s+(wlb_live_[A-Za-z0-9_-]+)$/i)?.[1];
  if (!raw) throw new TideSightApiAccessError("请使用 WELINKBTC API Key 的 Bearer 认证", 401);

  const now = new Date();
  const key = await prisma.apiKey.findFirst({
    where: { secretHash: hashApiKey(raw), revokedAt: null },
    include: {
      user: {
        include: {
          roles: { include: { role: true } },
          subscriptions: { orderBy: { updatedAt: "desc" } },
          accessRedemptions: {
            where: { startsAt: { lte: now }, endsAt: { gt: now } },
            take: 1,
          },
        },
      },
    },
  });
  if (!key || key.user.status !== "ACTIVE") throw new TideSightApiAccessError("API Key 无效、已撤销或账户不可用", 401);

  const isAdmin = key.user.roles.some((item) => item.role.key === "admin");
  const hasMax = key.user.subscriptions.some((subscription) => {
    if (subscription.planKey !== "max") return false;
    if (!["ACTIVE", "TRIALING", "CANCELED"].includes(subscription.status)) return false;
    return !subscription.currentPeriodEnd || subscription.currentPeriodEnd > now;
  });
  if (!isAdmin && !hasMax && key.user.accessRedemptions.length === 0) {
    throw new TideSightApiAccessError("TideSight 策略信号入口需要 Max 权限", 403);
  }

  await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: now } });
  return { userId: key.userId, apiKeyId: key.id };
}

export function tideSightApiError(caught: unknown) {
  const status = caught instanceof TideSightApiAccessError ? caught.status : 400;
  const message = caught instanceof Error ? caught.message : "TideSight 请求失败";
  return Response.json({ ok: false, error: message, message }, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
