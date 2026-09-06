import type { VenueId } from "../types";
import { DecibelExecutor } from "./decibel";
import { ExtendedExecutor } from "./extended";
import { N1Executor } from "./n1";
import { NadoExecutor } from "./nado";
import { PhoenixExecutor } from "./phoenix";
import { PopdexExecutor } from "./popdex";
import { RisexExecutor } from "./risex";
import type { VenueExecutor } from "./types";

export function createExecutor(venue: VenueId, dryRun: boolean): VenueExecutor {
  switch (venue) {
    case "extended":
      return new ExtendedExecutor(dryRun);
    case "risex":
      return new RisexExecutor(dryRun);
    case "decibel":
      return new DecibelExecutor(dryRun);
    case "n1":
      return new N1Executor(dryRun);
    case "phoenix":
      return new PhoenixExecutor(dryRun, "phoenix");
    case "phoenix2":
      return new PhoenixExecutor(dryRun, "phoenix2");
    case "nado":
      return new NadoExecutor(dryRun);
    case "popdex":
      return new PopdexExecutor(dryRun);
  }
}

export type { VenueExecutor } from "./types";
