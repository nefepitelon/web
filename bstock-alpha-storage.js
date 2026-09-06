(() => {
  const root = typeof window === "object" ? window : globalThis;
  const pendingOrderStorageKey = "bstock-alpha-pending-order";
  const studioJobStorageKey = "bstock-alpha-studio-job";
  const publicDataCacheKey = "bstock-alpha-public-data-v2";
  const disposableCacheKeys = [publicDataCacheKey, "bstock-alpha-public-data-v1"];
  const maxPendingOrderCharacters = 2_048;
  const maxStudioJobCharacters = 1_024;
  const maxPublicCacheCharacters = 350_000;
  let memoryPendingOrder = null;
  let memoryStudioJob = null;

  const pendingTextFields = [
    "orderId", "clientOrderId", "symbol", "side", "fromToken", "toToken",
    "fromSymbol", "toSymbol", "fromAmount", "toAmount", "walletMode", "walletAddress"
  ];
  const marketFields = [
    "deliveryMode", "eligibilityEffectiveUntil", "eligibleCount", "eligibilitySourceAvailable",
    "eligibilitySourceMode", "fetchedAt", "persistedAt", "source"
  ];
  const marketAssetFields = [
    "symbol", "ticker", "name", "nameZh", "brandIconUrl", "assetType", "leveragedOrInverse",
    "price", "priceChange", "priceChangePercent", "quoteVolume", "marketUpdatedAt", "contractAddress",
    "campaignEligibility", "multiplier"
  ];
  const cmcFields = [
    "deliveryMode", "source", "fetchedAt", "persistedAt", "regime", "regimeLabel", "classification",
    "score", "macroRisk", "btcPrice", "btcDominance", "btcDominanceChange24h", "totalMarketCapUsd",
    "totalVolume24hUsd", "volumeChange24h", "marketCapChange24h"
  ];

  function storage(name) {
    try { return root[name] || null; } catch { return null; }
  }

  function cleanText(value, limit = 160) {
    if (value == null) return null;
    const normalized = String(value).trim();
    return normalized ? normalized.slice(0, limit) : null;
  }

  function pick(source, fields) {
    return fields.reduce((result, key) => {
      const value = source?.[key];
      if (value != null && ["string", "number", "boolean"].includes(typeof value)) result[key] = value;
      return result;
    }, {});
  }

  function normalizePendingOrder(value) {
    if (!value || typeof value !== "object") return null;
    const orderId = cleanText(value.orderId, 100);
    const createdAt = Number(value.createdAt);
    if (!orderId || !Number.isFinite(createdAt) || createdAt <= 0) return null;
    const record = { orderId, createdAt };
    pendingTextFields.slice(1).forEach((key) => {
      const cleaned = cleanText(value[key], key.endsWith("Token") ? 160 : 100);
      if (cleaned != null) record[key] = cleaned;
    });
    return record;
  }

  function normalizeStudioJob(value) {
    if (!value || typeof value !== "object") return null;
    const jobId = cleanText(value.jobId, 200);
    const symbol = cleanText(value.symbol, 32);
    const createdAt = Number(value.createdAt);
    if (!jobId || !/^x402_[0-9a-f]{32}$/i.test(jobId) || !Number.isFinite(createdAt) || createdAt <= 0) return null;
    const walletMode = ["agent", "browser"].includes(value.walletMode) ? value.walletMode : null;
    const walletAddress = cleanText(value.walletAddress, 100);
    return { jobId, ...(symbol ? { symbol } : {}), createdAt,
      ...(walletMode ? { walletMode } : {}), ...(walletAddress ? { walletAddress } : {}) };
  }

  function parsePending(source) {
    if (!source) return null;
    try { return normalizePendingOrder(JSON.parse(source.getItem(pendingOrderStorageKey) || "null")); }
    catch {
      try { source.removeItem(pendingOrderStorageKey); } catch { /* unavailable storage */ }
      return null;
    }
  }

  function persistPendingOrder(value) {
    const record = normalizePendingOrder(value);
    if (!record) return { record: null, backend: "memory", durable: false };
    const serialized = JSON.stringify(record);
    if (serialized.length > maxPendingOrderCharacters) return { record: null, backend: "memory", durable: false };
    memoryPendingOrder = record;
    const local = storage("localStorage");
    if (local) {
      try {
        local.setItem(pendingOrderStorageKey, serialized);
        try { storage("sessionStorage")?.removeItem(pendingOrderStorageKey); } catch { /* optional cleanup */ }
        return { record, backend: "localStorage", durable: true };
      } catch {
        disposableCacheKeys.forEach((key) => {
          try { local.removeItem(key); } catch { /* best-effort cache eviction */ }
        });
        try {
          local.setItem(pendingOrderStorageKey, serialized);
          return { record, backend: "localStorage", durable: true };
        } catch { /* fall through to per-tab storage */ }
      }
    }
    const session = storage("sessionStorage");
    if (session) {
      try {
        session.setItem(pendingOrderStorageKey, serialized);
        return { record, backend: "sessionStorage", durable: true };
      } catch { /* the server audit ledger remains authoritative */ }
    }
    return { record, backend: "memory", durable: false };
  }

  function readPendingOrder() {
    const record = parsePending(storage("localStorage")) || parsePending(storage("sessionStorage")) || memoryPendingOrder;
    return normalizePendingOrder(record);
  }

  function clearPendingOrder() {
    memoryPendingOrder = null;
    for (const name of ["localStorage", "sessionStorage"]) {
      try { storage(name)?.removeItem(pendingOrderStorageKey); } catch { /* unavailable storage */ }
    }
  }

  function parseStudioJob(source) {
    if (!source) return null;
    try { return normalizeStudioJob(JSON.parse(source.getItem(studioJobStorageKey) || "null")); }
    catch {
      try { source.removeItem(studioJobStorageKey); } catch { /* unavailable storage */ }
      return null;
    }
  }

  function persistStudioJob(value) {
    const record = normalizeStudioJob(value);
    if (!record) return { record: null, backend: "memory", durable: false };
    const serialized = JSON.stringify(record);
    if (serialized.length > maxStudioJobCharacters) return { record: null, backend: "memory", durable: false };
    memoryStudioJob = record;
    const local = storage("localStorage");
    if (local) {
      try {
        local.setItem(studioJobStorageKey, serialized);
        try { storage("sessionStorage")?.removeItem(studioJobStorageKey); } catch { /* optional cleanup */ }
        return { record, backend: "localStorage", durable: true };
      } catch {
        disposableCacheKeys.forEach((key) => {
          try { local.removeItem(key); } catch { /* best-effort cache eviction */ }
        });
        try {
          local.setItem(studioJobStorageKey, serialized);
          return { record, backend: "localStorage", durable: true };
        } catch { /* fall through to per-tab storage */ }
      }
    }
    const session = storage("sessionStorage");
    if (session) {
      try {
        session.setItem(studioJobStorageKey, serialized);
        return { record, backend: "sessionStorage", durable: true };
      } catch { /* the server database remains authoritative */ }
    }
    return { record, backend: "memory", durable: false };
  }

  function readStudioJob() {
    const record = parseStudioJob(storage("localStorage")) || parseStudioJob(storage("sessionStorage")) || memoryStudioJob;
    return normalizeStudioJob(record);
  }

  function clearStudioJob() {
    memoryStudioJob = null;
    for (const name of ["localStorage", "sessionStorage"]) {
      try { storage(name)?.removeItem(studioJobStorageKey); } catch { /* unavailable storage */ }
    }
  }

  function compactMarket(value) {
    if (!value || !Array.isArray(value.assets) || !value.assets.length) return null;
    return {
      ...pick(value, marketFields),
      assets: value.assets.slice(0, 250).map((asset) => pick(asset, marketAssetFields))
    };
  }

  function compactCmc(value) {
    return value && typeof value === "object" ? pick(value, cmcFields) : null;
  }

  function writePublicDataCache(payload) {
    const local = storage("localStorage");
    if (!local) return false;
    try {
      const prior = JSON.parse(local.getItem(publicDataCacheKey) || "null") || {};
      const savedAt = new Date().toISOString();
      const marketData = compactMarket(payload?.market);
      const cmcData = compactCmc(payload?.cmc);
      const market = marketData ? { savedAt, data: marketData } : prior.market;
      const cmc = cmcData && Object.keys(cmcData).length ? { savedAt, data: cmcData } : prior.cmc;
      if (!market && !cmc) return false;
      const serialized = JSON.stringify({ version: 3, market, cmc });
      if (serialized.length > maxPublicCacheCharacters) {
        local.removeItem(publicDataCacheKey);
        return false;
      }
      local.setItem(publicDataCacheKey, serialized);
      return true;
    } catch {
      try { local.removeItem(publicDataCacheKey); } catch { /* optional cache */ }
      return false;
    }
  }

  root.BstockAlphaStorage = Object.freeze({
    pendingOrderStorageKey,
    studioJobStorageKey,
    publicDataCacheKey,
    maxPendingOrderCharacters,
    maxStudioJobCharacters,
    maxPublicCacheCharacters,
    normalizePendingOrder,
    persistPendingOrder,
    readPendingOrder,
    clearPendingOrder,
    normalizeStudioJob,
    persistStudioJob,
    readStudioJob,
    clearStudioJob,
    writePublicDataCache
  });
})();
