import "server-only";

import { normalizeTradingProxy } from "@/lib/alpha-execution/credentials";

export const CLASSIC_GRID_VENUES = [
  "extended",
  "risex",
  "decibel",
  "n1",
  "phoenix",
  "phoenix2",
  "nado",
  "popdex"
] as const;

export type ClassicGridVenue = (typeof CLASSIC_GRID_VENUES)[number];
export type ClassicGridEnvironment = Record<string, string>;

const STRATEGY_KEYS = new Set([
  "VENUES", "MARKETS", "TICK_MS", "GRID_LEVERAGE", "GRID_MARGIN_FRAC",
  "GRID_HALF_BAND", "GRID_SKIP_LEVERAGE", "SOFT_RESUME",
  "EXTENDED_LEVERAGE", "EXTENDED_ORDER_GAP_MS", "RISEX_LEVERAGE",
  "RISEX_HALF_BAND", "RISE_ORDER_GAP_MS", "RISE_SKIP_LEVERAGE",
  "DECIBEL_LEVERAGE", "DECIBEL_EQUITY_USD", "DECIBEL_HALF_BAND",
  "N1_LEVERAGE", "N1_EQUITY_USD", "N1_HALF_BAND", "N1_TRADING_ARMED",
  "PHOENIX_ORDER_GAP_MS", "PHOENIX_CU_LIMIT", "PHOENIX_LEVERAGE",
  "PHOENIX_HALF_BAND", "PHOENIX2_LEVERAGE", "PHOENIX2_HALF_BAND",
  "NADO_SUBACCOUNT", "NADO_BTC_PRODUCT_ID", "NADO_ORDER_GAP_MS",
  "NADO_LEVERAGE", "NADO_HALF_BAND", "POPDEX_SYMBOL", "POPDEX_EQUITY_USD",
  "POPDEX_GRID_COUNT", "POPDEX_LEVERAGE", "POPDEX_HALF_BAND", "POPDEX_ORDER_GAP_MS"
]);

const SECRET_KEYS = new Set([
  "EXTENDED_API_KEY", "EXTENDED_STARK_PRIVATE_KEY", "EXTENDED_STARK_PUBLIC_KEY",
  "EXTENDED_VAULT_ID", "EXTENDED_VAULT", "EXTENDED_PROXY", "EXTENDED_USE_PROXY",
  "RISEX_ACCOUNT", "RISEX_SIGNER_KEY", "DECIBEL_ACCOUNT_PRIVATE_KEY",
  "DECIBEL_API_KEY", "DECIBEL_SUBACCOUNT", "DECIBEL_GAS_STATION_API_KEY",
  "N1_KEYPAIR_JSON", "N1_APP_PUBLIC_KEY", "PHOENIX_PRIVATE_KEY",
  "PHOENIX2_PRIVATE_KEY", "NADO_PRIVATE_KEY", "NADO_ADDRESS",
  "POPDEX_PRIVATE_KEY", "POPDEX_ADDRESS", "TELEGRAM_ENABLED",
  "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_IDS"
]);

const ENDPOINT_KEYS = new Set([
  "EXTENDED_API_URL", "RISEX_API_URL", "RISEX_WS_URL", "N1_API_URL",
  "N1_SOLANA_RPC", "PHOENIX_API_URL", "PHOENIX_SOLANA_RPC",
  "PHOENIX2_API_URL", "PHOENIX2_SOLANA_RPC", "NADO_INK_RPC"
]);

const ALLOWED_KEYS = new Set([...STRATEGY_KEYS, ...SECRET_KEYS, ...ENDPOINT_KEYS]);

export const CLASSIC_GRID_DEFAULT_CONFIG = [
  "# 默认模拟盘；不填写任何密钥也可以直接运行",
  "VENUES=extended,risex,decibel,n1,phoenix,phoenix2,nado,popdex",
  "MARKETS=BTC",
  "TICK_MS=15000",
  "GRID_LEVERAGE=30",
  "GRID_MARGIN_FRAC=0.7",
  "GRID_HALF_BAND=3000",
  "GRID_SKIP_LEVERAGE=0",
  "SOFT_RESUME=1"
].join("\n");

function parseNumber(env: ClassicGridEnvironment, key: string, min: number, max: number) {
  if (!env[key]) return;
  const value = Number(env[key]);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${key} 必须是 ${min}–${max} 之间的数字`);
  }
}

function parseJsonArray(value: string, key: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${key} 必须是有效的 JSON 数组`);
  }
  if (!Array.isArray(parsed) || parsed.length < 32 || parsed.length > 128 || parsed.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) {
    throw new Error(`${key} 必须是 32–128 个 0–255 整数组成的 JSON 数组`);
  }
}

function validateEndpoint(env: ClassicGridEnvironment, key: string, protocol: "https:" | "wss:", allowedDomains: string[]) {
  const value = env[key];
  if (!value) return;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${key} 必须是有效的网址`);
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  const allowed = allowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  if (parsed.protocol !== protocol || !allowed || parsed.username || parsed.password || value.length > 2048) {
    throw new Error(`${key} 只允许 ${allowedDomains.join(" / ")} 的官方 ${protocol.slice(0, -1).toUpperCase()} 地址`);
  }
}

function validateChoice(env: ClassicGridEnvironment, key: string, values: string[]) {
  if (env[key] && !values.includes(env[key])) throw new Error(`${key} 只能是：${values.join("、")}`);
}

export function parseClassicGridConfig(source: string, dryRun: boolean) {
  if (typeof source !== "string" || source.length > 65_536) throw new Error("配置内容不能超过 64KB");
  const env: ClassicGridEnvironment = {};

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.length > 4096) throw new Error("单行配置不能超过 4096 个字符");
    const splitAt = line.indexOf("=");
    if (splitAt < 1) throw new Error(`配置行格式错误：${line.slice(0, 32)}`);
    const key = line.slice(0, splitAt).trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || !ALLOWED_KEYS.has(key)) {
      throw new Error(`不允许的配置项：${key}`);
    }
    if (Object.hasOwn(env, key)) throw new Error(`配置项重复：${key}`);
    let value = line.slice(splitAt + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (/\r|\n|\0/.test(value)) throw new Error(`配置项 ${key} 含有非法字符`);
    env[key] = value;
  }

  const venues = String(env.VENUES || CLASSIC_GRID_VENUES.join(","))
    .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (!venues.length || venues.some((venue) => !CLASSIC_GRID_VENUES.includes(venue as ClassicGridVenue))) {
    throw new Error("VENUES 包含不支持的交易所");
  }
  const uniqueVenues = [...new Set(venues)] as ClassicGridVenue[];
  env.VENUES = uniqueVenues.join(",");

  const markets = String(env.MARKETS || "BTC").split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);
  if (!markets.length || markets.length > 8 || markets.some((market) => !/^[A-Z0-9]{2,12}$/.test(market))) {
    throw new Error("MARKETS 格式无效");
  }
  env.MARKETS = [...new Set(markets)].join(",");

  parseNumber(env, "TICK_MS", 5_000, 900_000);
  parseNumber(env, "GRID_LEVERAGE", 1, 100);
  parseNumber(env, "GRID_MARGIN_FRAC", 0.05, 1);
  parseNumber(env, "GRID_HALF_BAND", 100, 1_000_000);
  parseNumber(env, "POPDEX_GRID_COUNT", 2, 500);
  for (const key of [...STRATEGY_KEYS].filter((item) => item.endsWith("_LEVERAGE"))) parseNumber(env, key, 1, 100);
  for (const key of [...STRATEGY_KEYS].filter((item) => item.endsWith("_HALF_BAND"))) parseNumber(env, key, 100, 1_000_000);
  for (const key of [...STRATEGY_KEYS].filter((item) => item.endsWith("_ORDER_GAP_MS") || item === "RISE_ORDER_GAP_MS")) parseNumber(env, key, 0, 120_000);
  for (const key of ["DECIBEL_EQUITY_USD", "N1_EQUITY_USD", "POPDEX_EQUITY_USD"]) parseNumber(env, key, 1, 100_000_000);
  parseNumber(env, "PHOENIX_CU_LIMIT", 100_000, 1_400_000);
  parseNumber(env, "NADO_BTC_PRODUCT_ID", 1, 100_000);

  for (const key of ["GRID_SKIP_LEVERAGE", "SOFT_RESUME", "EXTENDED_USE_PROXY", "RISE_SKIP_LEVERAGE"]) validateChoice(env, key, ["0", "1"]);
  validateChoice(env, "N1_TRADING_ARMED", ["NO", "YES"]);
  validateChoice(env, "TELEGRAM_ENABLED", ["false", "true"]);
  if (env.TELEGRAM_ENABLED === "true" && (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_IDS)) {
    throw new Error("启用 Telegram 时必须填写 TELEGRAM_BOT_TOKEN 和 TELEGRAM_CHAT_IDS");
  }

  validateEndpoint(env, "EXTENDED_API_URL", "https:", ["extended.exchange"]);
  validateEndpoint(env, "RISEX_API_URL", "https:", ["rise.trade"]);
  validateEndpoint(env, "RISEX_WS_URL", "wss:", ["rise.trade"]);
  validateEndpoint(env, "N1_API_URL", "https:", ["n1.xyz"]);
  validateEndpoint(env, "N1_SOLANA_RPC", "https:", ["solana.com"]);
  validateEndpoint(env, "PHOENIX_API_URL", "https:", ["phoenix.trade"]);
  validateEndpoint(env, "PHOENIX_SOLANA_RPC", "https:", ["solana.com"]);
  validateEndpoint(env, "PHOENIX2_API_URL", "https:", ["phoenix.trade"]);
  validateEndpoint(env, "PHOENIX2_SOLANA_RPC", "https:", ["solana.com"]);
  validateEndpoint(env, "NADO_INK_RPC", "https:", ["inkonchain.com"]);

  if (env.EXTENDED_PROXY) env.EXTENDED_PROXY = normalizeTradingProxy(env.EXTENDED_PROXY);
  if (env.N1_KEYPAIR_JSON) parseJsonArray(env.N1_KEYPAIR_JSON, "N1_KEYPAIR_JSON");

  if (!dryRun) {
    const required: Partial<Record<ClassicGridVenue, string[]>> = {
      extended: ["EXTENDED_API_KEY", "EXTENDED_STARK_PRIVATE_KEY"],
      risex: ["RISEX_ACCOUNT", "RISEX_SIGNER_KEY"],
      decibel: ["DECIBEL_ACCOUNT_PRIVATE_KEY", "DECIBEL_API_KEY"],
      n1: ["N1_KEYPAIR_JSON"],
      phoenix: ["PHOENIX_PRIVATE_KEY"],
      phoenix2: ["PHOENIX2_PRIVATE_KEY"],
      nado: ["NADO_PRIVATE_KEY"],
      popdex: ["POPDEX_PRIVATE_KEY"]
    };
    for (const venue of uniqueVenues) {
      const missing = (required[venue] || []).filter((key) => !env[key]);
      if (missing.length) throw new Error(`${venue} 实盘缺少：${missing.join(", ")}`);
    }
    if (uniqueVenues.includes("n1") && env.N1_TRADING_ARMED !== "YES") {
      throw new Error("N1 实盘必须设置 N1_TRADING_ARMED=YES");
    }
  }

  return {
    env,
    summary: {
      venues: uniqueVenues,
      markets: env.MARKETS.split(","),
      tickMs: Number(env.TICK_MS || 15_000),
      leverage: Number(env.GRID_LEVERAGE || 30),
      configuredSecrets: [...SECRET_KEYS].filter((key) => Boolean(env[key])).map((key) => key.replace(/(_PRIVATE)?_KEY|_TOKEN|_JSON|_ACCOUNT|_SECRET/g, "").toLowerCase())
    }
  };
}

export function runtimeEnvironment(config: ClassicGridEnvironment, dryRun: boolean, tempRoot: string) {
  const env: ClassicGridEnvironment = {
    ...config,
    DRY_RUN: dryRun ? "1" : "0",
    LIVE_CONFIRM: dryRun ? "" : "YES",
    DASHBOARD_PORT: "0",
    DASHBOARD_HOST: "127.0.0.1",
    EXTENDED_API_URL: config.EXTENDED_API_URL || "https://api.starknet.extended.exchange",
    RISEX_API_URL: config.RISEX_API_URL || "https://api.rise.trade",
    RISEX_WS_URL: config.RISEX_WS_URL || "wss://ws.rise.trade/ws",
    N1_API_URL: config.N1_API_URL || "https://zo-mainnet.n1.xyz",
    N1_SOLANA_RPC: config.N1_SOLANA_RPC || "https://api.mainnet-beta.solana.com",
    PHOENIX_API_URL: config.PHOENIX_API_URL || "https://perp-api.phoenix.trade",
    PHOENIX_SOLANA_RPC: config.PHOENIX_SOLANA_RPC || "https://api.mainnet-beta.solana.com",
    PHOENIX2_API_URL: config.PHOENIX2_API_URL || config.PHOENIX_API_URL || "https://perp-api.phoenix.trade",
    PHOENIX2_SOLANA_RPC: config.PHOENIX2_SOLANA_RPC || config.PHOENIX_SOLANA_RPC || "https://api.mainnet-beta.solana.com",
    NADO_INK_RPC: config.NADO_INK_RPC || "https://rpc-gel.inkonchain.com"
  };
  if (config.N1_KEYPAIR_JSON) {
    env.N1_KEYPAIR_PATH = `${tempRoot}/secrets/id.json`;
    delete env.N1_KEYPAIR_JSON;
  }
  return env;
}

export const CLASSIC_GRID_RUNTIME_KEYS = new Set([
  ...ALLOWED_KEYS,
  "DRY_RUN", "LIVE_CONFIRM", "DASHBOARD_PORT", "DASHBOARD_HOST",
  "DASHBOARD_AUTH_TOKEN", "EXTENDED_API_URL", "RISEX_API_URL", "RISEX_WS_URL",
  "N1_API_URL", "N1_SOLANA_RPC", "N1_KEYPAIR_PATH", "PHOENIX_API_URL",
  "PHOENIX_SOLANA_RPC", "PHOENIX2_API_URL", "PHOENIX2_SOLANA_RPC",
  "PHOENIX_KEYPAIR_PATH", "PHOENIX2_KEYPAIR_PATH", "NADO_INK_RPC",
  "NADO_KEY_PATH", "POPDEX_KEY_PATH", "RISEX_PROXY"
]);
