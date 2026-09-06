import type { EntitlementKey, PlanKey, RoleKey } from "@/lib/entitlements";
import { comparePlans, hasEntitlement, minimumPlanFor } from "@/lib/entitlements";
import type { Viewer } from "@/lib/membership";
import { isDatabaseConfigured, prisma } from "@/lib/prisma";

export async function configuredAccess(
  viewer: Pick<Viewer, "plan" | "role"> | null,
  key: EntitlementKey
) {
  const fallback = hasEntitlement(viewer, key);
  if (!isDatabaseConfigured()) return { allowed: fallback, previewLimit: null, guestPreview: false, enabled: true };
  const gate = await prisma.contentGate.findUnique({ where: { key } });
  if (!gate) return { allowed: fallback, previewLimit: null, guestPreview: false, enabled: true };
  if (viewer?.role === "admin") return { allowed: true, previewLimit: gate.previewLimit, guestPreview: gate.guestPreview, enabled: gate.enabled };
  if (!gate.enabled) return { allowed: false, previewLimit: gate.previewLimit, guestPreview: gate.guestPreview, enabled: false };
  const minimum = (["guest", "free", "pro", "max"].includes(gate.minimumPlan) ? gate.minimumPlan : minimumPlanFor(key)) as PlanKey | "admin";
  const plan = viewer?.plan ?? "guest";
  const allowed = minimum !== "admin" && comparePlans(plan, minimum) >= 0;
  return { allowed, previewLimit: gate.previewLimit, guestPreview: gate.guestPreview, enabled: gate.enabled };
}

export function viewerTier(viewer: Pick<Viewer, "plan" | "role"> | null): { plan: PlanKey; role: RoleKey } | null {
  return viewer ? { plan: viewer.plan, role: viewer.role } : null;
}
