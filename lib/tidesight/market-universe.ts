export const TIDESIGHT_FEATURED_MARKETS = [
  { symbol: "BTCUSDT", asset: "BTC" },
  { symbol: "ETHUSDT", asset: "ETH" },
  { symbol: "BNBUSDT", asset: "BNB" },
  { symbol: "SOLUSDT", asset: "SOL" },
  { symbol: "ZECUSDT", asset: "ZEC" },
  { symbol: "TAOUSDT", asset: "TAO" },
  { symbol: "ENAUSDT", asset: "ENA" },
  { symbol: "ONDOUSDT", asset: "ONDO" },
  { symbol: "UNIUSDT", asset: "UNI" },
  { symbol: "XRPUSDT", asset: "XRP" },
  { symbol: "SUIUSDT", asset: "SUI" },
  { symbol: "HYPEUSDT", asset: "HYPE" },
] as const;

export const TIDESIGHT_MACD_MARKETS = TIDESIGHT_FEATURED_MARKETS;

export const TIDESIGHT_MACD_INTERVALS = [
  { interval: "1M", zh: "月线", en: "Monthly" },
  { interval: "1w", zh: "周线", en: "Weekly" },
  { interval: "1d", zh: "日线", en: "Daily" },
  { interval: "4h", zh: "4 小时", en: "4 Hours" },
  { interval: "1h", zh: "1 小时", en: "1 Hour" },
  { interval: "15m", zh: "15 分钟", en: "15 Minutes" },
] as const;
