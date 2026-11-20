"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { accessCodeHint, hashAccessCode, normalizeAccessCode } from "@/lib/access-codes";
import { writeAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { syncEligibleCommissionWlb } from "@/lib/wlb-assets";

const managedRoles = ["free", "pro", "max", "operator", "admin"];
const userIdSchema = z.string().uuid();
const recordIdSchema = z.string().trim().min(1).max(191);

function boundedNumber(formData: FormData, name: string, fallback: number, max: number) {
  return z.coerce.number().finite().min(0).max(max).parse(formData.get(name) ?? fallback);
}

const accessCodeSchema = z.object({
  label: z.string().trim().min(2).max(80),
  code: z.string().trim().min(8).max(80),
  maxRedemptions: z.string().trim().regex(/^\d+$/).max(8).optional(),
  expiresAt: z.string().trim().max(40).optional()
});

export async function createAccessCodeAction(formData: FormData) {
  const admin = await requireAdmin("/admin/access-codes");
  const parsed = accessCodeSchema.safeParse({
    label: formData.get("label"),
    code: formData.get("code"),
    maxRedemptions: formData.get("maxRedemptions") || undefined,
    expiresAt: formData.get("expiresAt") || undefined
  });
  if (!parsed.success) redirect("/admin/access-codes?error=invalid");

  const normalized = normalizeAccessCode(parsed.data.code);
  if (normalized.length < 8 || normalized.length > 64) redirect("/admin/access-codes?error=invalid");
  const codeHash = hashAccessCode(normalized);
  const existing = await prisma.accessCode.findUnique({ where: { codeHash }, select: { id: true } });
  if (existing) redirect("/admin/access-codes?error=exists");

  const maxRedemptions = parsed.data.maxRedemptions
    ? Math.max(1, Math.min(1_000_000, Number(parsed.data.maxRedemptions)))
    : null;
  const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  if (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date())) {
    redirect("/admin/access-codes?error=expiry");
  }

  await prisma.$transaction(async (tx) => {
    const accessCode = await tx.accessCode.create({
      data: {
        codeHash,
        codeHint: accessCodeHint(normalized),
        label: parsed.data.label,
        durationDays: 30,
        maxRedemptions,
        expiresAt,
        createdByUserId: admin.id
      }
    });
    await writeAudit({
      actorUserId: admin.id,
      action: "admin.access_code.created",
      targetType: "access_code",
      targetId: accessCode.id,
      metadata: { label: accessCode.label, codeHint: accessCode.codeHint, maxRedemptions, expiresAt: expiresAt?.toISOString() }
    }, tx);
  });
  revalidatePath("/admin/access-codes");
  redirect("/admin/access-codes?created=1");
}

export async function toggleAccessCodeAction(formData: FormData) {
  const admin = await requireAdmin("/admin/access-codes");
  const id = recordIdSchema.parse(formData.get("id"));
  const active = z.enum(["true", "false"]).parse(formData.get("active")) === "true";
  await prisma.$transaction(async (tx) => {
    const accessCode = await tx.accessCode.update({ where: { id }, data: { active } });
    await writeAudit({
      actorUserId: admin.id,
      action: active ? "admin.access_code.activated" : "admin.access_code.deactivated",
      targetType: "access_code",
      targetId: id,
      metadata: { label: accessCode.label }
    }, tx);
  });
  revalidatePath("/admin/access-codes");
}

export async function updateUserStatusAction(formData: FormData) {
  const admin = await requireAdmin("/admin/users");
  const userId = userIdSchema.parse(formData.get("userId"));
  const status = String(formData.get("status") ?? "");
  if (!userId || !["ACTIVE", "SUSPENDED"].includes(status)) return;
  if (userId === admin.id && status === "SUSPENDED") throw new Error("不能封禁当前管理员账户");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { status: status as "ACTIVE" | "SUSPENDED" } });
    await writeAudit({ actorUserId: admin.id, action: `admin.user.${status.toLowerCase()}`, targetType: "user", targetId: userId }, tx);
  });
  revalidatePath("/admin/users");
}

export async function updateUserRoleAction(formData: FormData) {
  const admin = await requireAdmin("/admin/users");
  const userId = userIdSchema.parse(formData.get("userId"));
  const roleKey = String(formData.get("role") ?? "");
  if (!userId || !managedRoles.includes(roleKey)) return;
  if (userId === admin.id && roleKey !== "admin") throw new Error("不能移除当前管理员自己的后台权限");

  await prisma.$transaction(async (tx) => {
    const target = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { status: true, emailVerifiedAt: true } });
    if (["admin", "operator"].includes(roleKey) && (target.status !== "ACTIVE" || !target.emailVerifiedAt)) {
      throw new Error("管理权限只能授予已验证邮箱的正常账户");
    }
    const roles = await tx.role.findMany({ where: { key: { in: managedRoles } } });
    await tx.userRole.deleteMany({
      where: {
        userId,
        roleId: { in: roles.filter((role) => role.key !== "free").map((role) => role.id) }
      }
    });
    const free = roles.find((role) => role.key === "free") ?? await tx.role.create({ data: { key: "free", name: "普通用户" } });
    await tx.userRole.upsert({
      where: { userId_roleId: { userId, roleId: free.id } }, update: {}, create: { userId, roleId: free.id, grantedBy: admin.id }
    });
    if (roleKey !== "free") {
      const role = roles.find((item) => item.key === roleKey) ?? await tx.role.create({ data: { key: roleKey, name: roleKey.toUpperCase() } });
      await tx.userRole.create({ data: { userId, roleId: role.id, grantedBy: admin.id } });
    }
    await writeAudit({ actorUserId: admin.id, action: "admin.user.role.updated", targetType: "user", targetId: userId, metadata: { role: roleKey } }, tx);
  });
  revalidatePath("/admin/users");
}

export async function resetUserTwoFactorAction(formData: FormData) {
  const admin = await requireAdmin("/admin/users");
  const userId = userIdSchema.parse(formData.get("userId"));
  if (!userId || userId === admin.id) throw new Error("不能从此操作重置当前管理员的 2FA");
  const setting = await prisma.twoFactorSetting.findUnique({ where: { userId } });
  if (!setting) return;
  const supabaseAdmin = createSupabaseAdminClient();
  if (!supabaseAdmin) throw new Error("认证管理服务未配置，不能重置 2FA");
  // The remote Auth factor and local projection cannot share a transaction.
  // Record intent first and fail closed if remote removal fails.
  await writeAudit({ actorUserId: admin.id, action: "admin.user.2fa.reset_requested", targetType: "user", targetId: userId });
  const { error } = await supabaseAdmin.auth.admin.mfa.deleteFactor({ id: setting.factorId, userId });
  if (error) throw error;
  await prisma.$transaction(async (tx) => {
    await tx.backupCode.deleteMany({ where: { userId } });
    await tx.twoFactorSetting.delete({ where: { userId } });
    await writeAudit({ actorUserId: admin.id, action: "admin.user.2fa.reset", targetType: "user", targetId: userId }, tx);
  });
  revalidatePath("/admin/users");
}

export async function adminSetSubscriptionAction(formData: FormData) {
  const admin = await requireAdmin("/admin/subscriptions");
  const userId = userIdSchema.parse(formData.get("userId"));
  const planKey = String(formData.get("planKey") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!userId || !["free", "pro", "max"].includes(planKey) || !["FREE", "ACTIVE", "PAST_DUE", "CANCELED"].includes(status)) return;

  await prisma.$transaction(async (tx) => {
    const current = await tx.subscription.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" } });
    if (current) {
      await tx.subscription.update({ where: { id: current.id }, data: { planKey, status: status as "FREE" | "ACTIVE" | "PAST_DUE" | "CANCELED", canceledAt: status === "CANCELED" ? new Date() : null } });
    } else {
      await tx.subscription.create({ data: { userId, planKey, status: status as "FREE" | "ACTIVE" | "PAST_DUE" | "CANCELED", provider: "admin" } });
    }
    const paidRoles = await tx.role.findMany({ where: { key: { in: ["pro", "max"] } } });
    await tx.userRole.deleteMany({ where: { userId, roleId: { in: paidRoles.map((role) => role.id) } } });
    if (status === "ACTIVE" && planKey !== "free") {
      const role = paidRoles.find((item) => item.key === planKey) ?? await tx.role.create({ data: { key: planKey, name: planKey.toUpperCase() } });
      await tx.userRole.create({ data: { userId, roleId: role.id, grantedBy: admin.id } });
    }
    await writeAudit({ actorUserId: admin.id, action: "admin.subscription.updated", targetType: "user", targetId: userId, metadata: { planKey, status } }, tx);
  });
  revalidatePath("/admin/subscriptions");
}

export async function updateCommissionStatusAction(formData: FormData) {
  const admin = await requireAdmin("/admin/referrals");
  const id = recordIdSchema.parse(formData.get("id"));
  const status = String(formData.get("status") ?? "");
  if (!id || !["PENDING", "APPROVED", "PAYABLE", "PAID", "VOID"].includes(status)) return;
  const commission = await prisma.$transaction(async (tx) => {
    if (status === "VOID") {
      const credited = await tx.wlbTransaction.findUnique({
        where: { externalReference: `commission:${id}` },
        select: { id: true }
      });
      if (credited) throw new Error("已经兑换为 WLB 的返佣不可直接作废，请通过 WLB 调账处理");
    }
    const updated = await tx.commissionLedger.update({
      where: { id },
      data: {
        status: status as "PENDING" | "APPROVED" | "PAYABLE" | "PAID" | "VOID",
        approvedAt: ["APPROVED", "PAYABLE", "PAID"].includes(status) ? new Date() : undefined,
        paidAt: status === "PAID" ? new Date() : undefined
      }
    });
    await writeAudit({ actorUserId: admin.id, action: "admin.commission.status.updated", targetType: "commission", targetId: id, metadata: { status } }, tx);
    return updated;
  });
  if (["APPROVED", "PAYABLE", "PAID"].includes(status)) {
    await syncEligibleCommissionWlb(commission.referrerUserId);
  }
  revalidatePath("/admin/referrals");
  revalidatePath("/admin/assets");
  revalidatePath("/account/assets");
}

export async function updateReferralRulesAction(formData: FormData) {
  const admin = await requireAdmin("/admin/referrals");
  const registrationReward = boundedNumber(formData, "registrationReward", 0.1, 10_000);
  const validUserReward = boundedNumber(formData, "validUserReward", 2, 100_000);
  const level1Rate = boundedNumber(formData, "level1Rate", 12, 100);
  const level2Rate = boundedNumber(formData, "level2Rate", 3, 100);
  const holdDays = z.number().int().parse(boundedNumber(formData, "holdDays", 14, 90));
  const value = {
    registrationRewardCents: Math.round(registrationReward * 100),
    validUserRewardCents: Math.round(validUserReward * 100),
    level1RateBps: Math.round(level1Rate * 100),
    level2RateBps: Math.round(level2Rate * 100),
    holdDays
  };
  await prisma.$transaction(async (tx) => {
    await tx.systemSetting.upsert({
      where: { key: "referral.rules" },
      update: { value, updatedBy: admin.id },
      create: { key: "referral.rules", value, updatedBy: admin.id, description: "注册、有效用户与两级订阅返佣规则" }
    });
    await writeAudit({ actorUserId: admin.id, action: "admin.referral.rules.updated", targetType: "system_setting", targetId: "referral.rules", metadata: value }, tx);
  });
  revalidatePath("/admin/referrals");
}

export async function updateContentGateAction(formData: FormData) {
  const admin = await requireAdmin("/admin/content-gates");
  const id = recordIdSchema.parse(formData.get("id"));
  const minimumPlan = String(formData.get("minimumPlan") ?? "free");
  const previewLimit = z.number().int().parse(boundedNumber(formData, "previewLimit", 0, 100));
  if (!id || !["guest", "free", "pro", "max"].includes(minimumPlan)) return;
  await prisma.$transaction(async (tx) => {
    await tx.contentGate.update({
      where: { id },
      data: {
        minimumPlan,
        previewLimit,
        guestPreview: formData.get("guestPreview") === "on",
        enabled: formData.get("enabled") === "on",
        updatedBy: admin.id
      }
    });
    await writeAudit({ actorUserId: admin.id, action: "admin.content_gate.updated", targetType: "content_gate", targetId: id, metadata: { minimumPlan, previewLimit } }, tx);
  });
  revalidatePath("/admin/content-gates");
}
