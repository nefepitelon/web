"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireViewer } from "@/lib/membership";
import {
  createWlbDepositInvoice,
  createWlbTransfer,
  createWlbWithdrawal,
  parseUsdtToCents,
  parseWlbToMilli,
  verifyWlbDeposit
} from "@/lib/wlb-assets";
import type { UsdtChainPaymentMethod } from "@/lib/crypto-payments";

const methodSchema = z.enum(["BSC_USDT", "TRON_USDT"]);

function errorCode(error: unknown) {
  const value = error instanceof Error ? error.message : "REQUEST_FAILED";
  return /^[A-Z0-9_]{3,80}$/.test(value) ? value.toLowerCase() : "request_failed";
}

export async function createWlbDepositAction(formData: FormData) {
  const viewer = await requireViewer("/account/assets");
  const method = methodSchema.safeParse(formData.get("method"));
  if (!method.success) redirect("/account/assets?error=invalid_payment_method");
  let amountCents: number;
  try {
    amountCents = parseUsdtToCents(String(formData.get("amountUsdt") ?? ""));
  } catch {
    redirect("/account/assets?error=invalid_amount");
  }
  let invoice;
  try {
    invoice = await createWlbDepositInvoice(viewer.id, method.data, amountCents);
  } catch (error) {
    redirect(`/account/assets?error=${encodeURIComponent(errorCode(error))}`);
  }
  redirect(`/account/assets/deposit/${invoice.id}`);
}

export async function verifyWlbDepositAction(transactionId: string, formData: FormData) {
  const viewer = await requireViewer(`/account/assets/deposit/${transactionId}`);
  const txHash = String(formData.get("txHash") ?? "").trim();
  if (!/^(0x)?[0-9a-fA-F]{64}$/.test(txHash)) redirect(`/account/assets/deposit/${transactionId}?error=invalid_tx`);
  try {
    await verifyWlbDeposit(viewer.id, transactionId, txHash);
  } catch (error) {
    redirect(`/account/assets/deposit/${transactionId}?error=${encodeURIComponent(errorCode(error))}`);
  }
  revalidatePath("/account/assets");
  revalidatePath("/admin/assets");
  redirect(`/account/assets/deposit/${transactionId}?paid=1`);
}

export async function transferWlbAction(formData: FormData) {
  const viewer = await requireViewer("/account/assets");
  if (!viewer.handle) redirect("/account/assets?error=sender_username_required");
  let amountMilliWlb: bigint;
  try {
    amountMilliWlb = parseWlbToMilli(String(formData.get("amountWlb") ?? ""));
  } catch {
    redirect("/account/assets?error=invalid_amount");
  }
  try {
    await createWlbTransfer(
      viewer.id,
      String(formData.get("recipient") ?? ""),
      amountMilliWlb,
      String(formData.get("note") ?? "")
    );
  } catch (error) {
    redirect(`/account/assets?error=${encodeURIComponent(errorCode(error))}`);
  }
  revalidatePath("/account/assets");
  revalidatePath("/admin/assets");
  redirect("/account/assets?transferred=1");
}

export async function withdrawWlbAction(formData: FormData) {
  const viewer = await requireViewer("/account/assets");
  const method = methodSchema.safeParse(formData.get("method"));
  if (!method.success) redirect("/account/assets?error=invalid_payment_method");
  let amountMilliWlb: bigint;
  try {
    amountMilliWlb = parseWlbToMilli(String(formData.get("amountWlb") ?? ""));
  } catch {
    redirect("/account/assets?error=invalid_amount");
  }
  try {
    await createWlbWithdrawal(
      viewer.id,
      method.data as UsdtChainPaymentMethod,
      String(formData.get("payoutAddress") ?? "").trim(),
      amountMilliWlb,
      String(formData.get("note") ?? "")
    );
  } catch (error) {
    redirect(`/account/assets?error=${encodeURIComponent(errorCode(error))}`);
  }
  revalidatePath("/account/assets");
  revalidatePath("/admin/assets");
  redirect("/account/assets?withdrawal=pending");
}

