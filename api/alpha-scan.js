const SPOT_TICKERS_URL = "https://data-api.binance.vision/api/v3/ticker/24hr";
const FUTURES_TICKERS_URL = "https://fapi.binance.com/fapi/v1/ticker/24hr";
const PREMIUM_INDEX_URL = "https://fapi.binance.com/fapi/v1/premiumIndex";
const BUBBLES_URL = "https://cryptobubbles.net/backend/data/bubbles1000.usd.json";
const TRENDING_URL = "https://api.coingecko.com/api/v3/search/trending";
const NEWS_FEEDS = [
  "https://www.coindesk.com/arc/outboundfeeds/rss/",
  "https://cointelegraph.com/rss"
];

const STABLE_BASES = new Set(["USDC", "FDUSD", "TUSD", "BUSD", "USDP", "DAI", "AEUR", "EUR", "EURI", "USDE", "USD1", "XUSD"]);
const MAJOR_SHORT_SYMBOLS = new Set(["BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "ADA", "SUI"]);
const FEATURED_SYMBOLS = ["BTC", "ETH", "BNB", "SOL", "DOGE", "ZEC", "TAO", "ENA", "ONDO", "UNI", "XRP", "SUI", "HYPE"];

function clamp(value, minimum = 0, maximum = 100) {
  return Math.max(minimum, Math.min(maximum, value));
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function percentileFactory(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length < 2) return () => 50;
  return (value) => {
    let index = 0;
    while (index < sorted.length && sorted[index] <= value) index += 1;
    return ((index - 1) / (sorted.length - 1)) * 100;
  };
}

function eligibleBase(base) {
  if (!base || STABLE_BASES.has(base)) return false;
  if (/(?:UP|DOWN|BULL|BEAR)$/.test(base)) return false;
  return /^[A-Z0-9]{2,16}$/.test(base);
}

async function fetchJson(url, timeout = 9000) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "ALPHA-RADAR/1.0" },
    signal: AbortSignal.timeout(timeout)
  });
  if (!response.ok) throw new Error(`${new URL(url).hostname} responded with ${response.status}`);
  return response.json();
}

async function fetchText(url, timeout = 7000) {
  const response = await fetch(url, {
    headers: { Accept: "application/rss+xml, application/xml, text/xml" },
    signal: AbortSignal.timeout(timeout)
  });
  if (!response.ok) throw new Error(`${new URL(url).hostname} responded with ${response.status}`);
  return response.text();
}

function fulfilled(result, fallback) {
  return result.status === "fulfilled" ? result.value : fallback;
}

function decodeXml(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractHeadlines(feeds) {
  return feeds.flatMap((feed) => [...feed.matchAll(/<title[^>]*>([\s\S]*?)<\/title>/gi)]
    .map((match) => decodeXml(match[1]).trim()))
    .filter((title, index) => index > 0 && title.length > 8)
    .slice(0, 100);
}

function headlineMatches(headline, coin) {
  const text = headline.toUpperCase();
  const symbol = coin.symbol.toUpperCase();
  const symbolMatches = (symbol.length >= 4 || MAJOR_SHORT_SYMBOLS.has(symbol))
    && new RegExp(`(^|[^A-Z0-9])${symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Z0-9]|$)`).test(text);
  const normalizedName = String(coin.name || "").trim().toUpperCase();
  return symbolMatches || (normalizedName.length >= 4 && text.includes(normalizedName));
}

function analyzeKlines(klines) {
  if (!Array.isArray(klines) || klines.length < 20) {
    return { return15m: 0, return1h: 0, return4h: 0, atrPercent: 0, breakout: 0, volumeMultiple: 1, volumeZ: 0 };
  }

  const lastIndex = klines.length - 1;
  const close = number(klines[lastIndex][4]);
  const percentChange = (start, end) => start ? ((end / start) - 1) * 100 : 0;
  const return15m = percentChange(number(klines[lastIndex][1]), close);
  const return1h = percentChange(number(klines[Math.max(0, lastIndex - 4)][4]), close);
  const return4h = percentChange(number(klines[Math.max(0, lastIndex - 16)][4]), close);
  const recent = klines.slice(-16);
  const atrPercent = close ? mean(recent.map((candle) => number(candle[2]) - number(candle[3]))) / close * 100 : 0;
  const prior = klines.slice(0, -1);
  const priorHigh = Math.max(...prior.map((candle) => number(candle[2])));
  const priorLow = Math.min(...prior.map((candle) => number(candle[3])));
  const breakout = close > priorHigh ? 1 : close < priorLow ? -1 : 0;

  const volumes = klines.map((candle) => number(candle[7]));
  const currentHourVolume = volumes.slice(-4).reduce((sum, value) => sum + value, 0);
  const priorHourVolumes = [];
  for (let index = 0; index + 4 <= volumes.length - 4; index += 4) {
    priorHourVolumes.push(volumes.slice(index, index + 4).reduce((sum, value) => sum + value, 0));
  }
  const baseline = mean(priorHourVolumes);
  const deviation = standardDeviation(priorHourVolumes);
  const volumeMultiple = baseline > 0 ? currentHourVolume / baseline : 1;
  const volumeZ = deviation > 0 ? (currentHourVolume - baseline) / deviation : 0;

  return { return15m, return1h, return4h, atrPercent, breakout, volumeMultiple, volumeZ };
}

function analyzeOpenInterest(history) {
  if (!Array.isArray(history) || history.length < 2) return null;
  const first = number(history[0].sumOpenInterestValue);
  const latest = number(history[history.length - 1].sumOpenInterestValue);
  return first > 0 ? ((latest / first) - 1) * 100 : null;
}

async function enrichCandidate(coin) {
  const marketBase = coin.perp ? "https://fapi.binance.com" : "https://data-api.binance.vision";
  const klinePath = coin.perp ? "/fapi/v1/klines" : "/api/v3/klines";
  const requests = [
    fetchJson(`${marketBase}${klinePath}?symbol=${coin.symbol}USDT&interval=15m&limit=100`, 6000)
  ];

  if (coin.perp) {
    requests.push(
      fetchJson(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${coin.symbol}USDT&period=1h&limit=3`, 6000),
      fetchJson(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${coin.symbol}USDT&period=1h&limit=1`, 6000)
    );
  }

  const results = await Promise.allSettled(requests);
  const klineMetrics = analyzeKlines(fulfilled(results[0], []));
  const openInterestChange = coin.perp ? analyzeOpenInterest(fulfilled(results[1], [])) : null;
  const ratioPayload = coin.perp ? fulfilled(results[2], []) : [];
  const longShortRatio = ratioPayload.length ? number(ratioPayload[ratioPayload.length - 1].longShortRatio, null) : null;
  return { ...coin, ...klineMetrics, openInterestChange, longShortRatio };
}

function formatPrice(value) {
  const price = number(value);
  const digits = price >= 1000 ? 1 : price >= 10 ? 2 : price >= 1 ? 3 : price >= 0.01 ? 4 : 7;
  return `$${price.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function buildReason(coin, signalType) {
  const pieces = [
    `15m ${coin.return15m >= 0 ? "+" : ""}${coin.return15m.toFixed(1)}% / 4h ${coin.return4h >= 0 ? "+" : ""}${coin.return4h.toFixed(1)}%`,
    `小时量能 ${coin.volumeMultiple.toFixed(1)}×`,
    coin.openInterestChange == null ? "仅现货，无 OI" : `OI ${coin.openInterestChange >= 0 ? "+" : ""}${coin.openInterestChange.toFixed(1)}%`,
    `资金费率 ${coin.fundingPercent >= 0 ? "+" : ""}${coin.fundingPercent.toFixed(3)}%`
  ];
  return `${signalType}：${pieces.join("，")}。高分表示异常强度，不代表直接买入。`;
}

function classifySignal(coin, score) {
  const direction = Math.sign(coin.return4h || coin.change24h || 1);
  let resonance = 0;
  let overheat = 0;
  if (coin.priceScore >= 65) resonance += 1;
  if (coin.volumeScore >= 65) resonance += 1;
  if (coin.openInterestChange != null && coin.openInterestChange * direction > 1) resonance += 1;
  if (coin.socialScore >= 70 || coin.mediaScore >= 65) resonance += 1;
  if (direction > 0 && coin.fundingPercent > 0.05) overheat += 1;
  if (direction < 0 && coin.fundingPercent < -0.05) overheat += 1;
  if (direction > 0 && coin.longShortRatio != null && coin.longShortRatio > 1.55) overheat += 1;
  if (direction < 0 && coin.longShortRatio != null && coin.longShortRatio < 0.68) overheat += 1;
  if (Math.abs(coin.change24h) > 15) overheat += 1;
  if (coin.liquidationScore >= 80 && coin.openInterestChange < 0) overheat += 1;

  if (overheat >= 2) return { bias: "neutral", signalType: "反指过热", resonance, overheat };
  if (resonance >= 3 && score >= 68) {
    return { bias: direction > 0 ? "long" : "short", signalType: direction > 0 ? "多头共振" : "空头共振", resonance, overheat };
  }
  return { bias: "neutral", signalType: "中性观察", resonance, overheat };
}

export default async function handler(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "GET") return response.status(405).json({ error: "Method not allowed" });

  try {
    const sourceResults = await Promise.allSettled([
      fetchJson(SPOT_TICKERS_URL),
      fetchJson(FUTURES_TICKERS_URL),
      fetchJson(PREMIUM_INDEX_URL),
      fetchJson(BUBBLES_URL),
      fetchJson(TRENDING_URL),
      ...NEWS_FEEDS.map((url) => fetchText(url))
    ]);

    const spotTickers = fulfilled(sourceResults[0], []);
    const futuresTickers = fulfilled(sourceResults[1], []);
    const premiumIndexes = fulfilled(sourceResults[2], []);
    const bubbles = fulfilled(sourceResults[3], []);
    const trending = fulfilled(sourceResults[4], { coins: [] });
    const feeds = sourceResults.slice(5).map((result) => fulfilled(result, "")).filter(Boolean);
    if (!spotTickers.length && !futuresTickers.length) throw new Error("Binance market data is unavailable");

    const spotMap = new Map();
    spotTickers.forEach((ticker) => {
      if (!ticker.symbol?.endsWith("USDT")) return;
      const base = ticker.symbol.slice(0, -4);
      if (eligibleBase(base) && number(ticker.quoteVolume) > 0) spotMap.set(base, ticker);
    });
    const futuresMap = new Map();
    futuresTickers.forEach((ticker) => {
      if (!ticker.symbol?.endsWith("USDT")) return;
      const base = ticker.symbol.slice(0, -4);
      if (eligibleBase(base) && number(ticker.quoteVolume) > 0) futuresMap.set(base, ticker);
    });
    const premiumMap = new Map(premiumIndexes.map((item) => [item.symbol, item]));
    const bubblesMap = new Map();
    bubbles.forEach((coin) => {
      const symbol = String(coin?.symbol || "").toUpperCase();
      if (symbol && coin?.symbols?.binance && !bubblesMap.has(symbol)) bubblesMap.set(symbol, coin);
    });
    const trendingMap = new Map();
    (trending.coins || []).forEach((entry, index) => {
      const symbol = String(entry?.item?.symbol || "").toUpperCase();
      if (symbol && !trendingMap.has(symbol)) trendingMap.set(symbol, index + 1);
    });
    const headlines = extractHeadlines(feeds);

    const symbols = new Set([...spotMap.keys(), ...futuresMap.keys()]);
    const universe = [...symbols].map((symbol) => {
      const spotTicker = spotMap.get(symbol);
      const futuresTicker = futuresMap.get(symbol);
      const premium = premiumMap.get(`${symbol}USDT`);
      const bubble = bubblesMap.get(symbol);
      const spotVolume = number(spotTicker?.quoteVolume);
      const perpVolume = number(futuresTicker?.quoteVolume);
      const combinedVolume = spotVolume + perpVolume;
      const change24h = combinedVolume > 0
        ? ((number(spotTicker?.priceChangePercent) * spotVolume) + (number(futuresTicker?.priceChangePercent) * perpVolume)) / combinedVolume
        : number(spotTicker?.priceChangePercent ?? futuresTicker?.priceChangePercent);
      return {
        symbol,
        name: bubble?.name || symbol,
        spot: Boolean(spotTicker),
        perp: Boolean(futuresTicker),
        price: number(futuresTicker?.lastPrice ?? spotTicker?.lastPrice),
        change24h,
        combinedVolume,
        fundingPercent: number(premium?.lastFundingRate) * 100,
        marketCap: number(bubble?.marketcap),
        trendingRank: trendingMap.get(symbol) || null
      };
    }).filter((coin) => coin.combinedVolume >= 1_000_000 && coin.price > 0);

    const changePercentile = percentileFactory(universe.map((coin) => Math.abs(coin.change24h)));
    const volumePercentile = percentileFactory(universe.map((coin) => Math.log10(coin.combinedVolume)));
    const fundingPercentile = percentileFactory(universe.map((coin) => Math.abs(coin.fundingPercent)));
    universe.forEach((coin) => {
      coin.preScore = changePercentile(Math.abs(coin.change24h)) * 0.48
        + volumePercentile(Math.log10(coin.combinedVolume)) * 0.34
        + fundingPercentile(Math.abs(coin.fundingPercent)) * 0.18;
    });

    const candidates = [...universe].sort((left, right) => right.preScore - left.preScore).slice(0, 24);
    const candidateSymbols = new Set(candidates.map((coin) => coin.symbol));
    const featuredCoins = FEATURED_SYMBOLS.map((symbol) => universe.find((coin) => coin.symbol === symbol)).filter(Boolean);
    const enrichmentTargets = [...candidates, ...featuredCoins.filter((coin) => !candidateSymbols.has(coin.symbol))];
    const enriched = await Promise.all(enrichmentTargets.map(enrichCandidate));
    const pricePercentile = percentileFactory(enriched.map((coin) => (
      Math.abs(coin.return15m) * 0.12 + Math.abs(coin.return1h) * 0.24 + Math.abs(coin.return4h) * 0.34 + Math.abs(coin.change24h) * 0.3 + coin.atrPercent * 0.25
    )));
    const volumeAnomalyPercentile = percentileFactory(enriched.map((coin) => Math.max(0, coin.volumeZ) + Math.log2(Math.max(1, coin.volumeMultiple))));
    const candidateFundingPercentile = percentileFactory(enriched.map((coin) => Math.abs(coin.fundingPercent)));
    const longShortPercentile = percentileFactory(enriched.map((coin) => coin.longShortRatio == null ? 0 : Math.abs(Math.log(coin.longShortRatio))));
    const liquidationPercentile = percentileFactory(enriched.map((coin) => (
      coin.openInterestChange == null ? 0 : Math.max(0, -coin.openInterestChange) * Math.max(0.5, Math.abs(coin.return1h)) * Math.max(1, coin.volumeMultiple)
    )));

    const scoredUniverse = enriched.map((coin) => {
      const priceRaw = Math.abs(coin.return15m) * 0.12 + Math.abs(coin.return1h) * 0.24 + Math.abs(coin.return4h) * 0.34 + Math.abs(coin.change24h) * 0.3 + coin.atrPercent * 0.25;
      const volumeRaw = Math.max(0, coin.volumeZ) + Math.log2(Math.max(1, coin.volumeMultiple));
      const liquidationRaw = coin.openInterestChange == null ? 0 : Math.max(0, -coin.openInterestChange) * Math.max(0.5, Math.abs(coin.return1h)) * Math.max(1, coin.volumeMultiple);
      const priceScore = Math.round(25 + pricePercentile(priceRaw) * 0.75);
      const volumeScore = Math.round(25 + volumeAnomalyPercentile(volumeRaw) * 0.75);
      const fundingScore = coin.perp ? Math.round(25 + candidateFundingPercentile(Math.abs(coin.fundingPercent)) * 0.75) : 30;
      const longShortScore = coin.longShortRatio == null ? 30 : Math.round(25 + longShortPercentile(Math.abs(Math.log(coin.longShortRatio))) * 0.75);
      const liquidationScore = coin.openInterestChange == null ? 30 : Math.round(25 + liquidationPercentile(liquidationRaw) * 0.75);
      const socialScore = coin.trendingRank ? Math.round(clamp(100 - (coin.trendingRank - 1) * 5, 35, 100)) : 35;
      const matchedHeadlines = headlines.filter((headline) => headlineMatches(headline, coin)).slice(0, 3);
      const mediaScore = Math.round(clamp(35 + matchedHeadlines.length * 20, 35, 95));
      const dimensions = [priceScore, volumeScore, fundingScore, longShortScore, liquidationScore, socialScore, mediaScore];
      const weightedIntensity = priceScore * 0.22 + volumeScore * 0.2 + fundingScore * 0.14 + longShortScore * 0.12 + liquidationScore * 0.12 + socialScore * 0.1 + mediaScore * 0.1;
      const score = Math.round(clamp(45 + weightedIntensity * 0.5, 50, 96));
      const interpreted = classifySignal({ ...coin, priceScore, volumeScore, liquidationScore, socialScore, mediaScore }, score);
      const autogeneratedHeadlines = [
        `${coin.symbol} 1H 成交量为 24H 小时均值的 ${coin.volumeMultiple.toFixed(1)} 倍`,
        `${coin.symbol} 4H 动量 ${coin.return4h >= 0 ? "+" : ""}${coin.return4h.toFixed(1)}%，OI ${coin.openInterestChange == null ? "仅永续可用" : `${coin.openInterestChange >= 0 ? "+" : ""}${coin.openInterestChange.toFixed(1)}%`}`
      ];
      const risks = [];
      if (interpreted.overheat >= 2) risks.push("反指过热，禁止追价");
      if (coin.volumeMultiple > 4) risks.push("短时量能极端放大");
      if (coin.openInterestChange != null && coin.openInterestChange < -5) risks.push("OI 快速回落，可能为强平驱动");
      if (coin.combinedVolume < 10_000_000) risks.push("成交深度偏低");
      if (!risks.length) risks.push("等待下一根 15m K 线确认");

      return {
        symbol: coin.symbol,
        name: coin.name,
        type: interpreted.signalType,
        market: coin.spot && coin.perp ? "both" : coin.perp ? "perp" : "spot",
        price: formatPrice(coin.price),
        change: Number(coin.change24h.toFixed(2)),
        volume: Number(coin.volumeMultiple.toFixed(2)),
        funding: Number(coin.fundingPercent.toFixed(4)),
        fundingAvailable: coin.perp,
        oi: coin.openInterestChange == null ? null : Number(coin.openInterestChange.toFixed(2)),
        longShortRatio: coin.longShortRatio == null ? null : Number(coin.longShortRatio.toFixed(3)),
        score,
        bias: interpreted.bias,
        signalType: interpreted.signalType,
        watched: false,
        dimensions,
        reason: buildReason(coin, interpreted.signalType),
        heat: socialScore,
        kols: coin.trendingRank ? [`CoinGecko Trending #${coin.trendingRank}`] : ["公开趋势未入榜"],
        risks,
        headlines: matchedHeadlines.length ? matchedHeadlines.slice(0, 2) : autogeneratedHeadlines,
        metrics: {
          return15m: Number(coin.return15m.toFixed(2)),
          return1h: Number(coin.return1h.toFixed(2)),
          return4h: Number(coin.return4h.toFixed(2)),
          volumeZ: Number(coin.volumeZ.toFixed(2)),
          atrPercent: Number(coin.atrPercent.toFixed(2)),
          breakout: coin.breakout,
          liquidationMode: "OI × 价格 × 量能代理"
        }
      };
    });
    const scoredBySymbol = new Map(scoredUniverse.map((coin) => [coin.symbol, coin]));
    const scored = candidates
      .map((coin) => scoredBySymbol.get(coin.symbol))
      .filter(Boolean)
      .sort((left, right) => right.score - left.score || Math.abs(right.change) - Math.abs(left.change));
    const featuredItems = FEATURED_SYMBOLS.map((symbol) => scoredBySymbol.get(symbol)).filter(Boolean);

    const now = new Date();
    const nextScan = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const marketBreakdown = {
      total: universe.length,
      spot: universe.filter((coin) => coin.spot).length,
      perp: universe.filter((coin) => coin.perp).length,
      both: universe.filter((coin) => coin.spot && coin.perp).length
    };
    response.setHeader("Cache-Control", "s-maxage=7200, stale-while-revalidate=300");
    response.status(200).json({
      scanIntervalHours: 2,
      scannedAt: now.toISOString(),
      nextScanAt: nextScan.toISOString(),
      marketBreakdown,
      shortlistSize: candidates.length,
      items: scored,
      featuredItems,
      methodology: {
        dimensions: ["价格动量", "成交异动", "资金费率", "多空比", "爆仓强度", "社交情绪", "媒体热度"],
        interpretation: "异常强度评分后再判断共振或反指过热；高分不等于买入。",
        liquidation: "使用 OI 回落 × 价格位移 × 量能放大的代理指标，不冒充逐笔强平数据。"
      },
      sources: {
        market: "Binance Spot + USDⓈ-M Futures public market data",
        social: sourceResults[4].status === "fulfilled" ? "CoinGecko Trending public search heat" : "unavailable",
        media: feeds.length ? "CoinDesk + Cointelegraph RSS" : "unavailable"
      }
    });
  } catch (error) {
    response.status(502).json({
      error: "Alpha scan is temporarily unavailable",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}
