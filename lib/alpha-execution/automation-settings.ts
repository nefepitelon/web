import { alphaAutomationSettingsSchema } from "./automation-strategy";

const retiredKeys = ["minIndependentSources", "maxAbsReturn15mPct", "maxAbsReturn1hPct", "maxAbsReturn24hPct",
  "maxAbsFundingPct", "minVolumeMultiple", "maxVolumeMultiple"] as const;

/** Only persisted legacy settings are adapted. API drafts still use the strict current schema. */
export function readSavedAutomationSettings(value: unknown) {
  const saved = value && typeof value === "object" && !Array.isArray(value) ? { ...value } as Record<string, unknown> : value;
  if (saved && typeof saved === "object") for (const key of retiredKeys) delete (saved as Record<string, unknown>)[key];
  return alphaAutomationSettingsSchema.parse(saved);
}

export function requiresAutomationStrategySelection(value: unknown) {
  return !value || typeof value !== "object" || Array.isArray(value)
    || !Object.prototype.hasOwnProperty.call(value, "selectedStrategies");
}
