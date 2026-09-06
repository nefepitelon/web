import "server-only";

import { Prisma } from "@prisma/client";
import { requiredGuideTaskKeys } from "@/lib/onboarding-tasks";
import { prisma } from "@/lib/prisma";

export type ReferralRules = {
  registrationRewardCents: number;
  validUserRewardCents: number;
  level1RateBps: number;
  level2RateBps: number;
  holdDays: number;
};

export const defaultReferralRules: ReferralRules = {
  registrationRewardCents: 10,
  validUserRewardCents: 200,
  level1RateBps: 1200,
  level2RateBps: 300,
  holdDays: 14
};

function safeInteger(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.round(value)))
    : fallback;
}

export function parseReferralRules(value: Prisma.JsonValue | null | undefined): ReferralRules {
  const input = value && !Array.isArray(value) && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  return {
    registrationRewardCents: safeInteger(input.registrationRewardCents, defaultReferralRules.registrationRewardCents, 0, 1_000_000),
    validUserRewardCents: safeInteger(input.validUserRewardCents, defaultReferralRules.validUserRewardCents, 0, 10_000_000),
    level1RateBps: safeInteger(input.level1RateBps, defaultReferralRules.level1RateBps, 0, 10_000),
    level2RateBps: safeInteger(input.level2RateBps, defaultReferralRules.level2RateBps, 0, 10_000),
    holdDays: safeInteger(input.holdDays, defaultReferralRules.holdDays, 0, 90)
  };
}

export async function getReferralRules() {
  const setting = await prisma.systemSetting.findUnique({ where: { key: "referral.rules" } });
  return parseReferralRules(setting?.value);
}

async function rulesInTransaction(tx: Prisma.TransactionClient) {
  const setting = await tx.systemSetting.findUnique({ where: { key: "referral.rules" } });
  return parseReferralRules(setting?.value);
}

export async function awardRegistrationReferral(referredUserId: string) {
  return prisma.$transaction(async (tx) => {
    const referral = await tx.referral.findUnique({ where: { referredUserId } });
    if (!referral || referral.referrerUserId === referredUserId) return null;
    const rules = await rulesInTransaction(tx);
    if (rules.registrationRewardCents <= 0) return null;
    return tx.commissionLedger.upsert({
      where: { paymentEventId: `referral:${referredUserId}:registered` },
      update: {},
      create: {
        referrerUserId: referral.referrerUserId,
        referredUserId,
        paymentEventId: `referral:${referredUserId}:registered`,
        rewardType: "REGISTERED_USER",
        level: 1,
        planKey: "free",
        amountCents: rules.registrationRewardCents,
        currency: "usd",
        rateBps: 0,
        status: "APPROVED",
        approvedAt: new Date()
      }
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export type ReferralQualification = {
  qualified: boolean;
  username: boolean;
  profile: boolean;
  shared: boolean;
  social: boolean;
  wallet: boolean;
  guide: boolean;
  guideCompleted: number;
  guideTotal: number;
};

async function qualificationSnapshot(tx: Prisma.TransactionClient, userId: string): Promise<ReferralQualification> {
  const [user, socialCount, walletCount, completedTasks] = await Promise.all([
    tx.user.findUnique({ where: { id: userId }, include: { profile: true } }),
    tx.socialAccount.count({ where: { userId } }),
    tx.wallet.count({ where: { userId } }),
    tx.userOnboardingTask.findMany({ where: { userId }, select: { taskKey: true } })
  ]);
  const completed = new Set(completedTasks.map((task) => task.taskKey));
  const guideCompleted = requiredGuideTaskKeys.filter((key) => completed.has(key)).length;
  const result = {
    username: Boolean(user?.lastLoginAt && user.profile?.handle),
    profile: Boolean(user?.profile?.profileCompletedAt),
    shared: completed.has("share_referral"),
    social: socialCount > 0,
    wallet: walletCount > 0,
    guide: guideCompleted === requiredGuideTaskKeys.length,
    guideCompleted,
    guideTotal: requiredGuideTaskKeys.length
  };
  return { ...result, qualified: Object.values(result).every((value) => typeof value !== "boolean" || value) };
}

export async function getReferralQualification(userId: string) {
  return prisma.$transaction((tx) => qualificationSnapshot(tx, userId));
}

export async function evaluateReferralQualification(userId: string) {
  return prisma.$transaction(async (tx) => {
    const referral = await tx.referral.findUnique({ where: { referredUserId: userId } });
    const qualification = await qualificationSnapshot(tx, userId);
    if (!referral || !qualification.qualified || referral.referrerUserId === userId) return qualification;
    const rules = await rulesInTransaction(tx);
    await tx.referral.update({ where: { id: referral.id }, data: { qualifiedAt: referral.qualifiedAt ?? new Date() } });
    if (rules.validUserRewardCents > 0) {
      await tx.commissionLedger.upsert({
        where: { paymentEventId: `referral:${userId}:valid` },
        update: {},
        create: {
          referrerUserId: referral.referrerUserId,
          referredUserId: userId,
          paymentEventId: `referral:${userId}:valid`,
          rewardType: "VALID_USER",
          level: 1,
          planKey: "free",
          amountCents: rules.validUserRewardCents,
          currency: "usd",
          rateBps: 0,
          status: "APPROVED",
          approvedAt: new Date()
        }
      });
    }
    return qualification;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createSubscriptionReferralRewards(
  tx: Prisma.TransactionClient,
  input: { userId: string; paymentEventId: string; planKey: string; amountCents: number; currency?: string }
) {
  if (input.amountCents <= 0) return;
  const rules = await rulesInTransaction(tx);
  const levelOne = await tx.referral.findUnique({ where: { referredUserId: input.userId } });
  if (!levelOne || levelOne.referrerUserId === input.userId) return;

  const rewards = [{
    referrerUserId: levelOne.referrerUserId,
    referredUserId: input.userId,
    level: 1,
    rateBps: rules.level1RateBps
  }];
  const levelTwo = await tx.referral.findUnique({ where: { referredUserId: levelOne.referrerUserId } });
  if (levelTwo && levelTwo.referrerUserId !== input.userId && levelTwo.referrerUserId !== levelOne.referrerUserId) {
    rewards.push({
      referrerUserId: levelTwo.referrerUserId,
      referredUserId: input.userId,
      level: 2,
      rateBps: rules.level2RateBps
    });
  }

  for (const reward of rewards) {
    const amountCents = Math.floor(input.amountCents * reward.rateBps / 10_000);
    if (amountCents <= 0) continue;
    const eventId = `${input.paymentEventId}:l${reward.level}`;
    await tx.commissionLedger.upsert({
      where: { paymentEventId: eventId },
      update: {},
      create: {
        referrerUserId: reward.referrerUserId,
        referredUserId: reward.referredUserId,
        paymentEventId: eventId,
        rewardType: "SUBSCRIPTION",
        level: reward.level,
        planKey: input.planKey,
        amountCents,
        currency: input.currency ?? "usd",
        rateBps: reward.rateBps,
        status: "PENDING"
      }
    });
  }
}
