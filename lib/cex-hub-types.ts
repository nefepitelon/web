export type CexStatus = 'live' | 'stale' | 'unavailable';

export interface CexSource {
  id: string;
  name: string;
  url: string;
  status: CexStatus;
  /** Successful retrieval time, distinct from an upstream measurement time. */
  fetchedAt: string | null;
  /** Null when the provider does not publish a measurement timestamp. */
  updatedAt: string | null;
  error?: string;
}

export type CexField = 'spotVolume24hUsd' | 'derivativesVolume24hUsd' | 'openInterestUsd' | 'spotMarkets' | 'derivativesMarkets' | 'coins' | 'trustScore' | 'trustRank' | 'country' | 'yearEstablished';

export interface CexExchange {
  id: string;
  name: string;
  centralized: true;
  url: string;
  logoUrl: string | null;
  spotVolume24hUsd: number | null;
  derivativesVolume24hUsd: number | null;
  openInterestUsd: number | null;
  spotMarkets: number | null;
  derivativesMarkets: number | null;
  coins: number | null;
  trustScore: number | null;
  trustRank: number | null;
  country: string | null;
  yearEstablished: number | null;
  /** True for an explicitly mapped product, not proof that public data is available. */
  hasSpot: boolean;
  hasDerivatives: boolean;
  status: CexStatus;
  updatedAt: string | null;
  sourceUrl: string;
  color?: string;
  fieldSources: Partial<Record<CexField, string>>;
  fieldStatus: Partial<Record<CexField, CexStatus>>;
  /** Provider-published field observation time; absent when the provider only exposes retrieval time. */
  fieldUpdatedAt?: Partial<Record<CexField, string>>;
  /** Public-source scope or product-identity explanation, never a replacement for numeric data. */
  fieldNotes?: Partial<Record<CexField, string>>;
}

export interface CexHubSnapshot {
  version: 1;
  generatedAt: string;
  refreshIntervalSeconds: number;
  exchanges: CexExchange[];
  sources: CexSource[];
  warnings: string[];
}
