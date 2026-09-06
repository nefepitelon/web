import type { EntitlementKey } from "@/lib/entitlements";
import { quotaFor } from "@/lib/entitlements";
import { configuredAccess } from "@/lib/content-gates";
import { getViewer } from "@/lib/membership";

const resources: Record<string, { entitlement: EntitlementKey; payload: Record<string, unknown> }> = {
  "dashboard-advanced": {
    entitlement: "dashboard.advanced",
    payload: { tier: "advanced", metrics: ["lth_cost_basis", "realized_cap_gradient", "etf_derivatives_divergence"] }
  },
  "alpha-full": {
    entitlement: "alpha.full",
    payload: { tier: "full", fields: ["trigger", "confidence", "liquidity", "risk", "explanation"] }
  },
  "alpha-premium": {
    entitlement: "alpha.premium",
    payload: { tier: "premium", fields: ["priority_signal", "strategy_context", "execution_window"] }
  },
  "research-deep": {
    entitlement: "research.deep",
    payload: { tier: "deep", report: "Server-authorized deep research payload" }
  },
  "research-full": {
    entitlement: "research.full",
    payload: { tier: "full", archive: "Server-authorized full research archive" }
  }
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ resource: string }> }
) {
  const { resource } = await params;
  const definition = resources[resource];
  if (!definition) return Response.json({ error: "Not found" }, { status: 404 });
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "Authentication required" }, { status: 401 });
  if (viewer.needsSecondFactor) return Response.json({ error: "Two-factor verification required" }, { status: 401 });
  const access = await configuredAccess(viewer, definition.entitlement);
  if (!access.allowed) {
    return Response.json({ error: "Subscription upgrade required", required: definition.entitlement }, { status: 403 });
  }
  return Response.json(
    { data: definition.payload, quota: quotaFor(viewer), entitlement: definition.entitlement },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
