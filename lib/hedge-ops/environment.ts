import { createHash } from "node:crypto";
import schema from "./schema.json";
import type { HedgeEngine } from "./protocol";

export type Environment = Record<string, string>;
export const secretField = (key: string) => key.includes("PRIVATE_KEY") || key.endsWith("_PROXY") || /^ONDOPERPS(?:_[AB])?_API_(KEY_ID|SECRET)$/.test(key) || ["BINANCE_API_KEY", "BINANCE_API_SECRET", "OKX_API_KEY", "OKX_API_SECRET", "OKX_API_PASSPHRASE"].includes(key);
export function defaultEnvironment(engine: HedgeEngine): Environment { return { ...schema.defaults[engine] }; }
export function sharedHedgeResources(engine: string, values: Environment) {
  const venues: Record<string,string[]> = { binance_okx:["binance","okx"], binance_hyperliquid:["binance","hyperliquid"], hyperliquid_lighter:["hyperliquid","lighter"], binance:["binance","lighter"], entropy:["arcus","hyperliquid"], lighter:["arcus","rhc_lighter"], ondoperps_entropy:["ondoperps","hyperliquid"], ondoperps_ondoperps:["ondoperps_a","ondoperps_b"] };
  const fields: Record<string,string[]> = {binance:["BINANCE_API_KEY"],okx:["OKX_API_KEY"],hyperliquid:["HYPERLIQUID_ACCOUNT_ADDRESS","HYPERLIQUID_PRIVATE_KEY","HYPERLIQUID_VAULT_ADDRESS"],lighter:["LIGHTER_ACCOUNT_INDEX"],rhc_lighter:["LIGHTER_ACCOUNT_INDEX"],arcus:["ARCUS_ADDRESS"],ondoperps:["ONDOPERPS_API_KEY_ID"],ondoperps_a:["ONDOPERPS_A_API_KEY_ID"],ondoperps_b:["ONDOPERPS_B_API_KEY_ID"]};
  return (venues[engine] || []).flatMap(venue => fields[venue].filter(key => values[key]).map(key => {
    const ondo = venue.startsWith("ondoperps");
    const identity = ondo ? values[key].trim() : values[key].trim().toLowerCase().replace(/^0x/, "") + (venue === "arcus" ? ":" + (values.ARCUS_ACCOUNT_INDEX || "0") : "");
    // Credential prefixes identify a configuration slot, not a distinct trading account.
    return `${ondo ? "ondoperps" : venue}:${ondo ? "API_KEY_ID" : key}:${createHash("sha256").update(identity).digest("hex")}`;
  }));
}
export function configuredEnvironment(values: Environment, engine: HedgeEngine) {
  if (engine === "ondoperps_entropy") return ["ONDOPERPS_API_KEY_ID", "ONDOPERPS_API_SECRET", "HYPERLIQUID_ACCOUNT_ADDRESS", "HYPERLIQUID_PRIVATE_KEY"].every(key => Boolean(values[key]));
  if (engine === "ondoperps_ondoperps") return ["ONDOPERPS_A_API_KEY_ID", "ONDOPERPS_A_API_SECRET", "ONDOPERPS_B_API_KEY_ID", "ONDOPERPS_B_API_SECRET"].every(key => Boolean(values[key]));
  if (["binance_okx","binance_hyperliquid","hyperliquid_lighter"].includes(engine)) return Object.keys(defaultEnvironment(engine)).filter(k => /API_KEY$|API_SECRET$|API_PASSPHRASE$|PRIVATE_KEY$|ACCOUNT_ADDRESS$|ACCOUNT_INDEX$|KEY_INDEX$/.test(k)).every(k => Boolean(values[k]));
  if (engine === "binance") return ["BINANCE_API_KEY", "BINANCE_API_SECRET", "LIGHTER_ACCOUNT_INDEX", "LIGHTER_API_KEY_INDEX", "LIGHTER_API_PRIVATE_KEY"].every(key => Boolean(values[key]));
  return ["ARCUS_ADDRESS", "ARCUS_API_PRIVATE_KEY", ...(engine === "lighter"
    ? ["LIGHTER_ACCOUNT_INDEX", "LIGHTER_API_KEY_INDEX", "LIGHTER_API_PRIVATE_KEY"]
    : ["HYPERLIQUID_ACCOUNT_ADDRESS", "HYPERLIQUID_PRIVATE_KEY"])].every(key => Boolean(values[key]));
}
export function environmentView(engine: HedgeEngine, values: Environment, running: boolean) {
  return { engine, running, dryRun: values.DRY_RUN !== "false",
    values: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, secretField(key) ? "" : value])),
    fields: Object.entries(values).map(([key, value]) => ({ key,
      label: engine === "ondoperps_entropy" && key === "HYPERLIQUID_ACCOUNT_ADDRESS" ? "Entropy（io）资金主账户公开地址，非 agent" : engine === "ondoperps_entropy" && key === "HYPERLIQUID_VAULT_ADDRESS" ? "Entropy（io）子账户地址（主账户留空）" : engine !== "entropy" && engine !== "ondoperps_entropy" && key === "HYPERLIQUID_ACCOUNT_ADDRESS" ? "Hyperliquid 资金账户公开地址（主账户或子账户，非 agent）" : engine !== "entropy" && engine !== "ondoperps_entropy" && key === "HYPERLIQUID_PRIVATE_KEY" ? "Hyperliquid 已授权专用 API agent 私钥" : (schema.labels as Environment)[key] || key, secret: secretField(key), configured: Boolean(value),
      type: schema.booleans.includes(key) ? "boolean" : key in schema.limits ? "number" : "text",
    })),
  };
}

export function updateEnvironment(engine: HedgeEngine, current: Environment, payload: { values?: unknown; clear?: unknown }) {
  if (!payload.values || typeof payload.values !== "object" || Array.isArray(payload.values)) throw new Error("配置格式无效");
  const values = { ...current };
  const defaults = defaultEnvironment(engine);
  for (const [key, raw] of Object.entries(payload.values)) {
    if (!(key in defaults) || typeof raw !== "string") throw new Error(`不支持的配置字段：${key}`);
    let value = raw.trim();
    if (!value) continue;
    if (value.length > 8192 || value.includes("\0") || (key !== "ARCUS_API_PRIVATE_KEY" && /[\r\n]/.test(value))) throw new Error(`${key} 长度或字符无效`);
    if (key === "OKX_REGION" && !["global","us","eea"].includes(value)) throw new Error("OKX_REGION 仅支持 global / us / eea");
    if (schema.booleans.includes(key) && !["true", "false"].includes(value)) throw new Error(`${key} 只能为 true 或 false`);
    const limits = (schema.limits as Record<string, number[]>)[key];
    if (limits && (!Number.isFinite(Number(value)) || Number(value) < limits[0] || Number(value) > limits[1] || schema.integers.includes(key) && !Number.isSafeInteger(Number(value)))) throw new Error(`${key} 超出允许范围`);
    if (["ARCUS_ADDRESS", "HYPERLIQUID_ACCOUNT_ADDRESS", "HYPERLIQUID_VAULT_ADDRESS"].includes(key) && !/^0x[\da-f]{40}$/i.test(value)) throw new Error(`${key} 必须为公开钱包地址`);
    if (["BINANCE_API_KEY", "BINANCE_API_SECRET"].includes(key) && !/^[A-Za-z0-9]{32,256}$/.test(value)) throw new Error("Binance Key/Secret 需使用 HMAC API 凭据");
    if (/^ONDOPERPS(?:_[AB])?_API_KEY_ID$/.test(key) && !/^ondoKeyId_[^\s\x00-\x1f\x7f]+$/.test(value)) throw new Error(`${key} 请保留 ondoKeyId_ 前缀并填写完整 API Key ID`);
    if (/^ONDOPERPS(?:_[AB])?_API_SECRET$/.test(key) && !/^ondoApiSecret_[^\s\x00-\x1f\x7f]+$/.test(value)) throw new Error(`${key} 请保留 ondoApiSecret_ 前缀并填写完整 API Secret`);
    if (key === "LIGHTER_API_PRIVATE_KEY") {
      if (!/^(0x)?[\da-f]{80}$/i.test(value)) throw new Error("LIGHTER_API_PRIVATE_KEY 必须为 80 位十六进制 API 私钥（可带 0x 前缀）；请使用当前交易实例 Lighter API Keys 页的 Private Key");
      value = value.toLowerCase();
    }
    if (["HYPERLIQUID_PRIVATE_KEY", "ARCUS_API_KEY"].includes(key) && !/^(0x)?[\da-f]{64}$/i.test(value)) throw new Error(`${key} 必须为 64 位十六进制 API 密钥`);
    if (key === "ARCUS_API_PRIVATE_KEY" && !/^(0x)?[\da-f]{64,256}$/i.test(value) && !value.startsWith("-----BEGIN PRIVATE KEY-----\n") && !/^[A-Za-z0-9+/]{64}={0,2}$/.test(value)) throw new Error("Arcus API 私钥格式无效");
    values[key] = value;
  }
  if (payload.clear !== undefined && (!Array.isArray(payload.clear) || payload.clear.some(key => typeof key !== "string" || !(key in defaults)))) throw new Error("清除字段无效");
  for (const key of (payload.clear || []) as string[]) values[key] = secretField(key) ? "" : defaults[key];
  if (engine === "ondoperps_ondoperps" && values.ONDOPERPS_A_API_KEY_ID && values.ONDOPERPS_A_API_KEY_ID === values.ONDOPERPS_B_API_KEY_ID) throw new Error("Ondoperps A / B 必须使用不同账户的 API Key；实盘预检还会核实实际账户身份");
  if (engine === "ondoperps_ondoperps") values.MIN_NET_FUNDING_BPS_H = "0";
  if (Number(values.CLOSE_CORRIDOR_PCT) > Number(values.MIN_CORRIDOR_PCT)) throw new Error("平仓走廊线不能高于开仓门槛");
  if (Number(values.MAKER_WAIT_SECONDS) > 120) throw new Error("服务器模式挂单最长等待为 120 秒；更长等待请使用本地模式");
  return values;
}
