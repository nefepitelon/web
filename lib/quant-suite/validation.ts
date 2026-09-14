import { z } from "zod";
import { QUANT_ENGINE_IDS, type QuantEngineId } from "./catalog";

export const quantConfigSchema = z.object({
  name: z.string().trim().min(1).max(80),
  mode: z.enum(["paper", "live"]),
  exchange: z.string().regex(/^[a-z][a-z0-9_-]{1,39}$/),
  symbols: z.array(z.string().regex(/^[A-Z0-9][A-Z0-9/:._-]{1,39}$/)).min(1).max(20).refine(s => new Set(s).size === s.length, "交易品种不能重复"),
  timeframe: z.enum(["1m", "5m", "15m", "30m", "1h", "4h", "1d"]),
  strategy: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,79}$/),
  stakeAmount: z.number().finite().min(5).max(100000),
  maxOpenTrades: z.number().int().min(1).max(20),
  stopLossPct: z.number().finite().min(0.1).max(25),
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
}).strict().refine(value => (!value.startDate && !value.endDate) || Boolean(value.startDate && value.endDate && value.startDate < value.endDate), "回测开始日期必须早于结束日期");
export type QuantConfig = z.infer<typeof quantConfigSchema>;
export const quantCommandSchema = z.object({
  engine: z.enum(QUANT_ENGINE_IDS),
  action: z.enum(["save-config", "preflight", "start", "stop", "backtest", "optimize"]),
  config: quantConfigSchema.optional(),
  requestId: z.string().uuid(),
  confirmation: z.string().max(100).optional(),
}).strict();
export type QuantCommand = z.infer<typeof quantCommandSchema>;
export function defaultQuantConfig(engine: QuantEngineId): QuantConfig {
  return { name: `${engine} 工作区`, mode: "paper", exchange: "binance", symbols: ["BTC/USDT", "ETH/USDT"], timeframe: "1h", strategy: "default", stakeAmount: 100, maxOpenTrades: 2, stopLossPct: 2 };
}
export function hasQuantAccess(viewer: {status: string; role: string; plan: string; needsSecondFactor: boolean} | null) {
  return Boolean(viewer && viewer.status === "ACTIVE" && (viewer.role === "admin" || viewer.plan === "max") && !viewer.needsSecondFactor);
}
export function hasQuantLiveAccess(viewer: {status: string; role: string; plan: string; needsSecondFactor: boolean; twoFactorEnabled: boolean; twoFactorPassed: boolean} | null) {
  return hasQuantAccess(viewer) && Boolean(viewer?.role === "admin" && viewer.twoFactorEnabled && viewer.twoFactorPassed);
}
