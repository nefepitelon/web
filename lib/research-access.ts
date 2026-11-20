import "server-only";
import type { Viewer } from "@/lib/membership";

export function canManageResearch(viewer: Viewer | null | undefined) {
  return Boolean(viewer && viewer.status === "ACTIVE" && viewer.role === "admin" && viewer.twoFactorEnabled && viewer.twoFactorPassed && !viewer.needsSecondFactor);
}

export function canReadResearch(access: "PUBLIC" | "FREE" | "PRO" | "MAX", viewer: Viewer | null | undefined) {
  if (access === "PUBLIC") return true;
  if (!viewer || viewer.status !== "ACTIVE" || viewer.needsSecondFactor) return false;
  if (canManageResearch(viewer) || access === "FREE") return true;
  if (access === "PRO") return viewer.plan === "pro" || viewer.plan === "max";
  return viewer.plan === "max";
}
