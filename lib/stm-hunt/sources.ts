import "server-only";
import { buildAlphaScanSnapshot } from "../../api/alpha-scan.js";
import type { StmCandidate, StmHolding, StmMarketEvidence, StmSharedHolding, StmSource, StmTradeEvent, StmTrader } from "./types";

type Obj = Record<string, any>;
const WSM = "https://web3smartmoney.com";
const RADAR = "https://traderadar.qianyuwing.com";
const obj = (value: unknown): Obj => value && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
const rows = (value: unknown): Obj[] => Array.isArray(value) ? value.filter(row => row && typeof row === "object" && !Array.isArray(row)) : [];
const str = (value: unknown, fallback = "") => typeof value === "string" ? value.slice(0, 256) : fallback;
export function stmNumber(value: unknown): number | null {
  if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && !value.trim())) return null;
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
export function stmPublicUrl(value: unknown, base?: string): string | null {
  if (typeof value !== "string" || !value.trim() || value.length > 2048) return null;
  try {
    const url = base ? new URL(value, base) : new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
const text = (...values: unknown[]) => values.map(value => str(value).trim()).find(Boolean) || null;
const nonnegative = (value: unknown) => { const number=stmNumber(value);return number!==null && number>=0 ? number : null; };
function explorer(chain: string | null, address: string | null): string | null {
  if (!chain || !address) return null;
  if (chain === "solana" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return `https://solscan.io/account/${address}`;
  const hosts:Record<string,string>={bsc:"bscscan.com",ethereum:"etherscan.io",base:"basescan.org",arbitrum:"arbiscan.io"};
  return hosts[chain] && /^0x[0-9a-fA-F]{40}$/.test(address) ? `https://${hosts[chain]}/address/${address}` : null;
}
async function json(url: string, token?: string): Promise<unknown> {
  // Fixed public feed URLs only. A minute bucket avoids stale intermediary objects
  // without generating a new unbounded URL for every browser polling request.
  const target = new URL(url);
  if (target.origin === WSM) target.searchParams.set("stm_check", String(Math.floor(Date.now()/60000)));
  const response = await fetch(target.href, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
    headers: { Accept: "application/json", "User-Agent": "STM-hunt/1.0", "Cache-Control":"no-cache", Pragma:"no-cache", ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.text();
  if (body.length > 12_000_000) throw new Error("Snapshot exceeds size limit");
  return JSON.parse(body);
}
export interface StmSourceCapture {
  asOf: string; sources: StmSource[]; traders: StmTrader[]; candidates: StmCandidate[];
  events: StmTradeEvent[]; markets: StmMarketEvidence[];
  schemaVersion?: number;
  sharedHoldings?: StmSharedHolding[];
}

export function normalizeStmSharedHoldings(raw: unknown, sourceUpdatedAt: string | null): StmSharedHolding[] {
  const found=new Map<string,StmSharedHolding>();
  for(const token of rows(obj(raw).shared_tokens).slice(0,100)) {
    const chain=str(token.chain).trim().toLowerCase(),rawAddress=str(token.address).trim();
    if(!/^[a-z0-9-]{1,40}$/.test(chain) || !(chain==="solana"?/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(rawAddress):/^0x[0-9a-fA-F]{40}$/.test(rawAddress)))continue;
    const address=/^0x/i.test(rawAddress)?rawAddress.toLowerCase():rawAddress,id=stmAsset(chain,address),info=obj(token.info);
    const holders=new Map<string,StmSharedHolding["holders"][number]>();
    for(const holder of rows(token.holders).slice(0,1000)) {
      const reference=text(holder.id);if(!reference)continue;
      const rawWallet=text(holder.wallet,holder.address),wallet=rawWallet && (/^0x[0-9a-fA-F]{40}$/.test(rawWallet)||/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(rawWallet))?(/^0x/i.test(rawWallet)?rawWallet.toLowerCase():rawWallet):null;
      const holderId=`wsm:fomo:${reference}`;
      holders.set(holderId,{id:holderId,name:text(holder.name),valueUsd:nonnegative(holder.usd),wallet});
    }
    const links=new Map<string,{label:string;url:string}>();
    for(const link of [...rows(info.websites),{label:"X",url:info.twitter},{label:"Telegram",url:info.telegram},{label:"DEX",url:info.dex_url}]) {
      const url=stmPublicUrl(link.url);if(url)links.set(url,{label:text(link.label)??"Website",url});
    }
    const reported=[...holders.values()];
    found.set(id,{id,chain,address,symbol:str(token.symbol),name:text(token.name,token.symbol)??address,
      logoUrl:stmPublicUrl(token.logo),priceUsd:nonnegative(token.price),totalValueUsd:nonnegative(token.total_usd),
      holdersCount:reported.length,holderIds:reported.map(holder=>holder.id),holders:reported,wallets:[...new Set(reported.map(holder=>holder.wallet).filter((wallet):wallet is string=>!!wallet))],
      socialLinks:[...links.values()].slice(0,12),description:typeof info.description==="string"?info.description.slice(0,1600):null,
      sourceId:"wsm-fomo",sourceUpdatedAt:stmTimestamp(sourceUpdatedAt),reported:true,scope:"source-reported"});
  }
  return [...found.values()];
}

function normalizeHolding(row: Obj, board: string, defaultChain: string | null): StmHolding | null {
  const symbol = str(row.symbol ?? row.coin).replace(/USDT$/, "");
  if (!symbol) return null;
  const chain = board === "pump" ? (Number(row.chainId) === 1399811149 ? "solana" : Number(row.chainId) === 4663 ? "robinhood" : `chain:${row.chainId}`) : str(row.chain, defaultChain ?? "") || null;
  const address = str(row.mint ?? row.address ?? row.tokenAddress) || null;
  const side = row.side === "short" ? "short" : row.side === "long" ? "long" : ["hl", "lighter", "binance"].includes(board) ? "long" : "spot";
  return { asset: side === "spot" ? (chain && address ? stmAsset(chain, address) : `unknown:${board}:${chain}:${symbol}`) : `cex:${symbol}`,
    symbol, chain, address, side, quantity: stmNumber(row.size ?? row.held ?? row.quantity), valueUsd: stmNumber(row.valueUsd ?? row.usd ?? row.notional),
    name: text(row.name), logoUrl: stmPublicUrl(row.logo ?? row.image, `${WSM}/${board}/`),
    priceUsd: nonnegative(row.priceUsd ?? row.price), pnlUsd: stmNumber(row.pnlUsd ?? row.uPnl),
    weightPct: null, explorerUrl: stmPublicUrl(row.tokenUrl) ?? explorer(chain,address) };
}

export function normalizeStmRoster(board: string, raw: unknown, holdingsRaw: unknown, updatedHint: string | null, fetchedAt = new Date().toISOString()): StmTrader[] {
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
    const rawHandle=text(row.handle,row.xUsername,row.twitter),handle=rawHandle && /^@?[A-Za-z0-9_]{1,15}$/.test(rawHandle) ? rawHandle.replace(/^@/,"") : null;
    const xUrl=stmPublicUrl(row.xUrl ?? row.twitterUrl) ?? (handle?`https://x.com/${handle}`:null);
    const fomoTotal=nonnegative(row.total_usd);
    // Several FOMO rows are an uncollected empty placeholder, not observed zero balances.
    const totalValueUsd=board==="fomo"?(fomoTotal===0 && (stmNumber(row.evm_usd)??0)===0 && (stmNumber(row.sol_usd)??0)===0 && !updatedAt && !normalized.length && !rows(row.chains).length ? null : fomoTotal):board==="hl"?nonnegative(hl.accountValue):["binance","lighter"].includes(board)?nonnegative(row.assetsUsd):null;
    const visible=hidden?[]:normalized;
    const knownTotal=visible.reduce((sum,holding)=>sum+(holding.valueUsd??0),0);
    for(const holding of visible)holding.weightPct=holding.valueUsd!==null && knownTotal>0 ? holding.valueUsd/knownTotal*100 : null;
    const reportedChains=rows(row.chains).filter(chain=>text(chain.chain)).map(chain=>({chain:str(chain.chain),valueUsd:nonnegative(chain.usd),holdingsCount:visible.filter(holding=>holding.chain===chain.chain).length}));
    const disclosedChains=[...new Set(visible.map(holding=>holding.chain).filter((chain):chain is string=>!!chain))].map(chain=>{
      const holdings=visible.filter(holding=>holding.chain===chain),values=holdings.map(holding=>holding.valueUsd).filter((value):value is number=>value!==null);
      return {chain,valueUsd:values.length?values.reduce((sum,value)=>sum+value,0):null,holdingsCount:holdings.length};
    });
    const wallets:NonNullable<StmTrader["wallets"]>=[];
    if(board==="fomo") {
      if(/^0x[0-9a-fA-F]{40}$/.test(str(row.evm)))wallets.push({chain:"evm",address:str(row.evm).toLowerCase(),explorerUrl:null});
      if(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(str(row.sol)))wallets.push({chain:"solana",address:str(row.sol),explorerUrl:explorer("solana",str(row.sol))});
    } else if(address) {const chain=board==="pump"||board==="okx"?"solana":board==="hl"?"hyperliquid":board==="lighter"?"lighter":"unknown";wallets.push({chain,address,explorerUrl:explorer(chain,address)});}
    return { id: `wsm:${board}:${reference || address}`, source: `wsm-${board}`, venue: board,
      name: text(row.name,row.displayName,row.username,row.label) ?? address ?? reference, address,
      pnlUsd, roi: stmNumber(row.roi ?? row.pnlPercent), winRate: winRate !== null && board === "binance" ? winRate * 100 : winRate,
      pnlWindow: board === "pump" ? "2026-07-01 起，已实现+未实现" : board === "okx" ? "3M" : board === "fomo" ? "All time（WSM 来源快照）" : "All time，跨平台不可比",
      updatedAt, holdings: visible,
      visibility: hidden ? "private" : truncated ? "truncated" : normalized.length ? "public" : "empty",
      tags: [...(Array.isArray(row.labels) ? row.labels.map((tag: unknown) => str(tag)) : []), ...(row.tag ? [str(row.tag)] : [])].slice(0, 12),
      // A public leaderboard or a KOL tag alone does not establish execution quality.
      qualified: false,
      avatarUrl: stmPublicUrl(row.avatar ?? row.profileImage, `${WSM}/${board}/`),handle,profileUrl:stmPublicUrl(row.profileUrl),
      socialLinks:xUrl?[{label:"X",url:xUrl}]:[],rank:nonnegative(row.rank ?? row.official_rank ?? obj(row.ranks).overall),
      totalValueUsd,totalValueLabel:["fomo","pump","okx"].includes(board)?"来源钱包资产":"来源账户权益",valueBasis:["fomo","pump","okx"].includes(board)?"wallet":"account-equity",
      holdingsCount:nonnegative(board==="hl"?hl.legCount:board==="pump"?detail.quality:row.openCount ?? row.positionsCount),
      chains:hidden?[]:reportedChains.length?reportedChains:disclosedChains,chainsScope:reportedChains.length?"reported":"disclosed",
      sourceUpdatedAt:updatedAt??updatedHint,fetchedAt,wallets,bio:text(row.introduction),
      fomoUid:board==="fomo" && typeof row.fomo_id==="string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.fomo_id)?row.fomo_id.toLowerCase():null,
      fomoHandle:board==="fomo" && typeof row.fomo_api_handle==="string" && /^[A-Za-z0-9_]{1,64}$/.test(row.fomo_api_handle)?row.fomo_api_handle:null };
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
      const updatedAt = stmTimestamp(data.fetchedAt ?? data.scannedAt ?? data.sourceUpdatedAtUnix ?? data.dataUpdatedAt ?? data.builtAt ?? data.captured_at);
      const checkedAt=new Date().toISOString();
      sources.push({ id: job.id, name: job.name, url: job.url, status: "ok", fetchedAt: checkedAt, checkedAt, checkIntervalSeconds:60, timestampBasis:updatedAt?"source":"unknown", updatedAt,
        count: rows(data.traders ?? data.data ?? data.items ?? data.activity ?? data.signals).length, latencyMs: Date.now() - start,
        semantics: job.semantics, message: job.semantics === "snapshot" ? "快照观察；不冒充逐笔交易" : job.semantics === "context" ? "研究背景；不用于精确成交触发" : "已连接" });
    } catch (error) {
      const restricted = error instanceof Error && /HTTP 40[13]/.test(error.message);
      sources.push({ id: job.id, name: job.name, url: job.url, status: restricted ? "restricted" : "unavailable", fetchedAt: new Date().toISOString(), checkedAt:new Date().toISOString(),checkIntervalSeconds:60,timestampBasis:"unknown", updatedAt: null,
        count: 0, latencyMs: Date.now() - start, semantics: job.semantics, message: restricted ? "需数据源授权；未绕过访问限制" : "上游暂不可用；不填充模拟数据" });
    }
  }));
  const version = obj(obj(values["wsm-version"]).sources);
  for(const board of ["pump","binance","lighter","okx"]) {
    const source=sources.find(row=>row.id===`holdings-${board}`)!;
    const raw=obj(values[`holdings-${board}`]);
    source.count=Object.keys(obj(raw.holdings??raw)).length;
    if(source.status==="ok" && !source.updatedAt) {source.updatedAt=stmTimestamp(version[board]);source.timestampBasis=source.updatedAt?"version":"unknown";source.message="公开持仓已检查；仓位时间无时区或未知，关联版本时间仅供研究";}
  }
  for (const board of ["fomo", "hl", "pump", "binance", "lighter", "okx"]) {
    const normalized = normalizeStmRoster(board, values[`wsm-${board}`], values[`holdings-${board}`], stmTimestamp(version[board]),sources.find(row=>row.id===`wsm-${board}`)?.fetchedAt??asOf);
    traders.push(...normalized);
    const status = sources.find(row => row.id === `wsm-${board}`)!;
    if (status.status === "ok") {
      const times = normalized.map(row => row.updatedAt).filter((value): value is string => !!value).sort();
      status.updatedAt = times.at(-1) ?? stmTimestamp(version[board]); status.count = normalized.length;
      status.timestampBasis=times.length?"source":status.updatedAt?"version":"unknown";
      if (!status.updatedAt || Date.parse(asOf) - Date.parse(status.updatedAt) > 3 * 3600_000) { status.status = "stale"; status.message = status.updatedAt?"已重新检查公开源；上游尚未更新，数据超过三小时，仅供历史研究":"源时间未知，仅供历史研究"; }
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
      qualified: winRate !== null && winRate >= 50 && mdd !== null && mdd > 0 && mdd <= 40 && score !== null && score >= 60 && firstSeen !== null && Date.parse(asOf) - Date.parse(firstSeen) >= 30 * 86400_000,
      avatarUrl:stmPublicUrl(row.avatar_url ?? row.avatar),handle:null,profileUrl:stmPublicUrl(row.profile_url),socialLinks:[],rank:null,totalValueUsd:null,holdingsCount:null,chains:[],sourceUpdatedAt:stmTimestamp(row.updated_at),fetchedAt:asOf });
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
  const sharedHoldings=normalizeStmSharedHoldings(values["wsm-fomo"],stmTimestamp(version.fomo));
  for (const token of sharedHoldings) {
    tokenMap.set(token.id, { id:token.id, symbol:token.symbol, name:token.name, address:token.address, chain:token.chain,
      market: "onchain", sources: ["wsm-fomo"], price:token.priceUsd, change24h: null, volumeUsd: null, liquidityUsd: null, score: 0, bias: "observe", reason: "FOMO 共同持有快照；非新买入", updatedAt:token.sourceUpdatedAt, risk: "unknown", holders:token.holdersCount });
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
  const completedAt=new Date().toISOString();
  for(const source of sources) {
    source.sourceAgeSeconds=source.updatedAt?Math.max(0,Math.floor((Date.parse(completedAt)-Date.parse(source.updatedAt))/1000)):null;
    if(source.status==="ok" && source.url.startsWith(WSM) && (!source.updatedAt || (source.sourceAgeSeconds??0)>3*3600)) {
      source.status="stale";source.message=source.updatedAt?"已重新检查公开源；上游尚未更新，数据超过三小时，仅供历史研究":"上游未提供可靠更新时间，仅供观察";
    }
  }
  return { asOf:completedAt, schemaVersion:2, sharedHoldings, sources: sources.sort((a,b) => jobs.findIndex(row => row.id === a.id)-jobs.findIndex(row => row.id === b.id)), traders, candidates, events, markets };
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
