import type { User as SupabaseUser } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { allEntitlements, type PlanKey, type RoleKey } from "@/lib/entitlements";
import { isDatabaseConfigured, prisma } from "@/lib/prisma";
import { awardRegistrationReferral } from "@/lib/referrals";
import { verifyTwoFactorPass } from "@/lib/security";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type Viewer = {
  id: string;
  email: string;
  status: "ACTIVE" | "SUSPENDED" | "DELETED";
  displayName: string | null;
  avatarUrl: string | null;
  handle: string | null;
  username: string | null;
  role: RoleKey;
  plan: PlanKey;
  roles: string[];
  subscription: {
    status: string;
    planKey: string;
    provider: string;
    billingInterval: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  accessGrant: {
    label: string;
    endsAt: string;
  } | null;
  twoFactorEnabled: boolean;
  twoFactorPassed: boolean;
  needsSecondFactor: boolean;
  entitlements: string[];
};

function authProvider(user: SupabaseUser) {
  const provider = String(user.app_metadata?.provider ?? "email").toUpperCase();
  return provider === "GOOGLE" ? "GOOGLE" : "EMAIL";
}

function adminEmails() {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

async function attachPendingReferral(userId: string) {
  const ref = (await cookies()).get("welinkbtc_ref")?.value;
  if (!ref || !/^[a-z]{3,20}$/.test(ref)) return;

  const code = await prisma.referralCode.findUnique({ where: { code: ref } });
  if (!code || code.userId === userId || !code.active) return;

  await prisma.referral.upsert({
    where: { referredUserId: userId },
    update: {},
    create: {
      referrerUserId: code.userId,
      referredUserId: userId,
      referralCodeId: code.id,
      source: "referral_link"
    }
  });
  await awardRegistrationReferral(userId);
}

export async function syncAuthenticatedUser(user: SupabaseUser) {
  if (!user.email) throw new Error("Authenticated user does not have an email address");

  const email = user.email.toLowerCase();
  const provider = authProvider(user);
  const displayName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    null;
  const avatarUrl = (user.user_metadata?.avatar_url as string | undefined) ?? null;

  await prisma.$transaction(async (tx) => {
    await tx.user.upsert({
      where: { id: user.id },
      update: {
        email,
        emailVerifiedAt: user.email_confirmed_at ? new Date(user.email_confirmed_at) : undefined,
        lastLoginAt: new Date()
      },
      create: {
        id: user.id,
        email,
        emailVerifiedAt: user.email_confirmed_at ? new Date(user.email_confirmed_at) : null,
        lastLoginAt: new Date(),
        profile: { create: { displayName, avatarUrl } }
      }
    });

    await tx.authAccount.upsert({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId: String(user.identities?.[0]?.identity_id ?? email)
        }
      },
      update: { userId: user.id },
      create: {
        userId: user.id,
        provider,
        providerAccountId: String(user.identities?.[0]?.identity_id ?? email)
      }
    });

    const freeRole = await tx.role.upsert({
      where: { key: "free" },
      update: {},
      create: { key: "free", name: "普通用户", description: "基础会员权益" }
    });
    await tx.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: freeRole.id } },
      update: {},
      create: { userId: user.id, roleId: freeRole.id }
    });

    const existingSubscription = await tx.subscription.findFirst({ where: { userId: user.id } });
    if (!existingSubscription) {
      await tx.subscription.create({ data: { userId: user.id, planKey: "free", status: "FREE" } });
    }

    await tx.wlbAccount.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id }
    });

    if (adminEmails().has(email)) {
      const adminRole = await tx.role.upsert({
        where: { key: "admin" },
        update: {},
        create: { key: "admin", name: "管理员", description: "后台运营与全站管理" }
      });
      await tx.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
        update: {},
        create: { userId: user.id, roleId: adminRole.id, grantedBy: "ADMIN_EMAILS" }
      });
    }
  });

  await attachPendingReferral(user.id);
}

function effectivePlan(
  subscriptions: Array<{
    planKey: string;
    status: string;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
  }>,
  hasActiveAccessGrant = false
): PlanKey {
  if (hasActiveAccessGrant) return "max";
  const now = Date.now();
  const usable = subscriptions.filter((subscription) => {
    if (["ACTIVE", "TRIALING"].includes(subscription.status)) {
      return !subscription.currentPeriodEnd || subscription.currentPeriodEnd.getTime() > now;
    }
    return (
      subscription.status === "CANCELED" &&
      Boolean(subscription.currentPeriodEnd && subscription.currentPeriodEnd.getTime() > now)
    );
  });

  if (usable.some((subscription) => subscription.planKey === "max")) return "max";
  if (usable.some((subscription) => subscription.planKey === "pro")) return "pro";
  return "free";
}

const VIEWER_LOGIN_REFRESH_MS = 6 * 60 * 60_000;

function findViewerRecord(userId: string) {
  const now = new Date();
  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      roles: { include: { role: true } },
      subscriptions: { orderBy: { updatedAt: "desc" } },
      accessRedemptions: {
        where: { startsAt: { lte: now }, endsAt: { gt: now } },
        orderBy: { endsAt: "desc" },
        take: 1,
        include: { accessCode: { select: { label: true } } }
      },
      twoFactor: true
    }
  });
}

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  if (!isDatabaseConfigured()) return null;

  let record = await findViewerRecord(data.user.id);
  const projectionNeedsRepair =
    !record ||
    record.email !== data.user.email?.toLowerCase() ||
    record.roles.length === 0 ||
    record.subscriptions.length === 0;

  // Sign-up and OAuth callback routes already create this projection. Normal
  // authenticated polling should be read-only; only repair incomplete legacy
  // records instead of issuing a multi-table upsert on every request.
  if (projectionNeedsRepair) {
    await syncAuthenticatedUser(data.user);
    record = await findViewerRecord(data.user.id);
  } else if (record && (!record.lastLoginAt || Date.now() - record.lastLoginAt.getTime() >= VIEWER_LOGIN_REFRESH_MS)) {
    const cutoff = new Date(Date.now() - VIEWER_LOGIN_REFRESH_MS);
    await prisma.user.updateMany({
      where: {
        id: record.id,
        OR: [{ lastLoginAt: null }, { lastLoginAt: { lt: cutoff } }]
      },
      data: { lastLoginAt: new Date() }
    });
  }
  if (!record) return null;

  const roles = record.roles.map((item) => item.role.key);
  const activeAccessGrant = record.accessRedemptions[0] ?? null;
  const plan = effectivePlan(record.subscriptions, Boolean(activeAccessGrant));
  const role: RoleKey = roles.includes("admin")
    ? "admin"
    : roles.includes("operator")
      ? "operator"
    : plan === "max"
      ? "max"
      : plan === "pro"
        ? "pro"
        : "free";

  const latestSubscription = record.subscriptions[0] ?? null;
  let aal2 = false;
  if (record.twoFactor?.enabledAt) {
    const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    aal2 = assurance?.currentLevel === "aal2";
  }
  const twoFactorCookie = (await cookies()).get("welinkbtc_2fa")?.value;
  const backupPassed = await verifyTwoFactorPass(twoFactorCookie, record.id);
  const twoFactorPassed = !record.twoFactor?.enabledAt || aal2 || backupPassed;

  const viewer: Viewer = {
    id: record.id,
    email: record.email,
    status: record.status,
    displayName: record.profile?.displayName ?? null,
    avatarUrl: record.profile?.avatarUrl ?? null,
    handle: record.profile?.handle ?? null,
    username: record.profile?.handle ? `${record.profile.handle}.welinkBTC` : null,
    role,
    plan,
    roles,
    subscription: latestSubscription
      ? {
          status: latestSubscription.status,
          planKey: latestSubscription.planKey,
          provider: latestSubscription.provider,
          billingInterval: latestSubscription.billingInterval,
          currentPeriodEnd: latestSubscription.currentPeriodEnd?.toISOString() ?? null,
          cancelAtPeriodEnd: latestSubscription.cancelAtPeriodEnd
        }
      : null,
    accessGrant: activeAccessGrant
      ? {
          label: activeAccessGrant.accessCode.label,
          endsAt: activeAccessGrant.endsAt.toISOString()
        }
      : null,
    twoFactorEnabled: Boolean(record.twoFactor?.enabledAt),
    twoFactorPassed,
    needsSecondFactor: Boolean(record.twoFactor?.enabledAt && !twoFactorPassed),
    entitlements: []
  };
  viewer.entitlements = allEntitlements(viewer);
  return viewer;
});

/**
 * Minimal identity check for high-frequency, read-only state requests.
 *
 * The full viewer projection joins profiles, roles, subscriptions and access
 * grants. Box state reads only need an active user id and 2FA state, so keep
 * this path deliberately narrow. getClaims still verifies the Supabase JWT;
 * with asymmetric signing it normally does so locally.
 */
export async function getActiveViewerId(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  if (!supabase || !isDatabaseConfigured()) return null;

  const { data, error } = await supabase.auth.getClaims();
  const userId = typeof data?.claims.sub === "string" ? data.claims.sub : "";
  if (error || !data || !/^[0-9a-f-]{36}$/i.test(userId)) return null;

  const record = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      status: true,
      twoFactor: { select: { enabledAt: true } }
    }
  });
  if (!record || record.status !== "ACTIVE") return null;
  if (!record.twoFactor?.enabledAt) return record.id;

  if (data.claims.aal === "aal2") return record.id;
  const twoFactorCookie = (await cookies()).get("welinkbtc_2fa")?.value;
  return await verifyTwoFactorPass(twoFactorCookie, record.id) ? record.id : null;
}

export async function requireViewer(returnTo = "/account", requireSecondFactor = true) {
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  if (viewer.status !== "ACTIVE") redirect("/suspended");
  if (requireSecondFactor && viewer.needsSecondFactor) {
    redirect(`/auth/verify-2fa?next=${encodeURIComponent(returnTo)}`);
  }
  return viewer;
}

export async function requireAdmin(returnTo = "/admin") {
  const viewer = await requireViewer(returnTo, true);
  if (viewer.role !== "admin") redirect("/forbidden");
  if (!viewer.twoFactorEnabled) redirect("/account/security?admin_required=1");
  return viewer;
}
