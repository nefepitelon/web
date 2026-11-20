import { createHash } from "node:crypto";

export const HEDGE_ENGINES = ["lighter", "entropy", "binance", "binance_okx", "binance_hyperliquid", "hyperliquid_lighter", "ondoperps_entropy", "ondoperps_ondoperps"] as const;
export type HedgeEngine = (typeof HEDGE_ENGINES)[number];
export const HEDGE_PAIRS = { lighter: "Arcus × RHC Lighter", entropy: "Entropy × Arcus", binance: "Binance × Lighter Core", binance_okx: "Binance × OKX", binance_hyperliquid: "Binance × Hyperliquid", hyperliquid_lighter: "Hyperliquid × Lighter Core", ondoperps_entropy: "Ondoperps × Entropy", ondoperps_ondoperps: "Ondoperps × Ondoperps" } as const;

export function parseHedgeEngine(value: unknown): HedgeEngine {
  if (!HEDGE_ENGINES.includes(value as HedgeEngine)) throw new Error("请选择有效的对冲引擎");
  return value as HedgeEngine;
}

export function hedgeOwnerId(userId: string) {
  return createHash("sha256").update(`welinkbtc:hedge:v1:${userId}`).digest("hex");
}

export function allowedHedgeEndpoint(method: string, segments: string[]) {
  const endpoint = segments.join("/");
  if (method === "GET") return /^(status|funding|tasks|spreads|capacity|stats|cycles)$/.test(endpoint);
  if (method === "POST") return /^(tasks|preflight|cycle)$/.test(endpoint);
  if (method === "DELETE") return segments.length === 2 && segments[0] === "tasks" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(segments[1]);
  return false;
}

export function safeHedgeServiceUrl(raw: string) {
  const url = new URL(raw);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(local && url.protocol === "http:"))) {
    throw new Error("对冲服务地址必须使用 HTTPS，本机服务可使用 HTTP");
  }
  return url.toString().replace(/\/$/, "");
}
