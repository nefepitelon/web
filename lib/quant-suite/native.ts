import "server-only";
import { z } from "zod";
import type { QuantEngineId } from "./catalog";
import { QuantError } from "./gateway";

const httpsUrl = z.string().url().refine(value => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
});
const serviceSchema = z.object({
  userId: z.string().min(1).max(100),
  engine: z.enum(["freqtrade", "jesse", "hummingbot", "octobot"]),
  apiUrl: httpsUrl.optional(), uiUrl: httpsUrl.optional(),
  websocketUrl: z.string().url().refine(value => {const url = new URL(value); return url.protocol === "wss:" && !url.username && !url.password && !url.search && !url.hash;}).optional(),
  username: z.string().max(200).optional(), password: z.string().max(500).optional(),
  bearerToken: z.string().max(4000).optional(),
}).strict();
export type NativeService = z.infer<typeof serviceSchema>;

export function nativeService(userId: string, engine: QuantEngineId): NativeService | undefined {
  const value = process.env.QUANT_NATIVE_SERVICES_JSON;
  if (!value) return undefined;
  try {
    if (value.length > 65536) throw new Error("limit");
    const services = z.array(serviceSchema).max(100).parse(JSON.parse(value));
    const selected = services.filter(service => service.userId === userId && service.engine === engine);
    if (selected.length > 1) throw new Error("ambiguous");
    return selected[0];
  } catch { throw new QuantError("原版服务映射配置无效，请管理员检查。", 503); }
}

// Only fixed, read-only native endpoints can cross this bridge. Engine credentials
// and arbitrary URLs are never accepted from browser input.
const freqtradeReads = new Set(["ping", "version", "show_config", "status", "count", "balance", "profit", "performance", "entries", "exits", "mix_tags", "daily", "weekly", "monthly", "stats", "whitelist", "blacklist", "locks", "logs", "trades", "edge", "pair_candles", "pair_history", "plot_config", "available_pairs", "strategies", "exchange", "exchanges", "pairlists/available", "pairlists/available_pairs", "backtest", "backtest/history", "sysinfo", "health"]);
export function nativeReadPath(engine: QuantEngineId, parts: string[]) {
  if (parts.some(part => !/^[A-Za-z0-9_.-]+$/.test(part) || part === "." || part === "..")) throw new QuantError("原版 API 路径无效。", 400);
  const joined = parts.join("/");
  if (engine === "freqtrade" && joined.startsWith("api/v1/")) {
    const route = joined.slice(7);
    if (freqtradeReads.has(route) || /^trade\/\d+$/.test(route) || /^strategy\/[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(route) || /^backtest\/history\/result$/.test(route)) return joined;
  }
  throw new QuantError("此原版 API 尚未接入本站的权限与执行流程。", 501);
}

function removeSecrets(value: unknown, depth = 0): unknown {
  if (depth > 30) throw new Error("depth");
  if (Array.isArray(value)) return value.map(item => removeSecrets(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !/(?:password|secret|token|private.?key|api.?key|authorization)/i.test(key)).map(([key, item]) => [key, removeSecrets(item, depth + 1)]));
}

export async function nativeRead(service: NativeService, route: string, search: URLSearchParams, fetcher: typeof fetch = fetch) {
  if (!service.apiUrl) throw new QuantError("尚未连接此账户的原版引擎 API。", 503);
  nativeReadPath(service.engine, route.split("/"));
  if (search.toString().length > 4096 || [...search.keys()].some(key => /url|token|password|secret|key|file|path/i.test(key))) throw new QuantError("不支持此原版查询参数。", 400);
  const url = new URL(`${service.apiUrl.replace(/\/$/, "")}/${route}`);
  url.search = search.toString();
  const headers: Record<string, string> = {Accept: "application/json"};
  if (service.bearerToken) headers.Authorization = `Bearer ${service.bearerToken}`;
  else if (service.username && service.password) headers.Authorization = `Basic ${Buffer.from(`${service.username}:${service.password}`).toString("base64")}`;
  try {
    const response = await fetcher(url, {headers, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000)});
    if (!response.ok) throw new QuantError(`原版引擎返回 HTTP ${response.status}。`, response.status === 401 || response.status === 403 ? 502 : 503);
    if (!response.body) throw new Error("empty");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 8 * 1024 * 1024) {await reader.cancel(); throw new Error("limit");}
      chunks.push(value);
    }
    return removeSecrets(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch (error) {
    if (error instanceof QuantError) throw error;
    throw new QuantError("原版引擎未返回有效数据，请检查执行节点连接。", 503);
  }
}
