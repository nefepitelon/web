import type { ApplyResult, Intent, VenueId, VenueSnapshot } from "../types";

export type { ApplyResult } from "../types";

export type VenueExecutor = {
  readonly id: VenueId;
  connect(): Promise<void>;
  disconnect(): void;
  snapshot(market: string): Promise<VenueSnapshot>;
  apply(intents: Intent[]): Promise<ApplyResult>;
  cancelAll(market: string): Promise<void>;
  /** 尽力市价/IOC 减仓清仓；无仓则 no-op */
  closePosition(market: string): Promise<void>;
};

export function dryApply(venue: VenueId, intents: Intent[]): ApplyResult {
  const placed = intents.filter((i) => i.type === "place").length;
  const cancelled = intents.filter((i) => i.type === "cancel").length;
  console.log(`[${venue}:dry] apply place=${placed} cancel=${cancelled}`);
  return { placed, cancelled, failed: 0, errors: [] };
}
