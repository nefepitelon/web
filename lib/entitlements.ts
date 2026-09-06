export type PlanKey = "guest" | "free" | "pro" | "max";
export type RoleKey = "guest" | "free" | "pro" | "max" | "operator" | "admin";

export type EntitlementKey =
  | "public.read"
  | "research.summary"
  | "dashboard.basic"
  | "dashboard.advanced"
  | "alpha.partial"
  | "alpha.full"
  | "alpha.premium"
  | "ai.low"
  | "ai.standard"
  | "ai.priority"
  | "export.csv"
  | "api.keys"
  | "referrals.read"
  | "billing.manage"
  | "research.deep"
  | "research.full"
  | "grid.ops"
  | "grid.classic"
  | "toolbox.read"
  | "toolbox.export"
  | "admin.access";

const entitlementPlans: Record<EntitlementKey, PlanKey | "admin"> = {
  "public.read": "guest",
  "research.summary": "guest",
  "dashboard.basic": "free",
  "dashboard.advanced": "pro",
  "alpha.partial": "free",
  "alpha.full": "pro",
  "alpha.premium": "max",
  "ai.low": "free",
  "ai.standard": "pro",
  "ai.priority": "max",
  "export.csv": "pro",
  "api.keys": "max",
  "referrals.read": "free",
  "billing.manage": "free",
  "research.deep": "pro",
  "research.full": "max",
  "grid.ops": "max",
  "grid.classic": "max",
  "toolbox.read": "free",
  "toolbox.export": "pro",
  "admin.access": "admin"
};

const planRank: Record<PlanKey, number> = { guest: -1, free: 0, pro: 1, max: 2 };

export function minimumPlanFor(entitlement: EntitlementKey) {
  return entitlementPlans[entitlement];
}

export function hasEntitlement(
  viewer: { plan: PlanKey; role: RoleKey } | null,
  entitlement: EntitlementKey
) {
  const required = entitlementPlans[entitlement];
  if (viewer?.role === "admin") return true;
  if (required === "admin") return false;
  const plan = viewer?.plan ?? "guest";
  return planRank[plan] >= planRank[required];
}

export function allEntitlements(viewer: { plan: PlanKey; role: RoleKey } | null) {
  return (Object.keys(entitlementPlans) as EntitlementKey[]).filter((key) =>
    hasEntitlement(viewer, key)
  );
}

export function quotaFor(viewer: { plan: PlanKey; role: RoleKey } | null) {
  if (viewer?.role === "admin") return { aiResearchMonthly: 1000, priority: true };
  if (viewer?.plan === "max") return { aiResearchMonthly: 120, priority: true };
  if (viewer?.plan === "pro") return { aiResearchMonthly: 35, priority: false };
  if (viewer?.plan === "free") return { aiResearchMonthly: 3, priority: false };
  return { aiResearchMonthly: 0, priority: false };
}

export function comparePlans(left: PlanKey, right: PlanKey) {
  return planRank[left] - planRank[right];
}
