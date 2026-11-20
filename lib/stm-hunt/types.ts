export type StmStrategyId = "S1" | "S2" | "S3" | "S4" | "S5";
export type StmSourceStatus = "ok" | "stale" | "unavailable" | "restricted";
export interface StmSource {
  id: string; name: string; url: string; status: StmSourceStatus; fetchedAt: string;
  updatedAt: string | null; count: number; latencyMs: number; message: string;
  semantics: "snapshot" | "market" | "events" | "context";
}
export interface StmHolding {
  asset: string; symbol: string; chain: string | null; address: string | null;
  quantity: number | null; valueUsd: number | null; side: "long" | "short" | "spot";
}
export interface StmTrader {
  id: string; source: string; venue: string; name: string; address: string | null;
  pnlUsd: number | null; roi: number | null; winRate: number | null;
  pnlWindow: string; updatedAt: string | null; holdings: StmHolding[];
  visibility: "public" | "private" | "empty" | "truncated";
  tags: string[]; qualified: boolean; clusterId?: string | null;
}
export interface StmCandidate {
  id: string; symbol: string; name: string; address: string | null; chain: string | null;
  market: "cex" | "onchain"; sources: string[]; price: number | null;
  change24h: number | null; volumeUsd: number | null; liquidityUsd: number | null;
  score: number; bias: string; reason: string; updatedAt: string | null;
  risk: "unknown" | "pass" | "blocked"; holders: number;
}
export interface StmTradeEvent {
  id: string; traderId: string; asset: string; symbol: string; side: "long" | "short" | "spot";
  action: "open" | "add" | "reduce" | "close" | "swap-buy" | "swap-sell";
  occurredAt: string; exact: boolean; qualified: boolean; quantity: number | null;
  clusterId: string | null; chain?: string; address?: string; verified?: boolean;
}
export interface StmChainEvent extends StmTradeEvent {
  chain: string; address: string; verified: boolean; liquidityUsd: number | null;
  riskPassed: boolean; routeAvailable: boolean; transactionHash: string;
  // Provider timestamps are not receipt verification. Root ingestion verifies transactions.
  retained?: boolean;
}
export interface StmMarketEvidence {
  symbol: string; asOf: string; close: number; breakout: boolean; volumeRatio: number;
  fundingPercentile: number | null; oiQuantityChange: number | null; priceChange: number;
  complete: boolean;
}
export interface StmStrategy {
  id: StmStrategyId; name: string; description: string; version: number; enabled: boolean;
  minEntities: number; windowMinutes: number; minVolumeRatio: number; minLiquidityUsd: number;
}
export interface StmSignal {
  id: string; strategy: StmStrategyId; strategyVersion: number; candidateId: string; symbol: string;
  status: "ready" | "watch" | "blocked" | "risk"; direction: "long" | "exit" | "observe";
  score: number; entities: number; reasons: string[]; missing: string[]; asOf: string;
  expiresAt: string; actionable: boolean;
}
export interface StmSnapshot { asOf: string; traders: StmTrader[]; candidates: StmCandidate[] }
export type StmHistoryTrader = Pick<StmTrader, "id" | "address" | "clusterId" | "updatedAt" | "visibility" | "qualified"> & {
  holdings: Pick<StmHolding, "asset" | "quantity" | "side">[];
};
export interface StmHistorySnapshot { asOf: string; traders: StmHistoryTrader[] }
export interface StmPaperPosition {
  id: string; candidateId: string; symbol: string; strategy: StmStrategyId; status: "open" | "closed";
  quantity: number; notionalUsd: number; entryPrice: number; exitPrice: number | null;
  feeBps: number; slippageBps: number; pnlUsd: number | null; openedAt: string; closedAt: string | null;
}
export interface StmAlert { id: string; symbol: string; strategy: StmStrategyId; message: string; createdAt: string; read: boolean }
export interface StmJournal { id: string; action: string; message: string; createdAt: string }
export interface StmReplay {
  id: string; createdAt: string; snapshots: number; start: string | null; end: string | null;
  signals: number; ready: number; feeBps: number; slippageBps: number;
  returns: number | null; message: string;
  performance?: { trades: number; winRate: number | null; maxDrawdownPct: number | null; netPnlUsd: number; initialEquityUsd: number; finalEquityUsd: number };
}
export interface StmState {
  authenticated: boolean; persistent: boolean; watchlist: string[]; paper: StmPaperPosition[];
  alerts: StmAlert[]; journal: StmJournal[]; replays: StmReplay[];
}
export interface StmDashboard {
  asOf: string; sources: StmSource[]; traders: StmTrader[]; candidates: StmCandidate[];
  signals: StmSignal[]; strategies: StmStrategy[];
  metrics: { traders: number; candidates: number; ready: number; watched: number; snapshots: number; paperPnlUsd: number };
  state: StmState;
  capabilities: { persistence: boolean; exactTraderEvents: boolean; onchainEvents: boolean; liveExecution: boolean; notes: string[] };
}
export type StmMutation =
  | { action: "refresh" }
  | { action: "watch"; id: string; enabled: boolean }
  | { action: "strategy"; strategy: Partial<StmStrategy> & { id: StmStrategyId } }
  | { action: "paper-open"; candidateId: string; strategy: StmStrategyId; notionalUsd: number; feeBps?: number; slippageBps?: number; idempotencyKey: string }
  | { action: "paper-close"; id: string }
  | { action: "replay"; feeBps?: number; slippageBps?: number }
  | { action: "alert-read"; id: string };
