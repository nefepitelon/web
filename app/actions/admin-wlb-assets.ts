"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import {
  getWlbAssetSettings,
  grantWlbActivityReward,
  parseWlbToMilli,
  reviewWlbWithdrawal
} from "@/lib/wlb-assets";

function bounded(formData: FormData, key: string, fallback: number, min: number, max: number) {
  const value = Number(formData.get(key));
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function errorCode(error: unknown) {
  const value = error instanceof Error ? error.message : "REQUEST_FAILED";
  return /^[A-Z0-9_]{3,80}$/.test(value) ? value.toLowerCase() : "request_failed";
}

export async function updateWlbAssetSettingsAction(formData: FormData) {
  const admin = await requireAdmin("/admin/assets");
  const existing = await getWlbAssetSettings();
  const value = {
    usdtToWlb: 10,
    depositEnabled: formData.get("depositEnabled") === "on",
    transferEnabled: formData.get("transferEnabled") === "on",
    withdrawalEnabled: formData.get("withdrawalEnabled") === "on",
    minDepositUsdt: bounded(formData, "minDepositUsdt", existing.minDepositUsdt, 0.01, 1_000_000),
    minTransferWlb: bounded(formData, "minTransferWlb", existing.minTransferWlb, 0.001, 1_000_000_000),
    minWithdrawalWlb: bounded(formData, "minWithdrawalWlb", existing.minWithdrawalWlb, 0.1, 1_000_000_000),
    withdrawalFeeWlb: bounded(formData, "withdrawalFeeWlb", existing.withdrawalFeeWlb, 0, 1_000_000),
    maxDailyTransferWlb: bounded(formData, "maxDailyTransferWlb", existing.maxDailyTransferWlb, 1, 1_000_000_000)
  };
  await prisma.systemSetting.upsert({
    where: { key: "wlb.asset" },
    update: { value: value as Prisma.InputJsonValue, updatedBy: admin.id },
    create: {
      key: "wlb.asset",
      value: value as Prisma.InputJsonValue,
      updatedBy: admin.id,
      description: "WLB 站内资产、划转与提现风控配置"
    }
  });
  await writeAudit({
    actorUserId: admin.id,
    action: "wlb.settings.updated",
    targetType: "SystemSetting",
    targetId: "wlb.asset",
    metadata: value
  });
  revalidatePath("/account/assets");
  revalidatePath("/admin/assets");
  redirect("/admin/assets?saved=1");
}

export async function reviewWlbWithdrawalAction(transactionId: string, decision: "approve" | "reject", formData: FormData) {
  const admin = await requireAdmin("/admin/assets");
  try {
    await reviewWlbWithdrawal({
      transactionId,
      adminUserId: admin.id,
      approved: decision === "approve",
      txHash: String(formData.get("txHash") ?? "").trim() || undefined,
      note: String(formData.get("note") ?? "")
    });
  } catch (error) {
    redirect(`/admin/assets?error=${encodeURIComponent(errorCode(error))}`);
  }
  revalidatePath("/admin/assets");
  revalidatePath("/account/assets");
  redirect(`/admin/assets?reviewed=${decision}`);
}

export async function grantWlbRewardAction(formData: FormData) {
  const admin = await requireAdmin("/admin/assets");
  let amountMilliWlb: bigint;
  try {
    amountMilliWlb = parseWlbToMilli(String(formData.get("amountWlb") ?? ""));
  } catch {
    redirect("/admin/assets?error=invalid_amount");
  }
  try {
    await grantWlbActivityReward({
      adminUserId: admin.id,
      recipient: String(formData.get("recipient") ?? ""),
      amountMilliWlb,
      note: String(formData.get("note") ?? "")
    });
  } catch (error) {
    redirect(`/admin/assets?error=${encodeURIComponent(errorCode(error))}`);
  }
  revalidatePath("/admin/assets");
  revalidatePath("/account/assets");
  redirect("/admin/assets?rewarded=1");
}
