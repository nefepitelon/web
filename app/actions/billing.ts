"use server";

import { redirect } from "next/navigation";
import { billingProvider } from "@/lib/billing";
import type { BillablePlan, BillingInterval } from "@/lib/plans";
import { requireViewer } from "@/lib/membership";
import { prisma } from "@/lib/prisma";

export async function createCheckoutAction(plan: BillablePlan, interval: BillingInterval) {
  if (!["pro", "max"].includes(plan)) throw new Error("Invalid plan");
  if (!["month", "year"].includes(interval)) throw new Error("Invalid billing interval");
  const viewer = await requireViewer("/account/subscription");
  const existing = await prisma.subscription.findFirst({
    where: { userId: viewer.id, providerCustomerId: { not: null } },
    orderBy: { updatedAt: "desc" }
  });
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (
    existing?.providerSubscriptionId &&
    ["ACTIVE", "TRIALING", "PAST_DUE"].includes(existing.status)
  ) {
    if (existing.planKey === plan && existing.billingInterval === interval && ["ACTIVE", "TRIALING"].includes(existing.status)) {
      redirect(`${origin}/account/subscription?checkout=current`);
    }
    redirect(`${origin}/account/subscription?checkout=manage_existing`);
  }

  const session = await billingProvider().createCheckout({
    userId: viewer.id,
    email: viewer.email,
    plan,
    interval,
    customerId: existing?.providerCustomerId,
    successUrl: `${origin}/account/subscription?checkout=success`,
    cancelUrl: `${origin}/account/subscription?checkout=canceled`
  });
  if (!existing?.providerCustomerId && session.customerId) {
    await prisma.subscription.updateMany({
      where: { userId: viewer.id, planKey: "free" },
      data: { providerCustomerId: session.customerId }
    });
  }
  redirect(session.url);
}

export async function openBillingPortalAction() {
  const viewer = await requireViewer("/account/subscription");
  const subscription = await prisma.subscription.findFirst({
    where: { userId: viewer.id, providerCustomerId: { not: null } },
    orderBy: { updatedAt: "desc" }
  });
  if (!subscription?.providerCustomerId) throw new Error("No billing customer exists for this account");
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const portal = await billingProvider().createPortal({ customerId: subscription.providerCustomerId, returnUrl: `${origin}/account/subscription` });
  redirect(portal.url);
}
