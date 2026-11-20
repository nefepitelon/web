// Public, read-only perpetual market data. No account, authentication or order endpoint is used.
const INFO_URL = "https://api.hyperliquid.xyz/info";
const DOCS_URL = "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals";
const REFRESH_MS = 4 * 60 * 60_000;
const RETRY_MS = 5 * 60_000;
const MAX_STALE_MS = 24 * 60 * 60_000;
const TIMEOUT_MS = 10_000;

const CRYPTO_NAMES = {
  BTC: "Bitcoin", ETH: "Ethereum", HYPE: "Hyperliquid", SOL: "Solana", XRP: "XRP", BNB: "BNB",
  DOGE: "Dogecoin", ZEC: "Zcash", SUI: "Sui", LINK: "Chainlink", AVAX: "Avalanche", ADA: "Cardano",
  LTC: "Litecoin", BCH: "Bitcoin Cash", AAVE: "Aave", UNI: "Uniswap", DOT: "Polkadot", NEAR: "NEAR",
  TAO: "Bittensor", TON: "Toncoin", TRX: "TRON", ENA: "Ethena", WLD: "Worldcoin", FET: "Fetch.ai"
};
// Classify only known symbols. A newly listed currency or synthetic index must not silently become a stock.
const STOCK_NAMES = {
  TSLA: "Tesla", NVDA: "NVIDIA", HOOD: "Robinhood", INTC: "Intel", PLTR: "Palantir", COIN: "Coinbase",
  META: "Meta", AAPL: "Apple", MSFT: "Microsoft", ORCL: "Oracle", GOOGL: "Alphabet", AMZN: "Amazon",
  AMD: "AMD", MU: "Micron", SNDK: "SanDisk", MSTR: "Strategy", CRCL: "Circle", NFLX: "Netflix",
  COST: "Costco", LLY: "Eli Lilly", SKHX: "SK hynix", SKHY: "SK hynix", TSM: "TSMC", RIVN: "Rivian",
  BABA: "Alibaba", SMSN: "Samsung", USAR: "USA Rare Earth", CRWV: "CoreWeave", GME: "GameStop",
  SOFTBANK: "SoftBank", HYUNDAI: "Hyundai", KIOXIA: "Kioxia", HIMS: "Hims & Hers", DKNG: "DraftKings",
  LITE: "Lumentum", BX: "Blackstone", MRVL: "Marvell", RKLB: "Rocket Lab", ZM: "Zoom", EBAY: "eBay",
  ARM: "Arm", SPCX: "SpaceX synthetic perpetual", ASML: "ASML", MINIMAX: "MiniMax", DELL: "Dell",
  IBM: "IBM", AVGO: "Broadcom", NOW: "ServiceNow", NBIS: "Nebius", WDC: "Western Digital",
  NOK: "Nokia", BE: "Bloom Energy", ZHIPU: "Zhipu", QCOM: "Qualcomm", STRC: "Strategy STRC",
  AMAT: "Applied Materials", GEV: "GE Vernova", UNITREE: "Unitree", IREN: "IREN", NET: "Cloudflare",
  CRWD: "CrowdStrike", RDDT: "Reddit", AAOI: "Applied Optoelectronics", MRNA: "Moderna", SHEIN: "Shein synthetic perpetual",
  BMNR: "BitMine", CVX: "Chevron", LRCX: "Lam Research", UMC: "UMC", TWST: "Twist Bioscience",
  GLW: "Corning", RELIANCE: "Reliance", TTWO: "Take-Two", ANT: "Ant synthetic perpetual", ICE: "Intercontinental Exchange"
};
const INDEX_NAMES = {
  XYZ100: "XYZ100 index perpetual", SP500: "S&P 500 index perpetual", KR200: "Korea 200 index perpetual",
  JP225: "Japan 225 index perpetual", NIFTY: "Nifty index perpetual", EWY: "iShares South Korea ETF perpetual",
  EWJ: "iShares Japan ETF perpetual", EWZ: "iShares Brazil ETF perpetual", EWT: "iShares Taiwan ETF perpetual",
  URNM: "Uranium miners ETF perpetual", XLE: "Energy sector ETF perpetual", SMH: "Semiconductor ETF perpetual",
  KORU: "Korea leveraged ETF perpetual", SOXL: "Semiconductor leveraged ETF perpetual", MAGS: "Magnificent Seven ETF perpetual",
  XBI: "Biotech ETF perpetual", TLT: "Treasury bond ETF perpetual"
};
const COMMODITY_NAMES = {
  GOLD: "Gold", SILVER: "Silver", CL: "WTI crude oil", BRENTOIL: "Brent crude oil", COPPER: "Copper",
  NATGAS: "Natural gas", PLATINUM: "Platinum", PALLADIUM: "Palladium", DRAM: "DRAM synthetic commodity", HO: "Heating oil"
};
const GROUPS = [
  { id: "crypto", name: "Crypto", limit: 24 },
  { id: "stocks", name: "Stocks", limit: 28 },
  { id: "indices", name: "Indices / ETFs", limit: 12 },
  { id: "commodities", name: "Commodities", limit: 10 }
];

function finiteNonnegative(value) {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1e18 ? number : null;
}

function classify(symbol, dex) {
  if (dex === "" && Object.hasOwn(CRYPTO_NAMES, symbol)) return { group: "crypto", name: CRYPTO_NAMES[symbol] };
  if (dex !== "xyz") return null;
  for (const [group, names] of [["stocks", STOCK_NAMES], ["indices", INDEX_NAMES], ["commodities", COMMODITY_NAMES]]) {
    if (Object.hasOwn(names, symbol)) return { group, name: names[symbol] };
  }
  return null;
}

function parseMarketResponse(payload, dex) {
  if (!Array.isArray(payload) || payload.length !== 2 || !Array.isArray(payload[0]?.universe)
    || !Array.isArray(payload[1]) || payload[0].universe.length !== payload[1].length
    || payload[0].universe.length > 5000) throw new Error("Invalid public market response");
  const seen = new Set();
  const assets = [];
  for (let index = 0; index < payload[0].universe.length; index += 1) {
    const meta = payload[0].universe[index];
    if (!meta || meta.isDelisted === true || typeof meta.name !== "string") continue;
    const prefix = dex ? `${dex}:` : "";
    if (prefix && !meta.name.startsWith(prefix)) continue;
    const symbol = prefix ? meta.name.slice(prefix.length) : meta.name;
    const definition = classify(symbol, dex);
    if (!definition || seen.has(meta.name)) continue;
    const context = payload[1][index];
    const mark = finiteNonnegative(context?.markPx);
    const previous = finiteNonnegative(context?.prevDayPx);
    if (!(mark > 0) || !(previous > 0)) continue;
    const change24hPct = (mark / previous - 1) * 100;
    if (!Number.isFinite(change24hPct)) continue;
    const quantity = finiteNonnegative(context?.openInterest);
    const oi = quantity === null ? null : finiteNonnegative(quantity * mark);
    seen.add(meta.name);
    assets.push({
      id: meta.name, symbol, name: definition.name, group: definition.group, price: mark, change24hPct,
      volume24hUsd: finiteNonnegative(context?.dayNtlVlm), openInterestUsd: oi, market: "perpetual", dex
    });
  }
  if (!assets.length) throw new Error("No valid public market observations");
  return assets;
}

async function fetchMarkets(fetchImpl, dex, timeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    // The bound includes decoding; do not leave a malformed or stalled public body running indefinitely.
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(INFO_URL, {
          method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ type: "metaAndAssetCtxs", dex }), cache: "no-store", redirect: "error", signal: controller.signal
        });
        if (!response.ok) throw new Error(`Public market HTTP ${response.status}`);
        return parseMarketResponse(await response.json(), dex);
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("Public market timeout")); }, timeoutMs); })
    ]);
  } finally { clearTimeout(timer); }
}

function createMarketHeatmapService({ fetchImpl = (...args) => fetch(...args), now = Date.now, timeoutMs = TIMEOUT_MS } = {}) {
  const snapshots = new Map();
  let pending;

  async function read(dex) {
    const entry = snapshots.get(dex) || {};
    snapshots.set(dex, entry);
    const clock = now();
    const age = entry.asOf === undefined ? Infinity : clock - entry.asOf;
    if (age >= 0 && age < REFRESH_MS) return { dex, assets: entry.assets, asOf: entry.asOf, status: "fresh" };
    if (entry.attemptedAt === undefined || clock - entry.attemptedAt >= RETRY_MS) {
      entry.attemptedAt = clock;
      try {
        const assets = await fetchMarkets(fetchImpl, dex, timeoutMs);
        entry.assets = assets;
        entry.asOf = now();
      } catch { /* A failed source may reuse only its own bounded, dated public snapshot. */ }
    }
    const retainedAge = entry.asOf === undefined ? Infinity : now() - entry.asOf;
    const retained = entry.assets && retainedAge >= 0 && retainedAge < MAX_STALE_MS;
    return { dex, assets: retained ? entry.assets : [], asOf: retained ? entry.asOf : null,
      status: !retained ? "unavailable" : retainedAge >= REFRESH_MS ? "stale" : "fresh" };
  }

  async function build() {
    const results = await Promise.all([read(""), read("xyz")]);
    const observed = results.filter(result => result.assets.length);
    if (!observed.length) throw new Error("Public market data unavailable");
    const clock = now();
    const stale = results.some(result => result.status !== "fresh");
    const asOf = Math.min(...observed.map(result => result.asOf));
    const nextRefresh = stale ? clock + RETRY_MS : Math.min(...observed.map(result => result.asOf + REFRESH_MS));
    const allAssets = results.flatMap(result => result.assets.map(asset => ({
      ...asset, asOf: new Date(result.asOf).toISOString(), stale: result.status !== "fresh"
    })));
    return {
      ok: true, schema: 1, asOf: new Date(asOf).toISOString(), nextRefreshAt: new Date(nextRefresh).toISOString(),
      refreshSeconds: REFRESH_MS / 1000, stale, partial: results.some(result => result.status === "unavailable"),
      source: { name: "Hyperliquid / trade[XYZ] public perpetual markets", url: INFO_URL, docsUrl: DOCS_URL, marketType: "perpetual-derivatives" },
      sources: results.map(result => ({ id: result.dex ? "hyperliquid-xyz" : "hyperliquid", dex: result.dex,
        asOf: result.asOf === null ? null : new Date(result.asOf).toISOString(), status: result.status })),
      groups: GROUPS.map(group => ({ id: group.id, name: group.name,
        assets: allAssets.filter(asset => asset.group === group.id).sort((a, b) => (b.volume24hUsd ?? -1) - (a.volume24hUsd ?? -1)
          || a.id.localeCompare(b.id)).slice(0, group.limit).map(({ group: _group, ...asset }) => asset) })),
      methodology: "Public perpetual mark prices, not stock exchange spot quotes. Change = (markPx / prevDayPx - 1) * 100; volume = dayNtlVlm (USD notional); open interest = openInterest * markPx (USD notional). Missing metrics stay null; zero stays zero. Selected known markets are ranked within each group by 24-hour notional volume. As-of timestamps record API collection time because this endpoint supplies no per-market observation timestamp. Refresh on demand every four hours; unavailable sources retry after five minutes and dated fallback expires after 24 hours."
    };
  }

  return {
    getSnapshot() {
      if (!pending) {
        pending = build().finally(() => { pending = undefined; });
      }
      return pending;
    }
  };
}

function service() {
  return globalThis.__welinkMarketHeatmapV1 ||= createMarketHeatmapService();
}

export default async function handler(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET, OPTIONS");
    response.setHeader("Cache-Control", "no-store");
    return response.status(405).json({ ok: false, error: "Method not allowed" });
  }
  try {
    const payload = await service().getSnapshot();
    // A CDN hit cannot silently extend an old warm-instance snapshot by another four hours.
    const seconds = Math.max(1, Math.min(payload.stale ? RETRY_MS / 1000 : REFRESH_MS / 1000,
      Math.floor((Date.parse(payload.nextRefreshAt) - Date.now()) / 1000)));
    response.setHeader("Cache-Control", `public, max-age=0, s-maxage=${seconds}`);
    response.setHeader("X-Welink-Cache", payload.stale ? "STALE" : "FRESH");
    return response.status(200).json(payload);
  } catch {
    response.setHeader("Cache-Control", "no-store");
    return response.status(502).json({ ok: false, error: "Public market heatmap temporarily unavailable" });
  }
}

export { INFO_URL, REFRESH_MS, RETRY_MS, MAX_STALE_MS, finiteNonnegative, parseMarketResponse, createMarketHeatmapService };
