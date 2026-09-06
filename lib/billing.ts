import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { priceCents, type BillablePlan, type BillingInterval } from "@/lib/plans";
export type { BillablePlan, BillingInterval } from "@/lib/plans";

export interface BillingProvider {
  createCheckout(input: {
    userId: string;
    email: string;
    plan: BillablePlan;
    interval: BillingInterval;
    customerId?: string | null;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string; customerId?: string }>;
  createPortal(input: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
}

export class StripeBillingProvider implements BillingProvider {
  async createCheckout(input: {
    userId: string;
    email: string;
    plan: BillablePlan;
    interval: BillingInterval;
    customerId?: string | null;
    successUrl: string;
    cancelUrl: string;
  }) {
    const stripe = getStripe();
    let customerId = input.customerId ?? undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: input.email, metadata: { welinkbtcUserId: input.userId } });
      customerId = customer.id;
    }
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: input.userId,
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount: priceCents(input.plan, input.interval),
          recurring: { interval: input.interval },
          product_data: { name: `welinkBTC ${input.plan === "max" ? "Max" : "Pro"} · ${input.interval === "year" ? "Annual" : "Monthly"}` }
        },
        quantity: 1
      }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      allow_promotion_codes: true,
      metadata: { userId: input.userId, planKey: input.plan, billingInterval: input.interval, amountCents: String(priceCents(input.plan, input.interval)) },
      subscription_data: { metadata: { userId: input.userId, planKey: input.plan, billingInterval: input.interval, amountCents: String(priceCents(input.plan, input.interval)) } }
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { url: session.url, customerId };
  }

  async createPortal(input: { customerId: string; returnUrl: string }) {
    const session = await getStripe().billingPortal.sessions.create({ customer: input.customerId, return_url: input.returnUrl });
    return { url: session.url };
  }
}

export class ReservedCryptoBillingProvider implements BillingProvider {
  async createCheckout(): Promise<{ url: string }> {
    throw new Error("Crypto billing provider is reserved but not enabled");
  }
  async createPortal(): Promise<{ url: string }> {
    throw new Error("Crypto billing provider is reserved but not enabled");
  }
}

export function billingProvider(): BillingProvider {
  return new StripeBillingProvider();
}

export function stripeSubscriptionPeriod(subscription: Stripe.Subscription) {
  const firstItem = subscription.items.data[0];
  const object = subscription as Stripe.Subscription & { current_period_start?: number; current_period_end?: number };
  return {
    start: object.current_period_start ?? firstItem?.current_period_start,
    end: object.current_period_end ?? firstItem?.current_period_end
  };
}
