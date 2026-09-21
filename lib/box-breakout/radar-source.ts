import "server-only";
import { buildAlphaScanSnapshot } from "@/api/alpha-scan.js";
import { getBinanceAlphaLists } from "@/api/binance-alpha-lists.js";
import type { CryptoScanMode, Stock } from "./types";

export type RadarScanMode = Exclude<CryptoScanMode, "crypto" | "crypto-risk-pool">;
export const RADAR_SOURCE_LABELS: Record<RadarScanMode, string> = {
  "crypto-radar": "α-RadarTP 异动排行榜",
  "crypto-mainstream": "α-RadarTP 热门精选主流",
  "crypto-alpha-market-cap": "Binance Skills Hub Alpha 小市值",
  "crypto-alpha-open-interest": "Binance Skills Hub Alpha 持仓量",
};
export interface RadarUniverse { universe: Stock[]; sourceCount: number; skippedSymbols: string[]; scannedAt: string }
const asObject = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Preserve source rank, never replace a missing radar list with the gainers universe. */
export function normalizeRadarUniverse(snapshot: unknown, mode: RadarScanMode, contracts: Stock[], now = Date.now()): RadarUniverse {
  const data = asObject(snapshot);
  const scannedAt = typeof data.scannedAt === "string" ? data.scannedAt : "";
  const age = now - Date.parse(scannedAt);
  if (!Number.isFinite(age) || age < -60_000 || age > 2 * 60 * 60_000 + 5 * 60_000) throw new Error("α-RadarTP 行情源快照缺失或过期，请稍后重试");
  const items = mode === "crypto-radar" ? data.items : data.featuredItems;
  if (!Array.isArray(items) || !items.length || items.length > 200) throw new Error(`${RADAR_SOURCE_LABELS[mode]}行情源未返回有效榜单，请稍后重试`);
  const supported = new Set(contracts.map(stock => stock.symbol));
  const seen = new Set<string>();
  const universe: Stock[] = [], skippedSymbols: string[] = [];
  for (let index = 0; index < items.length; index++) {
    const row = asObject(items[index]);
    const raw = typeof row.symbol === "string" ? row.symbol.trim().toUpperCase() : "";
    if (!/^[A-Z0-9]{2,24}(?:USDT)?$/.test(raw)) throw new Error("α-RadarTP 行情源包含无效标的，扫描已停止");
    const symbol = raw.endsWith("USDT") ? raw : `${raw}USDT`;
    if (!/^[A-Z0-9]{2,24}USDT$/.test(symbol)) throw new Error("α-RadarTP 行情源包含无效交易对，扫描已停止");
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    if (row.market === "spot" || !supported.has(symbol)) { skippedSymbols.push(symbol); continue; }
    universe.push({ symbol, name: typeof row.name === "string" && row.name.trim() ? row.name.trim().slice(0, 80) : symbol.replace(/USDT$/, " / USDT"), sourceRank: index + 1 });
  }
  if (!universe.length) throw new Error(`${RADAR_SOURCE_LABELS[mode]}行情源暂无可验证的 USDT 永续标的，旧结果已保留`);
  return { universe, sourceCount: seen.size, skippedSymbols, scannedAt };
}

let pending: Promise<unknown> | null = null;
let cached: { until: number; snapshot: unknown } | null = null;
async function radarSnapshot(): Promise<unknown> {
  if (cached && cached.until > Date.now()) return cached.snapshot;
  if (pending) return pending;
  pending = buildAlphaScanSnapshot().then(snapshot => {
    cached = { snapshot, until: Date.now() + 30_000 };
    return snapshot;
  }).catch(() => { throw new Error("α-RadarTP 行情源暂不可用，请稍后重试；不会改用涨幅榜代替"); }).finally(() => { pending = null; });
  return pending;
}

export async function fetchRadarUniverse(mode: RadarScanMode, contracts: Stock[]): Promise<RadarUniverse> {
  if (mode === "crypto-alpha-market-cap" || mode === "crypto-alpha-open-interest") {
    const payload = asObject(await getBinanceAlphaLists());
    const scannedAt = typeof payload.refreshedAt === "string" ? payload.refreshedAt : "";
    const age = Date.now() - Date.parse(scannedAt);
    if (!Number.isFinite(age) || age < -60_000 || age > 2 * 60 * 60_000 + 5 * 60_000) {
      throw new Error("Binance Skills Hub Alpha 清单缺失或过期，请稍后重试");
    }
    const items = mode === "crypto-alpha-market-cap" ? payload.marketCapItems : payload.openInterestItems;
    if (!Array.isArray(items) || !items.length || items.length > 100) {
      throw new Error(`${RADAR_SOURCE_LABELS[mode]}未返回有效榜单，请稍后重试`);
    }
    const supported = new Set(contracts.map(stock => stock.symbol));
    const seen = new Set<string>();
    const universe: Stock[] = [], skippedSymbols: string[] = [];
    for (let index = 0; index < items.length; index++) {
      const row = asObject(items[index]);
      const raw = typeof row.futureSymbol === "string" ? row.futureSymbol.trim().toUpperCase() : "";
      if (!/^[A-Z0-9]{2,24}USDT$/.test(raw)) throw new Error("Binance Skills Hub Alpha 清单包含无效交易对，扫描已停止");
      if (seen.has(raw)) continue;
      seen.add(raw);
      if (!supported.has(raw)) { skippedSymbols.push(raw); continue; }
      const base = typeof row.symbol === "string" && row.symbol.trim() ? row.symbol.trim().toUpperCase() : raw.replace(/USDT$/, "");
      universe.push({ symbol: raw, name: base, sourceRank: index + 1 });
    }
    if (!universe.length) throw new Error(`${RADAR_SOURCE_LABELS[mode]}暂无可验证的 USDT 永续标的，旧结果已保留`);
    return { universe, sourceCount: seen.size, skippedSymbols, scannedAt };
  }
  return normalizeRadarUniverse(await radarSnapshot(), mode, contracts);
}
