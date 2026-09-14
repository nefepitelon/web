export type Market = "ashare" | "crypto";
export type CryptoScanMode = "crypto" | "crypto-radar" | "crypto-mainstream";
export type ScanMode = "market" | "quick" | "pool" | CryptoScanMode;
export function isCryptoScanMode(mode: ScanMode): mode is CryptoScanMode { return mode === "crypto" || mode === "crypto-radar" || mode === "crypto-mainstream"; }
export interface Bar { date: string; open: number; high: number; low: number; close: number; volume: number }
export interface Quote { symbol: string; name: string; price: number; changePct: number; turnoverPct?: number; volumeRatio?: number; source: string; asOf: string }
export interface Stock { symbol: string; name: string; sourceRank?: number }
export interface Topic { name: string; changePct: number; source: string }
export interface Box { low: number; high: number; tests: number; testDates: string[]; positionPct: number; spanPct: number; startDate: string; endDate: string; endIndex: number }
export interface Volume { days: number; ratio: number; ratios: number[] }
export interface Flow { net5d: number | null; positiveDays: number; state: "流入" | "偏流入" | "流出" | "无数据" }
export interface Control { level: "高" | "中" | "低"; holderChangePct: number | null; date: string | null; note: string }
export interface Condition { key: string; label: string; points: number; maximum: number; passed: boolean; detail: string }
export interface Candidate { symbol: string; name: string; market: Market; quote: Quote; box: Box | null; volume: Volume; flow: Flow | null; control: Control | null; concepts: string[]; matchedTopics: string[]; score: number; conditions: Condition[]; qualified: boolean; status: string; dataWarnings: string[]; scannedAt: string }
export interface Settings { pool: Stock[]; sectors: string[]; auto: boolean; autoTimes: string[]; telegramEnabled: boolean; telegramChat: string; telegramConfigured: boolean }
export interface ScanJob { id: string; mode: ScanMode; status: "queued" | "running" | "complete" | "cancelled" | "failed"; total: number; processed: number; qualified: number; errors: number; startedAt: string; completedAt: string | null; logs: string[] }
export interface DashboardState {
  settings: Settings; job: ScanJob | null; stocks: Candidate[]; crypto: Candidate[]; cryptoSourceMode?: CryptoScanMode;
  topics: Topic[]; asOf: string | null; signedIn: boolean; error?: string;
  stockVersion?: string | null; cryptoVersion?: string | null; stockUnchanged?: boolean; cryptoUnchanged?: boolean;
}
export type Command = { action: "scan"; mode: ScanMode } | { action: "cancel" } | { action: "pool-add"; symbol: string; name?: string } | { action: "pool-remove"; symbol: string } | { action: "settings"; sectors?: string[]; auto?: boolean; autoTimes?: string[]; telegramEnabled?: boolean; telegramChat?: string; telegramToken?: string } | { action: "telegram-test" };
