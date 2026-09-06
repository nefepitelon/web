"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { put } from "@vercel/blob";
import { z } from "zod";
import { createCryptoInvoice, submitManualPayment, verifyCryptoInvoice, type PaymentMethod } from "@/lib/crypto-payments";
import { requireViewer } from "@/lib/membership";
import type { BillablePlan, BillingInterval } from "@/lib/plans";

export async function createCryptoInvoiceAction(plan: BillablePlan, interval: BillingInterval, method: PaymentMethod) {
  if (!(["pro", "max"] as string[]).includes(plan) || !(["month", "year"] as string[]).includes(interval)) throw new Error("Invalid plan");
  if (!["TRON_USDT", "BSC_USDT", "BINANCE_UID", "WECHAT"].includes(method)) throw new Error("Invalid payment method");
  const viewer = await requireViewer("/account/subscription");
  try {
    const invoice = await createCryptoInvoice(viewer.id, plan, interval, method);
    redirect(`/account/subscription/crypto/${invoice.id}`);
  } catch (caught) {
    if (caught instanceof Error && ["CRYPTO_NOT_CONFIGURED", "PAYMENT_METHOD_NOT_CONFIGURED"].includes(caught.message)) redirect("/account/subscription?crypto=not_configured");
    throw caught;
  }
}

export async function verifyCryptoInvoiceAction(invoiceId: string, formData: FormData) {
  const viewer = await requireViewer(`/account/subscription/crypto/${invoiceId}`);
  const parsed = z.string().trim().regex(/^(0x)?[0-9a-fA-F]{64}$/).safeParse(formData.get("txHash"));
  if (!parsed.success) redirect(`/account/subscription/crypto/${invoiceId}?error=invalid_tx`);
  try {
    await verifyCryptoInvoice(viewer.id, invoiceId, parsed.data);
    revalidatePath("/account/subscription");
    redirect(`/account/subscription/crypto/${invoiceId}?paid=1`);
  } catch (caught) {
    const code = caught instanceof Error ? caught.message : "verification_failed";
    redirect(`/account/subscription/crypto/${invoiceId}?error=${encodeURIComponent(code.toLowerCase())}`);
  }
}

export async function submitManualPaymentAction(invoiceId: string, formData: FormData) {
  const viewer = await requireViewer(`/account/subscription/crypto/${invoiceId}`);
  const paymentReference = String(formData.get("paymentReference") ?? "").trim();
  const proof = formData.get("proof");
  let proofUrl: string | undefined;

  if (proof instanceof File && proof.size > 0) {
    if (proof.size > 5 * 1024 * 1024) redirect(`/account/subscription/crypto/${invoiceId}?error=proof_too_large`);
    if (!["image/jpeg", "image/png", "image/webp"].includes(proof.type)) redirect(`/account/subscription/crypto/${invoiceId}?error=invalid_proof`);
    const safeName = proof.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-80) || "payment-proof.webp";
    const blob = await put(`payment-proofs/${viewer.id}/${invoiceId}-${safeName}`, proof, { access: "public", addRandomSuffix: true });
    proofUrl = blob.url;
  }

  try {
    await submitManualPayment(viewer.id, invoiceId, { paymentReference, proofUrl });
  } catch (caught) {
    const code = caught instanceof Error ? caught.message.toLowerCase() : "submission_failed";
    redirect(`/account/subscription/crypto/${invoiceId}?error=${encodeURIComponent(code)}`);
  }
  revalidatePath(`/account/subscription/crypto/${invoiceId}`);
  redirect(`/account/subscription/crypto/${invoiceId}?review=1`);
}
