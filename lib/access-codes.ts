import "server-only";

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { WELINK_ACCESS_CODE, welinkMaxTrialEndsAt } from "@/lib/max-trial";

export const PENDING_ACCESS_CODE_COOKIE = "welinkbtc_access_code";
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_ACCESS_CODE_LENGTH = 6;

export type AccessCodeRedemptionResult =
  | { status: "activated"; label: string; endsAt: Date }
  | { status: "already_redeemed"; label: string; endsAt: Date }
  | { status: "invalid" | "not_started" | "expired" | "exhausted" };

export function normalizeAccessCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashAccessCode(value: string) {
  return createHash("sha256").update(normalizeAccessCode(value), "utf8").digest("hex");
}

export function accessCodeHint(value: string) {
  const normalized = normalizeAccessCode(value);
  if (normalized.length <= 8) return normalized;
  return `${normalized.slice(0, 4)}…${normalized.slice(-4)}`;
}

function codeAvailability(code: {
  active: boolean;
  durationDays: number;
  startsAt: Date | null;
  expiresAt: Date | null;
  maxRedemptions: number | null;
  redemptionCount: number;
}, now: Date) {
  // Defense in depth for historical/imported records: a malformed campaign
  // cannot turn a trial code into an effectively permanent membership.
  if (!Number.isInteger(code.durationDays) || code.durationDays < 1 || code.durationDays > 366) return "invalid" as const;
  if (!code.active) return "invalid" as const;
  if (code.startsAt && code.startsAt > now) return "not_started" as const;
  if (code.expiresAt && code.expiresAt <= now) return "expired" as const;
  if (code.maxRedemptions !== null && code.redemptionCount >= code.maxRedemptions) {
    return "exhausted" as const;
  }
  return "available" as const;
}

export async function validateAccessCode(value: string) {
  const normalized = normalizeAccessCode(value);
  if (normalized.length < MIN_ACCESS_CODE_LENGTH || normalized.length > 64) return { valid: false as const };

  const code = await prisma.accessCode.findUnique({
    where: { codeHash: hashAccessCode(normalized) },
    select: {
      active: true,
      startsAt: true,
      expiresAt: true,
      maxRedemptions: true,
      redemptionCount: true,
      label: true,
      durationDays: true
    }
  });
  if (!code || codeAvailability(code, new Date()) !== "available") return { valid: false as const };
  return { valid: true as const, normalized, label: code.label, durationDays: code.durationDays };
}

export async function redeemAccessCode(
  userId: string,
  value: string,
  source: "login" | "account"
): Promise<AccessCodeRedemptionResult> {
  const normalized = normalizeAccessCode(value);
  if (normalized.length < MIN_ACCESS_CODE_LENGTH || normalized.length > 64) return { status: "invalid" };
  const now = new Date();

  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { status: true, emailVerifiedAt: true }
      });
      if (!user || user.status !== "ACTIVE" || !user.emailVerifiedAt) return { status: "invalid" } as const;
      const code = await tx.accessCode.findUnique({
        where: { codeHash: hashAccessCode(normalized) }
      });
      if (!code) return { status: "invalid" } as const;

      const availability = codeAvailability(code, now);
      if (availability !== "available") return { status: availability } as const;

      const existing = await tx.accessCodeRedemption.findUnique({
        where: { accessCodeId_userId: { accessCodeId: code.id, userId } }
      });
      if (existing) {
        return { status: "already_redeemed", label: code.label, endsAt: existing.endsAt } as const;
      }

      const reserved = await tx.accessCode.updateMany({
        where: {
          id: code.id,
          active: true,
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
            ...(code.maxRedemptions === null
              ? []
              : [{ redemptionCount: { lt: code.maxRedemptions } }])
          ]
        },
        data: { redemptionCount: { increment: 1 } }
      });
      if (reserved.count !== 1) return { status: "exhausted" } as const;

      const endsAt = normalized === WELINK_ACCESS_CODE
        ? welinkMaxTrialEndsAt(now)
        : new Date(now.getTime() + code.durationDays * DAY_MS);
      await tx.accessCodeRedemption.create({
        data: { accessCodeId: code.id, userId, source, startsAt: now, endsAt }
      });
      return { status: "activated", label: code.label, endsAt } as const;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.accessCodeRedemption.findFirst({
        where: { userId, accessCode: { codeHash: hashAccessCode(normalized) } },
        include: { accessCode: { select: { label: true } } }
      });
      if (existing) {
        return {
          status: "already_redeemed",
          label: existing.accessCode.label,
          endsAt: existing.endsAt
        };
      }
    }
    throw error;
  }
}
