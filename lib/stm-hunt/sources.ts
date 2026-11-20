import "server-only";
import { buildAlphaScanSnapshot } from "../../api/alpha-scan.js";
import type { StmCandidate, StmHolding, StmMarketEvidence, StmSource, StmTradeEvent, StmTrader } from "./types";

type Obj = Record<string, any>;
const WSM = "https://web3smartmoney.com";
const RADAR = "https://traderadar.qianyuwing.com";
const obj = (value: unknown): Obj => value && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
const rows = (value: unknown): Obj[] => Array.isArray(value) ? value.filter(row => row && typeof row === "object" && !Array.isArray(row)) : [];
const str = (value: unknown, fallback = "") => typeof value === "string" ? value.slice(0, 256) : fallback;
export function stmNumber(value: unknown): number | null {
  if ((typeof value !== "number" && typeof value !== "string") || value === "" || value === null || typeof value === "boolean") return null;
  const number = Number(value); return Number.isFinite(number) ? number : null;
}
function alphaPrice(value: unknown): number | null {
  // Alpha's formatPrice emits a USD string with en-US grouping and 1–7 decimals.
  // Reject arbitrary units, ratios and malformed grouping instead of stripping text.
  const amount = typeof value === "number" ? value : typeof value === "string" && /^\$(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,7})?$/.test(value)
    ? Number(value.slice(1).replace(/,/g, "")) : NaN;
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}
export function normalizeStmAlphaCandidate(raw: unknown, scannedAt: unknown): StmCandidate | null {
  const row = obj(raw), symbol = str(row.symbol).replace(/USDT$/, "");
  if (!/^[A-Z0-9]{2,20}$/.test(symbol)) return null;
  // Alpha's `volume` is the hourly volume multiple, never a dollar amount.
  const absoluteVolume = stmNumber(row.volumeUsd ?? row.volume24hUsd ?? row.quoteVolumeUsd);
  return { id: `cex:${symbol}`, symbol, name: str(row.name, symbol), address: null, chain: null, market: "cex", sources: ["alpha"],
    price: alphaPrice(row.price), change24h: stmNumber(row.change), volumeUsd: absoluteVolume !== null && absoluteVolume >= 0 ? absoluteVolume : null, liquidityUsd: null,
    score: stmNumber(row.score) ?? 0, bias: str(row.bias, "neutral"), reason: str(row.reason), updatedAt: stmTimestamp(scannedAt), risk: "unknown", holders: 0 };
}
export function stmTimestamp(value: unknown): string | null {
  // Deliberately reject source-local date strings without a timezone.
  const milliseconds = typeof value === "number" ? (value < 1e12 ? value * 1000 : value)
    : typeof value === "string" && /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? Date.parse(value) : NaN;
  return Number.isFinite(milliseconds) && milliseconds > 0 ? new Date(milliseconds).toISOString() : null;
}
export function stmAsset(chain: string, address: string) { return `${chain}:${/^0x/i.test(address) ? address.toLowerCase() : address}`; }
async function json(url: string, token?: string): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
    headers: { Accept: "application/json", "User-Agent": "STM-hunt/1.0", ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.text();
  if (body.length > 12_000_000) throw new Error("Snapshot exceeds size limit");
  return JSON.parse(body);
}
export interface StmSourceCapture {
  asOf: string; sources: StmSource[]; traders: StmTrader[]; candidates: StmCandidate[];
  events: StmTradeEvent[]; markets: StmMarketEvidence[];
}

function normalizeHolding(row: Obj, board: string, defaultChain: string | null): StmHolding | null {
  const symbol = str(row.symbol ?? row.coin).replace(/USDT$/, "");
  if (!symbol) return null;
  const chain = board === "pump" ? (Number(row.chainId) === 1399811149 ? "solana" : Number(row.chainId) === 4663 ? "robinhood" : `chain:${row.chainId}`) : str(row.chain, defaultChain ?? "") || null;
  const address = str(row.mint ?? row.address ?? row.tokenAddress) || null;
  const side = row.side === "short" ? "short" : row.side === "long" ? "long" : ["hl", "lighter", "binance"].includes(board) ? "long" : "spot";
  return { asset: side === "spot" ? (chain && address ? stmAsset(chain, address) : `unknown:${board}:${chain}:${symbol}`) : `cex:${symbol}`,
    symbol, chain, address, side, quantity: stmNumber(row.size ?? row.held ?? row.quantity), valueUsd: stmNumber(row.valueUsd ?? row.usd ?? row.notional) };
}

export function normalizeStmRoster(board: string, raw: unknown, holdingsRaw: unknown, updatedHint: string | null): StmTrader[] {
  const data = obj(raw), details = obj(holdingsRaw), holdings = obj(details.holdings ?? details);
  const roster = rows(board === "fomo" ? data.data : data.traders);
  return roster.map((row): StmTrader => {
    const address = str(row.address ?? row.wallet ?? row.evm ?? row.sol) || null;
    const reference = str(row.id ?? row.userId ?? row.address ?? row.wallet);
    const detail = obj(holdings[reference] ?? holdings[row.userId] ?? holdings[address ?? ""] ?? holdings[(address ?? "").toLowerCase()]);
    const hl = obj(row.hl);
    const positions = rows(board === "hl" ? hl.topLegs : board === "fomo" ? row.top_tokens : detail.positions);
    const normalized = positions.map(position => normalizeHolding(position, board, board === "okx" || board === "pump" ? "solana" : board === "hl" ? "hyperliquid" : board === "lighter" ? "lighter" : null)).filter((row): row is StmHolding => !!row);
    const truncated = board === "fomo" || (board === "hl" && Number(hl.legCount) > normalized.length) || detail.shortfall === true || row.shortfall === true
      || detail.isExceedLimit === true || row.isExceedLimit === true || (board === "pump" && Number(detail.quality) > normalized.length);
    const hidden = row.statusKey === "private" || detail.shared === false || detail.loginRequired === true || detail.fetchOk === false || row.fetchOk === false || (board === "hl" && hl.ok !== true);
    const updatedAt = stmTimestamp(row.holdings_updated_at ?? row.lastRefreshedAtMs ?? data.fetchedAt ?? data.sourceUpdatedAtUnix ?? details.captured_at);
    const pnlUsd = stmNumber(row.pnlUsd ?? row.official_pnl_usd ?? row.bestNetPnl);
    const winRate = stmNumber(row.winRate);
    return { id: `wsm:${board}:${reference || address}`, source: `wsm-${board}`, venue: board,
      name: str(row.name ?? row.displayName ?? row.username ?? row.label, address ?? reference), address,
      pnlUsd, roi: stmNumber(row.roi ?? row.pnlPercent), winRate: winRate !== null && board === "binance" ? winRate * 100 : winRate,
      pnlWindow: board === "pump" ? "2026-07-01 起，已实现+未实现" : board === "okx" ? "3M" : board === "fomo" ? "来源未说明" : "All time，跨平台不可比",
      updatedAt, holdings: hidden ? [] : normalized,
      visibility: hidden ? "private" : truncated ? "truncated" : normalized.length ? "public" : "empty",
      tags: [...(Array.isArray(row.labels) ? row.labels.map((tag: unknown) => str(tag)) : []), ...(row.tag ? [str(row.tag)] : [])].slice(0, 12),
      // A public leaderboard or a KOL tag alone does not establish execution quality.
      qualified: false };
  });
}

export async function captureStmSources(): Promise<StmSourceCapture> {
  const asOf = new Date().toISOString(), sources: StmSource[] = [], traders: StmTrader[] = [], candidates: StmCandidate[] = [], events: StmTradeEvent[] = [];
  const values: Record<string, unknown> = {};
  const jobs: { id: string; name: string; url: string; semantics: StmSource["semantics"]; load: () => Promise<unknown> }[] = [
    ...["fomo", "hl", "pump", "binance", "lighter", "okx"].map(board => ({ id: `wsm-${board}`, name: `Web3SmartMoney · ${board.toUpperCase()}`, url: `${WSM}/${board}/data/traders.json`, semantics: "snapshot" as const, load: () => json(`${WSM}/${board}/data/traders.json`) })),
    ...["pump", "binance", "lighter", "okx"].map(board => ({ id: `holdings-${board}`, name: `${board.toUpperCase()} 持仓快照`, url: `${WSM}/${board}/data/holdings.json`, semantics: "snapshot" as const, load: () => json(`${WSM}/${board}/data/holdings.json`) })),
    { id: "wsm-hub", name: "Web3SmartMoney 汇总", url: `${WSM}/hub/overview.json`, semantics: "context", load: () => json(`${WSM}/hub/overview.json`) },
    { id: "wsm-version", name: "Web3SmartMoney 版本时间", url: `${WSM}/version.json`, semantics: "context", load: () => json(`${WSM}/version.json`) },
    { id: "top-ranking", name: "TopTrader 多交易所榜单", url: `${RADAR}/api/ranking?limit=30&sort=pnl&balanced=1`, semantics: "snapshot", load: () => json(`${RADAR}/api/ranking?limit=30&sort=pnl&balanced=1`) },
    { id: "top-resonance", name: "TopTrader 24h 共振背景", url: `${RADAR}/api/resonance?window=1440&min=3&limit=30`, semantics: "context", load: () => json(`${RADAR}/api/resonance?window=1440&min=3&limit=30`) },
    { id: "top-events", name: "TopTrader 精确成交", url: `${RADAR}/api/signals/recent?limit=200`, semantics: "events", load: () => json(`${RADAR}/api/signals/recent?limit=200`, process.env.STM_TOPTRADER_TOKEN) },
    { id: "alpha", name: "Alpha Radar 异动榜", url: "https://www.welinkbtc-onchainmain.xyz/alpha-radar", semantics: "market", load: () => buildAlphaScanSnapshot() },
  ];
  await Promise.all(jobs.map(async job => {
    const start = Date.now();
    try {
      const value = await job.load(); values[job.id] = value;
      const data = obj(value);
      const updatedAt = stmTimestamp(data.fetchedAt ?? data.scannedAt ?? data.sourceUpdatedAtUnix ?? data.builtAt ?? data.captured_at);
      sources.push({ id: job.id, name: job.name, url: job.url, status: "ok", fetchedAt: asOf, updatedAt,
        count: rows(data.traders ?? data.data ?? data.items ?? data.activity ?? data.signals).length, latencyMs: Date.now() - start,
        semantics: job.semantics, message: job.semantics === "snapshot" ? "快照观察；不冒充逐笔交易" : job.semantics === "context" ? "研究背景；不用于精确成交触发" : "已连接" });
    } catch (error) {
      const restricted = error instanceof Error && /HTTP 40[13]/.test(error.message);
      sources.push({ id: job.id, name: job.name, url: job.url, status: restricted ? "restricted" : "unavailable", fetchedAt: asOf, updatedAt: null,
        count: 0, latencyMs: Date.now() - start, semantics: job.semantics, message: restricted ? "需数据源授权；未绕过访问限制" : "上游暂不可用；不填充模拟数据" });
    }
  }));
  const version = obj(obj(values["wsm-version"]).sources);
  for(const board of ["pump","binance","lighter","okx"]) {
    const source=sources.find(row=>row.id===`holdings-${board}`)!;
    const raw=obj(values[`holdings-${board}`]);
    source.count=Object.keys(obj(raw.holdings??raw)).length;
    if(source.status==="ok" && !source.updatedAt) {source.status="stale";source.message="公开持仓已读取；源快照时间无时区或未知，仅供观察";}
  }
  for (const board of ["fomo", "hl", "pump", "binance", "lighter", "okx"]) {
    const normalized = normalizeStmRoster(board, values[`wsm-${board}`], values[`holdings-${board}`], stmTimestamp(version[board]));
    traders.push(...normalized);
    const status = sources.find(row => row.id === `wsm-${board}`)!;
    if (status.status === "ok") {
      const times = normalized.map(row => row.updatedAt).filter((value): value is string => !!value).sort();
      status.updatedAt = times.at(-1) ?? null; status.count = normalized.length;
      if (!status.updatedAt || Date.parse(asOf) - Date.parse(status.updatedAt) > 3 * 3600_000) { status.status = "stale"; status.message = "源时间未知或超过三小时，仅供历史研究"; }
      if (board === "binance") status.message += "；私密仓位不解释为零仓";
    }
  }
  const ranking = rows(obj(values["top-ranking"]).items);
  const rankingSource=sources.find(row=>row.id==="top-ranking");
  if(rankingSource) rankingSource.updatedAt=ranking.map(row=>stmTimestamp(row.updated_at)).filter((value):value is string=>!!value).sort().at(-1)??null;
  for (const row of ranking) {
    const id = `radar:${str(row.exchange)}:${str(row.sub_exchange)}:${str(row.uid)}`;
    const winRate = row.win_rate_valid === true ? stmNumber(row.win_rate) : null;
    const mdd = stmNumber(row.mdd), score = stmNumber(row.score), firstSeen = stmTimestamp(row.first_seen);
    traders.push({ id, source: "top-ranking", venue: str(row.exchange), name: str(row.nickname, str(row.uid)), address: /^0x[0-9a-fA-F]{40}$/.test(str(row.uid)) ? str(row.uid).toLowerCase() : null,
      pnlUsd: stmNumber(row.pnl), roi: stmNumber(row.roi), winRate, pnlWindow: "来源窗口不统一", updatedAt: stmTimestamp(row.updated_at), holdings: [], visibility: "private", tags: [str(row.sub_exchange)],
      qualified: winRate !== null && winRate >= 50 && mdd !== null && mdd > 0 && mdd <= 40 && score !== null && score >= 60 && firstSeen !== null && Date.parse(asOf) - Date.parse(firstSeen) >= 30 * 86400_000 });
  }
  for (const row of rows(obj(values["top-events"]).items ?? obj(values["top-events"]).signals)) {
    const traderId = `radar:${str(row.exchange)}:${str(row.sub_exchange)}:${str(row.uid ?? row.trader_uid)}`;
    const symbol = str(row.symbol).replace(/(?:USDT|USDC)$/, "");
    const at = stmTimestamp(row.occurred_at), action = str(row.action ?? row.event_type ?? row.type).toLowerCase();
    const side = str(row.side).toLowerCase();
    if (!at || !["open", "add", "reduce", "close"].includes(action) || !["long", "short"].includes(side) || !/^[A-Z0-9]{2,20}$/.test(symbol)) continue;
    const trader = traders.find(row => row.id === traderId);
    events.push({ id: str(row.id, `${traderId}:${symbol}:${action}:${at}`), traderId, asset: `cex:${symbol}`, symbol, side: side as "long" | "short",
      action: action as StmTradeEvent["action"], occurredAt: at, exact: row.time_approx === false, qualified: trader?.qualified === true,
      quantity: stmNumber(row.quantity), clusterId: trader?.address || traderId });
  }
  const alpha = obj(values.alpha);
  const resonance=rows(obj(values["top-resonance"]).signals);
  for (const row of rows(alpha.items).slice(0, 10)) {
    const candidate = normalizeStmAlphaCandidate(row, alpha.scannedAt);
    if (!candidate) continue;
    const context=resonance.find(signal=>str(signal.symbol).replace(/USDT$/," ").trim()===candidate.symbol);
    candidates.push({ ...candidate, sources: ["alpha",...(context?["top-resonance"]:[])],
      reason: `${candidate.reason}${context?`；24h 共振背景 ${stmNumber(context.trader_count)??0} 人（不计作精确成交）`:""}` });
  }
  const tokenMap = new Map<string, StmCandidate>();
  for (const token of rows(obj(values["wsm-fomo"]).shared_tokens)) {
    const chain = str(token.chain), address = str(token.address); if (!chain || !address) continue;
    tokenMap.set(stmAsset(chain, address), { id: stmAsset(chain,address), symbol: str(token.symbol), name: str(token.name, str(token.symbol)), address, chain,
      market: "onchain", sources: ["wsm-fomo"], price: stmNumber(token.price), change24h: null, volumeUsd: null, liquidityUsd: null, score: 0, bias: "observe", reason: "FOMO 共同持有快照；非新买入", updatedAt: stmTimestamp(version.fomo), risk: "unknown", holders: rows(token.holders).length });
  }
  for (const trader of traders.filter(row => ["pump", "okx"].includes(row.venue))) for (const holding of trader.holdings) {
    if (!holding.address || !holding.chain || holding.quantity === null || holding.quantity <= 0) continue;
    const prior = tokenMap.get(holding.asset);
    if (prior) { prior.holders++; if (!prior.sources.includes(trader.source)) prior.sources.push(trader.source); }
    else tokenMap.set(holding.asset, { id: holding.asset, symbol: holding.symbol, name: holding.symbol, address: holding.address, chain: holding.chain,
      market: "onchain", sources: [trader.source], price: holding.valueUsd !== null ? holding.valueUsd / holding.quantity : null, change24h: null, volumeUsd: null, liquidityUsd: null,
      score: 0, bias: "observe", reason: "公开持有快照；需链上 Swap、风险与报价确认", updatedAt: trader.updatedAt, risk: "unknown", holders: 1 });
  }
  candidates.push(...[...tokenMap.values()].sort((a,b) => b.holders-a.holders).slice(0, 40));
  const markets = (await Promise.all(candidates.filter(row => row.market === "cex").slice(0,10).map(row => loadStmMarket(row.symbol).catch(() => null)))).filter((row): row is StmMarketEvidence => !!row);
  sources.push({ id: "closed-market", name: "Binance 已收盘行情与历史费率", url: "https://data-api.binance.vision", semantics: "market", fetchedAt: asOf,
    updatedAt: markets.map(row => row.asOf).sort().at(-1) ?? null, count: markets.length, latencyMs: 0, status: markets.length ? "ok" : "unavailable", message: "排除未闭合 K 线；OI 使用数量；真实强平数据未接入" });
  // Capture time is the completed observation time; no included source can be
  // considered available at the start of a slower multi-source collection.
  return { asOf:new Date().toISOString(), sources: sources.sort((a,b) => jobs.findIndex(row => row.id === a.id)-jobs.findIndex(row => row.id === b.id)), traders, candidates, events, markets };
}

export async function loadStmMarket(symbol: string, now = Date.now()): Promise<StmMarketEvidence> {
  if (!/^[A-Z0-9]{2,20}$/.test(symbol)) throw new Error("Invalid market symbol");
  const pair = `${symbol}USDT`, bar = 900000;
  const [raw, fundingResult, oiResult] = await Promise.all([
    json(`https://data-api.binance.vision/api/v3/klines?symbol=${pair}&interval=15m&limit=100`),
    json(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${pair}&limit=100`).catch(() => null),
    json(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${pair}&period=5m&limit=13`).catch(() => null),
  ]);
  if (!Array.isArray(raw)) throw new Error("Malformed candles");
  const bars = raw.filter(row => Array.isArray(row) && Number(row[6]) < now);
  if (bars.length < 85 || now-Number(bars.at(-1)[6]) > bar+2000) throw new Error("Insufficient or stale closed candles");
  for (let i=0;i<bars.length;i++) {
    const row=bars[i]; const [open,high,low,close,volume]=row.slice(1,6).map(Number);
    if (![open,high,low,close,volume].every(Number.isFinite) || Math.min(open,high,low,close)<=0 || volume<0 || high<Math.max(open,close) || low>Math.min(open,close)
      || Number(row[6])-Number(row[0])!==bar-1 || (i>0 && Number(row[0])-Number(bars[i-1][0])!==bar)) throw new Error("Invalid or gapped candles");
  }
  const last = bars.at(-1), close = Number(last[4]);
  const hour = bars.slice(-4).reduce((sum,row) => sum+Number(row[5]),0);
  const priorHourAverage = bars.slice(-84,-4).reduce((sum,row) => sum+Number(row[5]),0)/20;
  const funding = rows(fundingResult).filter(row => Number(row.fundingTime)<=now && stmNumber(row.fundingRate)!==null).sort((a,b)=>Number(a.fundingTime)-Number(b.fundingTime));
  const normalized = funding.slice(1).map((row,index) => ({at:Number(row.fundingTime), rate:Number(row.fundingRate)/((Number(row.fundingTime)-Number(funding[index].fundingTime))/3600000)}));
  const current = normalized.at(-1), past = normalized.slice(0,-1);
  const percentile = current && now-current.at<=9*3600000 && past.length>=50 && normalized.every(row=>Number.isFinite(row.rate)) ? past.filter(row=>row.rate<=current.rate).length/past.length*100 : null;
  const oi = rows(oiResult).filter(row => Number(row.timestamp)<=now).sort((a,b)=>Number(a.timestamp)-Number(b.timestamp));
  const first = oi[0], latest = oi.at(-1);
  const oiValid = first && latest && oi.length>=12 && now-Number(latest.timestamp)<=10*60000 && Number(latest.timestamp)-Number(first.timestamp)>=55*60000
    && oi.every((row,index)=>stmNumber(row.sumOpenInterest)!==null && Number(row.sumOpenInterest)>0 && (!index || Number(row.timestamp)-Number(oi[index-1].timestamp)===300000));
  return { symbol, asOf: new Date(Number(last[6])).toISOString(), close,
    breakout: close > Math.max(...bars.slice(-21,-1).map(row=>Number(row[2]))), volumeRatio: priorHourAverage>0 ? hour/priorHourAverage : 0,
    fundingPercentile: percentile, oiQuantityChange: oiValid ? (Number(latest.sumOpenInterest)/Number(first.sumOpenInterest)-1)*100 : null,
    priceChange: (close/Number(bars.at(-5)[4])-1)*100, complete: true };
}
