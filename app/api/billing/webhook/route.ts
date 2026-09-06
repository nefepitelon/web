import { Prisma, type SubscriptionStatus } from "@prisma/client";
import type Stripe from "stripe";
import { stripeSubscriptionPeriod } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { createSubscriptionReferralRewards } from "@/lib/referrals";

function subscriptionStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  if (status === "active") return "ACTIVE";
  if (status === "trialing") return "TRIALING";
  if (status === "past_due" || status === "unpaid") return "PAST_DUE";
  if (status === "canceled" || status === "paused") return "CANCELED";
  return "INCOMPLETE";
}

async function syncStripeSubscription(subscription: Stripe.Subscription) {
  const userId = subscription.metadata.userId;
  const priceId = subscription.items.data[0]?.price.id;
  const planKey = priceId === process.env.STRIPE_PRO_PRICE_ID
    ? "pro"
    : priceId === process.env.STRIPE_MAX_PRICE_ID
      ? "max"
      : subscription.metadata.planKey;
  if (!userId || !["pro", "max"].includes(planKey)) throw new Error("Subscription metadata is incomplete");
  const billingInterval = subscription.metadata.billingInterval === "year" ? "year" : "month";
  const amountCents = Number(subscription.metadata.amountCents || subscription.items.data[0]?.price.unit_amount || 0);
  const period = stripeSubscriptionPeriod(subscription);
  const status = subscriptionStatus(subscription.status);
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  await prisma.$transaction(async (tx) => {
    await tx.subscription.updateMany({
      where: { userId, providerSubscriptionId: { not: subscription.id }, planKey: { in: ["pro", "max"] } },
      data: { status: "CANCELED", canceledAt: new Date() }
    });
    await tx.subscription.upsert({
      where: { providerSubscriptionId: subscription.id },
      update: {
        providerCustomerId: customerId,
        planKey,
        billingInterval,
        amountCents,
        status,
        currentPeriodStart: period.start ? new Date(period.start * 1000) : null,
        currentPeriodEnd: period.end ? new Date(period.end * 1000) : null,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null
      },
      create: {
        userId,
        provider: "stripe",
        providerCustomerId: customerId,
        providerSubscriptionId: subscription.id,
        planKey,
        billingInterval,
        amountCents,
        status,
        currentPeriodStart: period.start ? new Date(period.start * 1000) : null,
        currentPeriodEnd: period.end ? new Date(period.end * 1000) : null,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null
      }
    });

    const role = await tx.role.upsert({
      where: { key: planKey },
      update: {},
      create: { key: planKey, name: planKey === "max" ? "Max" : "Pro" }
    });
    const planRoles = await tx.role.findMany({ where: { key: { in: ["pro", "max"] } }, select: { id: true } });
    await tx.userRole.deleteMany({ where: { userId, roleId: { in: planRoles.map((item) => item.id) } } });
    if (["ACTIVE", "TRIALING"].includes(status)) {
      await tx.userRole.create({ data: { userId, roleId: role.id, grantedBy: "stripe" } });
    }
  });
}

async function createCommission(invoice: Stripe.Invoice, eventId: string) {
  const invoiceObject = invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null };
  const subscriptionId = typeof invoiceObject.subscription === "string"
    ? invoiceObject.subscription
    : invoiceObject.subscription?.id;
  if (!subscriptionId || invoice.amount_paid <= 0) return;
  const subscription = await prisma.subscription.findUnique({ where: { providerSubscriptionId: subscriptionId } });
  if (!subscription || !["pro", "max"].includes(subscription.planKey)) return;
  await prisma.$transaction(async (tx) => {
    await createSubscriptionReferralRewards(tx, {
      userId: subscription.userId,
      paymentEventId: eventId,
      planKey: subscription.planKey,
      amountCents: invoice.amount_paid,
      currency: invoice.currency
    });
  });
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return Response.json({ error: "Webhook signature is missing" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const body = await request.text();
    event = getStripe().webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return Response.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  const existing = await prisma.webhookEvent.findUnique({ where: { id: event.id } });
  if (existing) return Response.json({ received: true, duplicate: true });

  try {
    if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
      await syncStripeSubscription(event.data.object as Stripe.Subscription);
    }
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (typeof session.subscription === "string") {
        const subscription = await getStripe().subscriptions.retrieve(session.subscription);
        await syncStripeSubscription(subscription);
      }
    }
    if (event.type === "invoice.payment_succeeded") {
      await createCommission(event.data.object as Stripe.Invoice, event.id);
    }

    await prisma.webhookEvent.create({
      data: {
        id: event.id,
        provider: "stripe",
        eventType: event.type,
        payload: JSON.parse(JSON.stringify(event.data.object)) as Prisma.InputJsonValue
      }
    });
    return Response.json({ received: true });
  } catch (caught) {
    if (caught instanceof Prisma.PrismaClientKnownRequestError && caught.code === "P2002") {
      return Response.json({ received: true, duplicate: true });
    }
    return Response.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
