export type BillablePlan = "pro" | "max";
export type BillingInterval = "month" | "year";

export const planPricing = {
  free: { month: 0, year: 0 },
  pro: { month: 900, year: 9000 },
  max: { month: 1900, year: 19000 }
} as const;

export function priceCents(plan: BillablePlan, interval: BillingInterval) {
  return planPricing[plan][interval];
}

export function periodLabel(interval: BillingInterval) {
  return interval === "year" ? "year" : "month";
}
