"use server";

import { Prisma } from "@prisma/client";
import { put } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAudit } from "@/lib/audit";
import { getCryptoPaymentSettings, isValidEvmAddress, isValidTronAddress, reviewManualPayment } from "@/lib/crypto-payments";
import { requireAdmin } from "@/lib/membership";
import { prisma } from "@/lib/prisma";

export async function updateCryptoPaymentSettingsAction(formData: FormData) {
  const admin = await requireAdmin("/admin/crypto-payments");
  const existing = await getCryptoPaymentSettings();
  const trc20Address = String(formData.get("trc20Address") ?? "").trim();
  const bscAddress = String(formData.get("bscAddress") ?? "").trim();
  const expiry = Math.min(1440, Math.max(15, Number(formData.get("invoiceExpiryMinutes") || 60)));
  const reviewSlaHours = Math.min(48, Math.max(1, Number(formData.get("reviewSlaHours") || 4)));
  const cnyPerUsd = Math.min(20, Math.max(1, Number(formData.get("cnyPerUsd") || 7.2)));
  if (trc20Address && !isValidTronAddress(trc20Address)) redirect("/admin/crypto-payments?error=invalid_tron_address");
  if (bscAddress && !isValidEvmAddress(bscAddress)) redirect("/admin/crypto-payments?error=invalid_bsc_address");

  async function uploadQr(field: string, current: string) {
    const file = formData.get(field);
    if (!(file instanceof File) || file.size === 0) return current;
    if (file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      redirect("/admin/crypto-payments?error=invalid_qr");
    }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-80) || "payment-qr.webp";
    return (await put(`payment-config/${field}-${safeName}`, file, { access: "public", addRandomSuffix: true })).url;
  }

  const [binanceQr, wechatQr] = await Promise.all([
    uploadQr("binanceQr", existing.binanceUid.qrCodeUrl),
    uploadQr("wechatQr", existing.wechat.qrCodeUrl)
  ]);
  const value = {
    invoiceExpiryMinutes: expiry,
    reviewSlaHours,
    cnyPerUsd,
    trc20: { enabled: formData.get("trc20Enabled") === "on", receiveAddress: trc20Address, confirmations: 1 },
    bsc: { enabled: formData.get("bscEnabled") === "on", receiveAddress: bscAddress, confirmations: Math.min(200, Math.max(1, Number(formData.get("bscConfirmations") || 12))) },
    binanceUid: {
      enabled: formData.get("binanceEnabled") === "on",
      recipient: String(formData.get("binanceUid") ?? "").trim(),
      recipientName: String(formData.get("binanceName") ?? "").trim(),
      qrCodeUrl: binanceQr,
      instructions: String(formData.get("binanceInstructions") ?? "").trim()
    },
    wechat: {
      enabled: formData.get("wechatEnabled") === "on",
      recipient: String(formData.get("wechatRecipient") ?? "").trim(),
      recipientName: String(formData.get("wechatName") ?? "").trim(),
      qrCodeUrl: wechatQr,
      instructions: String(formData.get("wechatInstructions") ?? "").trim()
    }
  };

  await prisma.systemSetting.upsert({
    where: { key: "crypto.payment" },
    update: { value: value as Prisma.InputJsonValue, updatedBy: admin.id },
    create: { key: "crypto.payment", value: value as Prisma.InputJsonValue, updatedBy: admin.id, description: "多通道订阅收款设置" }
  });
  await writeAudit({
    actorUserId: admin.id,
    action: "crypto.payment.settings_updated",
    targetType: "system_setting",
    targetId: "crypto.payment",
    metadata: { methods: ["TRON_USDT", "BSC_USDT", "BINANCE_UID", "WECHAT"], invoiceExpiryMinutes: expiry, reviewSlaHours }
  });
  revalidatePath("/account/subscription");
  revalidatePath("/admin/crypto-payments");
  redirect("/admin/crypto-payments?saved=1");
}

export async function reviewManualPaymentAction(invoiceId: string, decision: "approve" | "reject", formData: FormData) {
  const admin = await requireAdmin("/admin/crypto-payments");
  await reviewManualPayment({
    invoiceId,
    adminUserId: admin.id,
    approved: decision === "approve",
    note: String(formData.get("note") ?? "")
  });
  revalidatePath("/admin/crypto-payments");
  revalidatePath("/admin/subscriptions");
  redirect(`/admin/crypto-payments?reviewed=${decision}`);
}
