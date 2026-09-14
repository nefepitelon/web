// Public, read-only Bitcoin chain-tip data. No keys or wallet access required.
// Esplora: https://github.com/Blockstream/esplora/blob/master/API.md#blocks
export const HALVING_INTERVAL = 210_000;
export const HALVING_FRESH_MS = 60_000;
export const HALVING_MAX_STALE_MS = 24 * 60 * 60_000;
const RETRY_MS = 15_000;
const BLOCK_SECONDS = 600;
const FOURTH_HALVING_AT = Date.parse("2024-04-20T00:09:27Z");
const PROVIDERS = [
  { name: "mempool.space", url: "https://mempool.space/api/blocks/tip/height" },
  { name: "Blockstream", url: "https://blockstream.info/api/blocks/tip/height" }
];

export function parseHalvingHeight(value, observedAt = Date.now()) {
  // Esplora returns plain text, not JSON. Never accept partial parseInt results,
  // HTML error pages, floating point values, signs, scientific notation or NaN.
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d{6,8}$/.test(text)) throw new Error("Invalid Bitcoin block height");
  const height = Number(text);
  // A deliberately generous mainnet sanity limit (twice target production),
  // anchored to a historical consensus event, not a fabricated current tip.
  const elapsedSeconds = Math.max(0, (observedAt - FOURTH_HALVING_AT) / 1000);
  const maximum = 840_000 + Math.ceil(elapsedSeconds / 300) + 2016;
  if (!Number.isSafeInteger(height) || height < 840_000 || height > maximum) {
    throw new Error("Implausible Bitcoin mainnet height");
  }
  return height;
}

export function makeHalvingSnapshot(height, source, observedAt = Date.now()) {
  const currentHeight = parseHalvingHeight(height, observedAt);
  const era = Math.floor(currentHeight / HALVING_INTERVAL);
  const previousHeight = era * HALVING_INTERVAL;
  const targetHeight = previousHeight + HALVING_INTERVAL;
  const blocksRemaining = targetHeight - currentHeight;
  // Match integer-satoshi subsidy rounding. Transaction fees are not included.
  const currentReward = Math.floor(5_000_000_000 / 2 ** era) / 100_000_000;
  const nextReward = Math.floor(5_000_000_000 / 2 ** (era + 1)) / 100_000_000;
  return {
    schema: 1,
    halvingNumber: era + 1,
    currentHeight,
    previousHeight,
    targetHeight,
    blocksRemaining,
    daysRemaining: Math.ceil(blocksRemaining * BLOCK_SECONDS / 86_400),
    progressPct: (currentHeight - previousHeight) / HALVING_INTERVAL * 100,
    estimatedAt: new Date(observedAt + blocksRemaining * BLOCK_SECONDS * 1000).toISOString(),
    estimateBlockSeconds: BLOCK_SECONDS,
    observedAt: new Date(observedAt).toISOString(),
    expiresAt: new Date(observedAt + HALVING_MAX_STALE_MS).toISOString(),
    source,
    stale: false,
    currentReward,
    nextReward,
    reductionPct: currentReward ? (1 - nextReward / currentReward) * 100 : 0
  };
}

async function fetchHeight(provider, fetchImpl, now, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Bitcoin provider timed out"));
    }, timeoutMs);
  });
  try {
    // Race covers both connection and response-body stalls, even for transports
    // which fail to reject promptly when their AbortSignal is cancelled.
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(provider.url, {
          headers: { Accept: "text/plain" },
          signal: controller.signal,
          cache: "no-store"
        });
        if (!response.ok) throw new Error(`Bitcoin provider HTTP ${response.status}`);
        const height = parseHalvingHeight(await response.text(), now());
        return makeHalvingSnapshot(height, provider.name, now());
      })(),
      timeout
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function createHalvingService({ fetchImpl = (...args) => fetch(...args), now = Date.now, timeoutMs = 3500 } = {}) {
  let lastGood = null;
  let inFlight = null;
  let retryAt = 0;
  let failed = false;

  function delivered() {
    if (!lastGood) return null;
    const age = now() - Date.parse(lastGood.observedAt);
    if (age < 0 || age > HALVING_MAX_STALE_MS) return null;
    return { ...lastGood, stale: failed || age >= HALVING_FRESH_MS };
  }

  async function refresh() {
    for (const provider of PROVIDERS) {
      try {
        const snapshot = await fetchHeight(provider, fetchImpl, now, timeoutMs);
        // Allow a small reorg, but do not replace a good recent snapshot with a
        // badly lagging provider and relabel that older height as current.
        const previous = delivered();
        if (previous && snapshot.currentHeight < previous.currentHeight - 6) {
          throw new Error("Bitcoin provider tip is behind the last observation");
        }
        lastGood = snapshot;
        failed = false;
        retryAt = now() + HALVING_FRESH_MS;
        return;
      } catch {
        // A second independent public explorer handles provider/network outages.
      }
    }
    failed = true;
    retryAt = now() + RETRY_MS;
    // Crucially, do not change lastGood.observedAt or project a fake new height.
  }

  return {
    async getPayload() {
      if (now() >= retryAt) {
        if (!inFlight) inFlight = refresh().finally(() => { inFlight = null; });
        await inFlight;
      } else if (inFlight) {
        await inFlight;
      }
      return delivered();
    }
  };
}

const service = createHalvingService();
export const getHalvingPayload = () => service.getPayload();
