import "server-only";
import { decryptTradingSecret, encryptTradingSecret, maskProxy, normalizeTradingProxy } from "@/lib/alpha-execution/credentials";
import { ALL_EXCHANGE_INSTANCE_MANIFEST } from "../../grid-ops/src/exchange/instances.js";
import { createEnvView, validateEnvUpdate } from "../../grid-ops/src/env-config.js";

type EnvMap = Record<string, string>;

const LOCAL_ONLY_KEYS = new Set([
  "PHOENIX_KEYPAIR_PATH", "NADO_KEY_PATH", "ARCUS_API_PRIVATE_KEY_FILE", "LIGHTER_API_PRIVATE_KEY_FILE", "LIGHTER_PYTHON",
  "PHOENIX_KEYPAIR_PATH_2", "NADO_KEY_PATH_2", "ARCUS_API_PRIVATE_KEY_FILE_2", "LIGHTER_API_PRIVATE_KEY_FILE_2",
  "PHOENIX_KEYPAIR_PATH_3", "NADO_KEY_PATH_3", "ARCUS_API_PRIVATE_KEY_FILE_3", "LIGHTER_API_PRIVATE_KEY_FILE_3",
]);

const ENDPOINT_KEYS = new Map<string, Set<string>>();
for (const definition of ALL_EXCHANGE_INSTANCE_MANIFEST) {
  const base = ALL_EXCHANGE_INSTANCE_MANIFEST.find((item: any) => item.key === definition.baseKey && item.instanceIndex === 1) || definition;
  for (const field of definition.fields || []) {
    if (field.type !== "url" && field.type !== "wsurl") continue;
    const values = ENDPOINT_KEYS.get(field.env) || new Set<string>();
    if (field.default) values.add(String(field.default).replace(/\/$/, ""));
    const baseField = base.fields?.find((item: any) => item.prop === field.prop);
    if (baseField?.default) values.add(String(baseField.default).replace(/\/$/, ""));
    for (const defaults of Object.values(definition.defaults || {}) as Array<Record<string, unknown>>) {
      if (defaults?.[field.prop]) values.add(String(defaults[field.prop]).replace(/\/$/, ""));
    }
    ENDPOINT_KEYS.set(field.env, values);
  }
}

export function defaultHostedGridOpsEnvironment(): EnvMap {
  const values = { ...(createEnvView({}).values as EnvMap) };
  for (const key of LOCAL_ONLY_KEYS) values[key] = "";
  values.GLOBAL_PROXY = "direct";
  return values;
}

export function decryptHostedGridOpsEnvironment(encrypted: string): EnvMap {
  const parsed = JSON.parse(decryptTradingSecret(encrypted));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("托管配置格式无效");
  return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value ?? "")])) as EnvMap;
}

function validateHostedEndpoints(values: EnvMap) {
  for (const [key, allowed] of ENDPOINT_KEYS) {
    const value = String(values[key] || "").replace(/\/$/, "");
    if (value && !allowed.has(value)) {
      throw new Error(`${key} 在线上托管模式只能使用平台内置的交易所官方地址`);
    }
  }
}

export function updateHostedGridOpsEnvironment(current: EnvMap, input: unknown) {
  const body = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const { updates, merged } = validateEnvUpdate(body, current) as { updates: EnvMap; merged: EnvMap };
  for (const key of LOCAL_ONLY_KEYS) {
    if (String(updates[key] || "").trim()) {
      throw new Error(`${key} 是本机文件路径；线上托管请改填对应的直接私钥字段`);
    }
    merged[key] = "";
  }
  validateHostedEndpoints(merged);
  return { updates, merged };
}

export function hostedGridOpsSummary(values: EnvMap) {
  const manifest = ALL_EXCHANGE_INSTANCE_MANIFEST.filter((definition: any) =>
    definition.instanceIndex === 1 || String(values.EXCHANGE_INSTANCES || "").split(",").includes(definition.key)
  );
  const live = manifest.filter((definition: any) => String(values[definition.modeEnv] || "paper").toLowerCase() === "live");
  return {
    exchangeCount: manifest.length,
    exchanges: manifest.map((definition: any) => definition.key),
    liveExchanges: live.map((definition: any) => definition.key),
    paperExchanges: manifest.filter((definition: any) => !live.includes(definition)).map((definition: any) => definition.key),
    hasLive: live.length > 0,
    proxy: maskProxy(values.GLOBAL_PROXY),
  };
}

export function normalizeHostedGridOpsProxy(value: unknown) {
  return normalizeTradingProxy(String(value ?? ""));
}

export function encryptHostedGridOpsEnvironment(values: EnvMap) {
  return encryptTradingSecret(JSON.stringify(values));
}

export function hostedGridOpsEnvView(values: EnvMap) {
  return { ...createEnvView(values), hosted: true, message: "配置已使用 AES-256-GCM 加密保存到线上托管执行器。" };
}

export function hostedGridOpsHasLive(values: EnvMap) {
  return hostedGridOpsSummary(values).hasLive;
}
