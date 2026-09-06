import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  stripeClient ??= new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2026-02-25.clover",
    typescript: true
  });
  return stripeClient;
}

export function priceForPlan(plan: "pro" | "max") {
  const price = plan === "pro" ? process.env.STRIPE_PRO_PRICE_ID : process.env.STRIPE_MAX_PRICE_ID;
  if (!price) throw new Error(`Stripe price for ${plan} is not configured`);
  return price;
}
