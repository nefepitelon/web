import type { StmCandidate, StmHolding, StmRadarBoard, StmRadarPeriod, StmRadarTrader, StmRadarVenue, StmSharedHolding, StmTrader } from "./types";

/** Pure presentation model. It never creates strategy evidence or authorizes an order. */
export interface StmTerminalWalletEntry {
  key: string; chain: string; address: string; matchedTraderIds: string[]; sourceIds: string[];
  sourceUpdatedAt: string | null;
  observations: Array<{ traderId: string; sourceId: string; sourceUpdatedAt: string | null }>;
}
export interface StmTerminalSharedEntry extends StmSharedHolding {
  assetKey: string; candidate: StmCandidate | null; matchedTraderIds: string[]; unmatchedHolderIds: string[];
}
export interface StmTerminalHoldingEntry {
  key: string; traderId: string; assetKey: string | null; holding: StmHolding; candidate: StmCandidate | null;
  sourceId: string; sourceUpdatedAt: string | null;
}
export interface StmTerminalFilter {
  query?: string; chain?: string | null; holderIds?: readonly string[]; walletKey?: string | null;
}
export interface StmTerminalModelInput {
  board?: StmRadarBoard | null; traders?: readonly StmRadarTrader[];
  dashboardTraders?: readonly StmTrader[]; candidates?: readonly StmCandidate[]; sharedHoldings?: readonly StmSharedHolding[];
  venue?: StmRadarVenue; period?: StmRadarPeriod;
}
export interface StmTerminalModel {
  traders: StmRadarTrader[]; wallets: StmTerminalWalletEntry[]; sharedHoldings: StmTerminalSharedEntry[]; majorTokens: StmCandidate[];
  coverage: { traders: number; withAssets: number; withHoldings: number; withChains: number; wallets: number; reportedSharedTokens: number };
}

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SOL_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_CHAINS = new Set(["evm", "ethereum", "bsc", "base", "arbitrum", "optimism", "polygon", "avalanche", "hyperliquid", "lighter", "linea", "zksync", "blast", "scroll"]);
const CHAIN_ALIASES = new Map<string, string>(Object.entries({ eth: "ethereum", "1": "ethereum", bnb: "bsc", "bnb-chain": "bsc", "56": "bsc",
  sol: "solana", "501": "solana", "1399811149": "solana", "8453": "base", arb: "arbitrum", "42161": "arbitrum",
  op: "optimism", "10": "optimism", matic: "polygon", "137": "polygon", avax: "avalanche", "43114": "avalanche" }));
const MAJOR_SYMBOLS = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX", "LINK", "TON", "SUI", "HYPE"];
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
function canonicalChain(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const chain = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9:_-]{0,63}$/.test(chain) ? CHAIN_ALIASES.get(chain) ?? chain : null;
}
function canonicalAddress(chain: string, value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  // Contract addresses are never inferred from a token symbol or an account label.
  if (chain === "solana") return SOL_ADDRESS.test(value) ? value : null;
  if (EVM_ADDRESS.test(value)) return value.toLowerCase();
  // Other explicitly named chains may also use base58; preserve their distinct namespace.
  return !EVM_CHAINS.has(chain) && SOL_ADDRESS.test(value) ? value : null;
}
/** Explicit aliases only; unknown chains remain distinct, Solana retains base58 case. */
export function stmTerminalAssetKey(chain: string | null | undefined, address: string | null | undefined): string | null {
  const normalizedChain = canonicalChain(chain);
  if (!normalizedChain) return null;
  const normalizedAddress = canonicalAddress(normalizedChain, address);
  return normalizedAddress ? `${normalizedChain}:${normalizedAddress}` : null;
}
export function matchStmTerminalCandidate(asset: Pick<StmHolding, "chain" | "address">, candidates: readonly StmCandidate[]): StmCandidate | null {
  const key = stmTerminalAssetKey(asset.chain, asset.address);
  if (!key) return null;
  const matches = candidates.filter(candidate => candidate.market === "onchain" && stmTerminalAssetKey(candidate.chain, candidate.address) === key);
  return matches.length === 1 ? matches[0] : null;
}

/** Keep the board's original identity, rank and period. An empty period is authoritative. */
export function normalizeStmTerminalTraders(rows: readonly StmTrader[], venue?: StmRadarVenue): StmRadarTrader[] {
  return rows.filter(row => !venue || row.venue === venue).map(row => {
    const trader = row as StmRadarTrader;
    const holdings = trader.visibility === "private" ? [] : trader.holdings.map(holding => ({ ...holding }));
    const chains = trader.visibility === "private" ? [] : (trader.chains ?? []).map(chain => ({ ...chain }));
    const missingFomoSnapshot = trader.venue === "fomo" && trader.totalValueUsd === 0 && !trader.updatedAt && !holdings.length && !chains.length;
    return { ...trader, holdings, chains,
      totalValueUsd: missingFomoSnapshot ? null : trader.totalValueUsd,
      wallets: trader.wallets?.map(wallet => ({ ...wallet })),
      socialLinks: trader.socialLinks?.map(link => ({ ...link })),
      detailReference: trader.detailReference ?? (trader.venue === "fomo" && /^wsm:fomo:[A-Za-z0-9_-]{1,100}$/.test(trader.id) ? trader.id : undefined),
      sourceTraderIds: trader.sourceTraderIds ? [...trader.sourceTraderIds] : trader.id.startsWith("wsm:") ? [trader.id] : undefined };
  });
}
function traderIds(trader: StmRadarTrader): string[] { return [...new Set([trader.id, ...(trader.sourceTraderIds ?? [])])]; }
function traderWallets(trader: StmRadarTrader): Array<{ chain: string; address: string; sourceId: string; sourceUpdatedAt: string | null }> {
  const explicit = (trader.wallets ?? []).flatMap(wallet => {
    const chain = canonicalChain(wallet.chain), key = stmTerminalAssetKey(wallet.chain, wallet.address);
    if (!chain || !key) return [];
    return [{ chain, address: canonicalAddress(chain, wallet.address)!, sourceId: wallet.sourceId ?? trader.source, sourceUpdatedAt: wallet.sourceUpdatedAt ?? null }];
  });
  if (explicit.length || !trader.address) return explicit;
  // A generic EVM wallet is not evidence of balances on every EVM chain.
  const chain = SOL_ADDRESS.test(trader.address) ? "solana" : EVM_ADDRESS.test(trader.address) ? ["hl", "lighter"].includes(trader.venue) ? trader.venue === "hl" ? "hyperliquid" : "lighter" : "evm" : null;
  return chain ? [{ chain, address: canonicalAddress(chain, trader.address)!, sourceId: trader.source, sourceUpdatedAt: null }] : [];
}
export function selectStmTerminalTrader(reference: string | { chain: string; address: string }, traders: readonly StmRadarTrader[]): StmRadarTrader | null {
  const key = typeof reference === "string" ? null : stmTerminalAssetKey(reference.chain, reference.address);
  if (typeof reference !== "string" && !key) return null;
  const matches = traders.filter(trader => typeof reference === "string" ? traderIds(trader).includes(reference)
    : traderWallets(trader).some(wallet => stmTerminalAssetKey(wallet.chain, wallet.address) === key));
  return matches.length === 1 ? matches[0] : null;
}
export function filterStmTerminalTraders(traders: readonly StmRadarTrader[], filter: StmTerminalFilter = {}): StmRadarTrader[] {
  const query = filter.query?.trim() ?? "", chain = canonicalChain(filter.chain), holders = filter.holderIds ? new Set(filter.holderIds) : null;
  const identityMatches = holders ? new Set([...holders].map(id => selectStmTerminalTrader(id, traders)?.id).filter((id): id is string => !!id)) : null;
  return traders.filter(trader => {
    if (identityMatches && !identityMatches.has(trader.id)) return false;
    const wallets = traderWallets(trader);
    if (filter.walletKey && !wallets.some(wallet => stmTerminalAssetKey(wallet.chain, wallet.address) === filter.walletKey)) return false;
    if (filter.chain && (!chain || ![...(trader.chains ?? []).map(row => canonicalChain(row.chain)), ...trader.holdings.map(row => canonicalChain(row.chain)), ...wallets.map(row => row.chain)].includes(chain))) return false;
    if (!query) return true;
    if (EVM_ADDRESS.test(query)) return wallets.some(wallet => wallet.address.toLowerCase() === query.toLowerCase());
    if (SOL_ADDRESS.test(query)) return wallets.some(wallet => wallet.address === query);
    return [trader.id, trader.name, trader.handle, trader.fomoHandle, ...trader.tags, ...trader.holdings.map(row => row.symbol)].some(value => value?.toLowerCase().includes(query.toLowerCase()));
  });
}
export function buildStmTerminalHoldings(trader: StmRadarTrader, candidates: readonly StmCandidate[] = []): StmTerminalHoldingEntry[] {
  if (trader.visibility === "private") return [];
  return trader.holdings.map((holding, index) => {
    const assetKey = stmTerminalAssetKey(holding.chain, holding.address);
    return { key: `${trader.id}:${assetKey ?? "unknown"}:${holding.side}:${index}`, traderId: trader.id, assetKey, holding: { ...holding },
      candidate: matchStmTerminalCandidate(holding, candidates), sourceId: holding.sourceId ?? trader.source,
      sourceUpdatedAt: holding.sourceUpdatedAt !== undefined ? holding.sourceUpdatedAt : trader.updatedAt ?? null };
  });
}
function buildWallets(traders: readonly StmRadarTrader[]): StmTerminalWalletEntry[] {
  const entries = new Map<string, StmTerminalWalletEntry>();
  for (const trader of traders) for (const wallet of traderWallets(trader)) {
    const key = stmTerminalAssetKey(wallet.chain, wallet.address)!;
    const entry: StmTerminalWalletEntry = entries.get(key) ?? { key, chain: wallet.chain, address: wallet.address, matchedTraderIds: [], sourceIds: [], sourceUpdatedAt: null, observations: [] };
    if (!entry.matchedTraderIds.includes(trader.id)) entry.matchedTraderIds.push(trader.id);
    if (!entry.sourceIds.includes(wallet.sourceId)) entry.sourceIds.push(wallet.sourceId);
    if (!entry.observations.some(observation => observation.traderId === trader.id && observation.sourceId === wallet.sourceId && observation.sourceUpdatedAt === wallet.sourceUpdatedAt)) {
      entry.observations.push({ traderId: trader.id, sourceId: wallet.sourceId, sourceUpdatedAt: wallet.sourceUpdatedAt });
    }
    const times = new Set(entry.observations.map(observation => observation.sourceUpdatedAt));
    entry.sourceUpdatedAt = times.size === 1 ? entry.observations[0].sourceUpdatedAt : null;
    entries.set(key, entry);
  }
  return [...entries.values()];
}
export function buildStmTerminalModel(input: StmTerminalModelInput): StmTerminalModel {
  const venue = input.venue ?? input.board?.venue ?? "fomo", period = input.period ?? input.board?.period ?? "all";
  const rows = input.board ? input.board.venue === venue && input.board.period === period ? input.board.traders : []
    : input.traders !== undefined ? input.traders : period === "all" ? input.dashboardTraders ?? [] : [];
  const traders = normalizeStmTerminalTraders(rows, venue), candidates = input.candidates ?? [], wallets = buildWallets(traders);
  const sharedHoldings = (input.sharedHoldings ?? []).flatMap<StmTerminalSharedEntry>(holding => {
    const assetKey = stmTerminalAssetKey(holding.chain, holding.address);
    if (!assetKey || holding.reported !== true || holding.scope !== "source-reported") return [];
    const matchedTraderIds = [...new Set(holding.holderIds.map(id => selectStmTerminalTrader(id, traders)?.id).filter((id): id is string => !!id))];
    return [{ ...holding, holderIds: [...holding.holderIds], holders: holding.holders.map(holder => ({ ...holder })), wallets: [...holding.wallets], socialLinks: holding.socialLinks.map(link => ({ ...link })),
      assetKey, candidate: matchStmTerminalCandidate(holding, candidates), matchedTraderIds,
      unmatchedHolderIds: holding.holderIds.filter(id => !selectStmTerminalTrader(id, traders)) }];
  });
  const majorTokens = candidates.filter(candidate => candidate.market === "cex" && MAJOR_SYMBOLS.includes(candidate.symbol.toUpperCase()))
    .sort((a, b) => MAJOR_SYMBOLS.indexOf(a.symbol.toUpperCase()) - MAJOR_SYMBOLS.indexOf(b.symbol.toUpperCase()));
  return { traders, wallets, sharedHoldings, majorTokens,
    coverage: { traders: traders.length, withAssets: traders.filter(trader => finite(trader.totalValueUsd)).length,
      withHoldings: traders.filter(trader => trader.holdings.length > 0).length, withChains: traders.filter(trader => (trader.chains?.length ?? 0) > 0).length,
      wallets: wallets.length, reportedSharedTokens: sharedHoldings.length } };
}
