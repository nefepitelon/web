export type PerpdexStatus = 'live' | 'stale' | 'unavailable';

export interface PerpdexSource {
  id: string;
  name: string;
  url: string;
  status: PerpdexStatus;
  /** Retrieval time; not a promise that upstream metrics were measured at this instant. */
  fetchedAt: string | null;
  /** Provider measurement time, only when the public response publishes one. */
  updatedAt: string | null;
  error?: string;
}

export interface PerpdexExchange {
  id: string;
  name: string;
  category: 'dex' | 'hip3' | 'cex';
  parentId?: string;
  oiIncludesChildren?: boolean;
  oiUsd: number | null;
  volume24hUsd: number | null;
  tvlUsd: number | null;
  markets: number | null;
  makerFeePct: number | null;
  takerFeePct: number | null;
  maxLeverage: number | null;
  tradeUrl: string;
  sourceUrl: string;
  /** Last successful observation of the primary market source. */
  updatedAt: string | null;
  status: PerpdexStatus;
  color?: string;
  metadataAsOf?: string;
  metadataSourceUrl?: string;
  metadataOfficialUrl?: string;
  /** Upstream venue observation, when published independently of retrieval time. */
  observedAt?: string;
  productLabel?: string;
  tradingStatus?: 'active' | 'closed';
  feePromotion?: { baseMakerFeePct: number; baseTakerFeePct: number; until: string | null };
  fieldSources?: Partial<Record<'oiUsd' | 'volume24hUsd' | 'tvlUsd' | 'markets' | 'maxLeverage', string>>;
  fieldStatus?: Partial<Record<'oiUsd' | 'volume24hUsd' | 'tvlUsd' | 'markets' | 'maxLeverage', PerpdexStatus>>;
}

export interface PerpdexBoxSnapshot {
  generatedAt: string;
  refreshIntervalSeconds: number;
  exchanges: PerpdexExchange[];
  sources: PerpdexSource[];
  warnings: string[];
}

export type Snapshot = PerpdexBoxSnapshot;
