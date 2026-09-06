import type { GridParams, VenueSnapshot } from "./types";

const EXTENDED_CAPACITY_RESERVE = 0.9;

export type LiveSizing = {
  equityUsd: number;
  /** Extended 账户当前真实杠杆；用于定档，不能只拿来估算旧单占用。 */
  leverage?: number;
  liveEquityUsd?: number;
  availableForTradeUsd?: number;
  recoverableOrderMarginUsd?: number;
  capacityUsd?: number;
};

function finiteNonNegative(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * 实盘优先使用交易所实时权益，并为 Extended 预留 10% 可交易保证金。
 * Extended 的中性网格上下各半，初始保证金取多/空风险较大的一侧，
 * 因此把可承受的单侧保证金换算成两侧总网格预算时乘 2。
 */
export function resolveLiveSizing(
  base: GridParams,
  snap: VenueSnapshot
): LiveSizing {
  const liveEquityUsd = finiteNonNegative(snap.equityUsd);
  let equityUsd =
    liveEquityUsd != null && liveEquityUsd > 0
      ? Math.min(base.equityUsd, liveEquityUsd)
      : base.equityUsd;

  const result: LiveSizing = { equityUsd, liveEquityUsd };
  if (snap.venue !== "extended") return result;

  const availableForTradeUsd = finiteNonNegative(snap.availableForTradeUsd);
  const reportedLeverage = Number(snap.leverage);
  // 配置值是目标/上限；交易所账户的当前值才决定真实初始保证金。
  // GRID_SKIP_LEVERAGE=1 或交易所未接受调杠杆时，两者可能不同。
  const leverage =
    reportedLeverage > 0
      ? Math.min(base.leverage, reportedLeverage)
      : base.leverage;
  result.leverage = leverage;
  if (availableForTradeUsd == null || !(leverage > 0) || !(snap.mid > 0)) {
    return result;
  }

  const positionValue = Number(snap.position || 0) * snap.mid;
  let buyValue = 0;
  let sellValue = 0;
  for (const order of snap.openOrders) {
    const value = Math.max(0, Number(order.price) * Number(order.size));
    if (order.side === "buy") buyValue += value;
    else sellValue += value;
  }
  const withOrders =
    Math.max(
      Math.abs(positionValue + buyValue),
      Math.abs(positionValue - sellValue)
    ) / leverage;
  const withoutOrders = Math.abs(positionValue) / leverage;
  const recoverableOrderMarginUsd = Math.max(0, withOrders - withoutOrders);
  const capacityUsd = availableForTradeUsd + recoverableOrderMarginUsd;
  const sideFactor = base.mode === "neutral" ? 2 : 1;
  const capacityEquity =
    base.marginFraction > 0
      ? (capacityUsd * EXTENDED_CAPACITY_RESERVE * sideFactor) /
        base.marginFraction
      : 0;
  equityUsd = Math.min(equityUsd, Math.max(0, capacityEquity));

  return {
    equityUsd,
    leverage,
    liveEquityUsd,
    availableForTradeUsd,
    recoverableOrderMarginUsd,
    capacityUsd,
  };
}
