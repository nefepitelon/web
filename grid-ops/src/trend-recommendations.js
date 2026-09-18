import { analyzeTrendWithLivePrice } from './trend.js';

export const TREND_RECOMMENDATION_MIN_STRENGTH = 0.30;
export const TREND_RECOMMENDATION_CONCURRENCY = 4;
export const SUPPORTED_TREND_INTERVALS = new Set([900, 3600, 14400, 86400]);
export const SUPPORTED_TREND_RECOMMENDATIONS = new Set(['neutral', 'long', 'short']);

export function normalizeTrendIntervalSec(value) {
  const intervalSec = Number(value);
  return SUPPORTED_TREND_INTERVALS.has(intervalSec) ? intervalSec : 3600;
}

export function normalizeTrendRecommendation(value) {
  const recommendation = String(value || '').toLowerCase();
  return SUPPORTED_TREND_RECOMMENDATIONS.has(recommendation) ? recommendation : 'neutral';
}

export function normalizeTrendRecommendationMinStrength(value) {
  if (value == null || String(value).trim() === '') return TREND_RECOMMENDATION_MIN_STRENGTH;
  const strength = Number(value);
  if (!Number.isFinite(strength)) return TREND_RECOMMENDATION_MIN_STRENGTH;
  // The UI exposes ten-percentage-point steps. Normalizing here keeps local
  // and hosted callers on the same contract even if the endpoint is called
  // manually with an arbitrary decimal.
  return Math.min(0.9, Math.max(0, Math.round(strength * 10) / 10));
}

/**
 * Analyse every open market with bounded concurrency. A venue can expose
 * hundreds of products, so the scan must not issue one unbounded Promise per
 * product and trip public-market-data rate limits.
 */
export async function scanTrendRecommendations({
  markets,
  intervalSec = 3600,
  getCandles,
  getPrice,
  recommendation = 'neutral',
  minStrength = TREND_RECOMMENDATION_MIN_STRENGTH,
  concurrency = TREND_RECOMMENDATION_CONCURRENCY,
  analyze = analyzeTrendWithLivePrice,
}) {
  if (typeof getCandles !== 'function' || typeof getPrice !== 'function') {
    throw new TypeError('趋势扫描需要 getCandles 与 getPrice');
  }

  const candidates = (Array.isArray(markets) ? markets : [])
    .filter((market) => market && market.marketId != null && market.isClosed !== true);
  const safeInterval = normalizeTrendIntervalSec(intervalSec);
  const safeRecommendation = normalizeTrendRecommendation(recommendation);
  const safeMinStrength = normalizeTrendRecommendationMinStrength(minStrength);
  const workerCount = Math.max(1, Math.min(candidates.length || 1, Math.floor(Number(concurrency) || 1)));
  const recommendations = [];
  let cursor = 0;
  let failed = 0;

  async function worker() {
    while (cursor < candidates.length) {
      const market = candidates[cursor++];
      try {
        const [candles, priceValue] = await Promise.all([
          getCandles(market.marketId, safeInterval, 200),
          getPrice(market.marketId),
        ]);
        const price = Number(priceValue);
        if (!Array.isArray(candles) || candles.length < 20 || !Number.isFinite(price) || price <= 0) {
          failed++;
          continue;
        }
        const analysis = analyze(candles, price);
        const strength = Number(analysis?.strength);
        if (analysis?.recommended !== safeRecommendation || !Number.isFinite(strength) || strength <= safeMinStrength) continue;
        recommendations.push({
          marketId: market.marketId,
          displayName: String(market.displayName || market.name || market.symbol || market.marketId),
          symbol: market.symbol ? String(market.symbol) : null,
          strength,
          price: Number(analysis.price),
          atrPct: Number.isFinite(Number(analysis.atrPct)) ? Number(analysis.atrPct) : null,
          detail: String(analysis.detail || ''),
          recommended: safeRecommendation,
        });
      } catch {
        failed++;
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  recommendations.sort((left, right) => right.strength - left.strength
    || left.displayName.localeCompare(right.displayName));

  return {
    recommendations,
    scanned: candidates.length,
    matched: recommendations.length,
    failed,
    intervalSec: safeInterval,
    recommendation: safeRecommendation,
    minStrength: safeMinStrength,
    generatedAt: new Date().toISOString(),
  };
}
