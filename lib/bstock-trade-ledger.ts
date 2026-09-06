import {
  type AgenticWalletMarketOrder,
  normalizeAgenticWalletOrderStatus
} from "@/lib/bstock-agentic-wallet-order-status";

const PAY_TOKEN_ADDRESSES = {
  BNB: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
  USDT: "0x55d398326f99059fF775485246999027B3197955",
  USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
  U: "0xcE24439F2D9C6a2289F741120FE202248B666666",
  USD1: "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d"
} as const;

function safeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function multiplyDecimalStrings(left: string, right: string) {
  const parse = (value: string) => {
    const match = value.match(/^(\d+)(?:\.(\d+))?$/);
    if (!match) throw new Error("Invalid decimal value.");
    const fraction = match[2] || "";
    return { integer: BigInt(`${match[1]}${fraction}`), scale: fraction.length };
  };
  const a = parse(left);
  const b = parse(right);
  const scale = a.scale + b.scale;
  const digits = (a.integer * b.integer).toString().padStart(scale + 1, "0");
  const whole = scale ? digits.slice(0, -scale) : digits;
  const fraction = scale ? digits.slice(-scale).replace(/0+$/, "") : "";
  return `${whole}${fraction ? `.${fraction}` : ""}`;
}

type LedgerAsset = {
  symbol: string;
  ticker: string;
  contractAddress: string;
  multiplier: string;
  price: number | null;
};

type WalletPosition = {
  symbol: string;
  address: string;
  balance: number;
  balanceExact: string;
  price: number;
  valueUsd: number;
};

type Lot = { quantity: number; costPerShareUsd: number };

export type BstockOrderRecord = {
  id: string;
  orderId: string | null;
  intentHash?: string | null;
  source: "AGENTIC_WALLET" | "BSTOCK_ALPHA";
  mode?: string | null;
  side: "buy" | "sell";
  symbol: string;
  ticker: string;
  fromSymbol: string;
  toSymbol: string;
  fromAmount: string;
  toAmount: string;
  status: string;
  final: boolean;
  successful: boolean;
  txHash: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type BstockTradingLedger = {
  source: "Binance Agentic Wallet market order history";
  historyAvailable: boolean;
  historyComplete: boolean;
  fetchedOrders: number;
  totalOrders: number | null;
  positions: Array<{
    symbol: string;
    averageCostUsd: number | null;
    unrealizedPnlUsd: number | null;
    unrealizedReturnPct: number | null;
    costBasisStatus: "COMPLETE" | "INCOMPLETE" | "NO_HISTORY";
    costBasisReason: string | null;
  }>;
  realized: Array<{
    orderId: string | null;
    symbol: string;
    quantity: number;
    saleProceedsUsd: number | null;
    fifoCostUsd: number | null;
    realizedPnlUsd: number | null;
    status: string;
    txHash: string | null;
    completedAt: string | null;
  }>;
  summary: {
    realizedPnlUsd: number | null;
    saleProceedsUsd: number | null;
    fifoCostUsd: number | null;
    unrealizedPnlUsd: number | null;
    realizedReturnPct: number | null;
    realizedTradeCount: number | null;
    winningTradeCount: number | null;
    losingTradeCount: number | null;
    winRatePct: number | null;
    grossProfitUsd: number | null;
    grossLossUsd: number | null;
    profitFactor: number | null;
    profitFactorInfinite: boolean;
  };
  orders: BstockOrderRecord[];
};

const stableSymbols = new Set(["USDT", "USDC", "U", "USD1"]);

function normalizedAddress(value: string | undefined) {
  return String(value || "").trim().toLowerCase();
}

function normalizedSymbol(value: string | undefined) {
  return String(value || "").trim().toUpperCase();
}

function isoTimestamp(value: string | undefined) {
  if (!value) return null;
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 10_000_000_000 ? numeric * 1_000 : numeric)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function bstockQuantity(rawAmount: string | undefined, multiplier: string) {
  if (!rawAmount) return 0;
  try {
    return safeNumber(multiplyDecimalStrings(rawAmount, multiplier));
  } catch {
    return 0;
  }
}

function walletOrderRecord(
  order: AgenticWalletMarketOrder,
  asset: LedgerAsset,
  side: "buy" | "sell",
  shareAmount: number,
  paySymbol: string
): BstockOrderRecord {
  const status = normalizeAgenticWalletOrderStatus(order);
  const fromSymbol = side === "buy" ? paySymbol : asset.symbol;
  const toSymbol = side === "buy" ? asset.symbol : paySymbol;
  return {
    id: `agent:${order.orderId || order.txHash || `${asset.symbol}:${order.createdAt || "unknown"}`}`,
    orderId: order.orderId || null,
    source: "AGENTIC_WALLET",
    side,
    symbol: asset.symbol,
    ticker: asset.ticker,
    fromSymbol,
    toSymbol,
    fromAmount: side === "buy" ? String(order.fromAmount || "") : String(shareAmount || ""),
    toAmount: side === "buy" ? String(shareAmount || "") : String(order.toAmount || ""),
    status: status.status,
    final: status.final,
    successful: status.successful,
    txHash: order.txHash || null,
    createdAt: isoTimestamp(order.createdAt),
    updatedAt: isoTimestamp(order.updatedAt)
  };
}

export function buildBstockTradingLedger(input: {
  orders: AgenticWalletMarketOrder[];
  totalOrders: number | null;
  assets: LedgerAsset[];
  walletPositions: WalletPosition[];
  historyAvailable?: boolean;
}) : BstockTradingLedger {
  const assetByAddress = new Map(input.assets.map((asset) => [asset.contractAddress.toLowerCase(), asset]));
  const assetBySymbol = new Map(input.assets.map((asset) => [asset.symbol.toUpperCase(), asset]));
  const payByAddress = new Map(Object.entries(PAY_TOKEN_ADDRESSES).map(([symbol, address]) => [address.toLowerCase(), symbol]));
  const historyAvailable = input.historyAvailable !== false;
  const historyComplete = historyAvailable && (input.totalOrders == null || input.totalOrders <= input.orders.length);
  const lotsBySymbol = new Map<string, Lot[]>();
  const incompleteSymbols = new Set<string>();
  const seenBuySymbols = new Set<string>();
  const records: BstockOrderRecord[] = [];
  const realized: BstockTradingLedger["realized"] = [];

  const parsed = input.orders.flatMap((order, index) => {
    const fromAddress = normalizedAddress(order.fromToken);
    const toAddress = normalizedAddress(order.toToken);
    const fromAsset = assetByAddress.get(fromAddress) || assetBySymbol.get(normalizedSymbol(order.fromSymbol));
    const toAsset = assetByAddress.get(toAddress) || assetBySymbol.get(normalizedSymbol(order.toSymbol));
    const side = toAsset && !fromAsset ? "buy" : fromAsset && !toAsset ? "sell" : null;
    const asset = side === "buy" ? toAsset : side === "sell" ? fromAsset : null;
    if (!side || !asset) return [];
    const payAddress = side === "buy" ? fromAddress : toAddress;
    const paySymbol = payByAddress.get(payAddress)
      || normalizedSymbol(side === "buy" ? order.fromSymbol : order.toSymbol)
      || "UNKNOWN";
    const shareAmount = bstockQuantity(side === "buy" ? order.toAmount : order.fromAmount, asset.multiplier);
    const createdAt = isoTimestamp(order.createdAt);
    return [{
      order,
      index,
      asset,
      side: side as "buy" | "sell",
      paySymbol,
      shareAmount,
      createdAt,
    }];
  });

  parsed
    .slice()
    .sort((left, right) => {
      const leftTime = left.createdAt ? Date.parse(left.createdAt) : Number.NaN;
      const rightTime = right.createdAt ? Date.parse(right.createdAt) : Number.NaN;
      if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return left.index - right.index;
      return leftTime - rightTime;
    })
    .forEach(({ order, asset, side, paySymbol, shareAmount, createdAt }) => {
      const tradeSide: "buy" | "sell" = side === "sell" ? "sell" : "buy";
      records.push(walletOrderRecord(order, asset, tradeSide, shareAmount, paySymbol));
      const state = normalizeAgenticWalletOrderStatus(order);
      if (!state.successful) return;
      if (!createdAt || shareAmount <= 0) {
        incompleteSymbols.add(asset.symbol);
        return;
      }
      const lots = lotsBySymbol.get(asset.symbol) || [];
      lotsBySymbol.set(asset.symbol, lots);
      if (tradeSide === "buy") {
        seenBuySymbols.add(asset.symbol);
        const paid = safeNumber(order.fromAmount);
        if (!stableSymbols.has(paySymbol) || paid <= 0) {
          incompleteSymbols.add(asset.symbol);
          return;
        }
        lots.push({ quantity: shareAmount, costPerShareUsd: paid / shareAmount });
        return;
      }

      let remaining = shareAmount;
      let fifoCostUsd = 0;
      while (remaining > 1e-12 && lots.length) {
        const lot = lots[0];
        const consumed = Math.min(remaining, lot.quantity);
        fifoCostUsd += consumed * lot.costPerShareUsd;
        lot.quantity -= consumed;
        remaining -= consumed;
        if (lot.quantity <= 1e-12) lots.shift();
      }
      const hasFifoCost = remaining <= 1e-8 && !incompleteSymbols.has(asset.symbol);
      if (!hasFifoCost) incompleteSymbols.add(asset.symbol);
      const proceeds = stableSymbols.has(paySymbol) && safeNumber(order.toAmount) > 0
        ? safeNumber(order.toAmount)
        : null;
      realized.push({
        orderId: order.orderId || null,
        symbol: asset.symbol,
        quantity: shareAmount,
        saleProceedsUsd: proceeds,
        fifoCostUsd: hasFifoCost ? fifoCostUsd : null,
        realizedPnlUsd: proceeds != null && hasFifoCost ? proceeds - fifoCostUsd : null,
        status: state.status,
        txHash: order.txHash || null,
        completedAt: isoTimestamp(order.updatedAt) || createdAt
      });
    });

  const positions = input.walletPositions
    .filter((position) => position.balance > 0)
    .map((position) => {
      const asset = assetByAddress.get(position.address.toLowerCase()) || assetBySymbol.get(position.symbol.toUpperCase());
      const symbol = asset?.symbol || position.symbol;
      const lots = lotsBySymbol.get(symbol) || [];
      const lotQuantity = lots.reduce((sum, lot) => sum + lot.quantity, 0);
      const tolerance = Math.max(1e-8, position.balance * 1e-6);
      let reason: string | null = null;
      if (!historyAvailable) reason = "Agentic Wallet 成交历史暂不可用，平均成本保持留空。";
      else if (!historyComplete) reason = "订单历史超过本次完整拉取范围，无法可靠还原平均成本。";
      else if (incompleteSymbols.has(symbol)) reason = "存在非稳定币成交或无法匹配的买卖记录，成本保持留空。";
      else if (!seenBuySymbols.has(symbol)) reason = "持仓可能来自转入，订单历史中没有可验证的买入成本。";
      else if (Math.abs(lotQuantity - position.balance) > tolerance) reason = "订单历史与当前链上余额不一致，可能包含转入或转出。";
      const cost = reason ? null : lots.reduce((sum, lot) => sum + lot.quantity * lot.costPerShareUsd, 0);
      const averageCostUsd = cost != null && lotQuantity > 0 ? cost / lotQuantity : null;
      const unrealizedPnlUsd = averageCostUsd != null && position.price > 0
        ? (position.price - averageCostUsd) * position.balance
        : null;
      return {
        symbol,
        averageCostUsd,
        unrealizedPnlUsd,
        unrealizedReturnPct: averageCostUsd != null && averageCostUsd > 0 && position.price > 0
          ? (position.price / averageCostUsd - 1) * 100
          : null,
        costBasisStatus: averageCostUsd != null ? "COMPLETE" as const : seenBuySymbols.has(symbol) ? "INCOMPLETE" as const : "NO_HISTORY" as const,
        costBasisReason: reason
      };
    });

  const realizedComplete = historyAvailable && historyComplete && realized.every((row) => row.realizedPnlUsd != null);
  const positionPnlComplete = historyAvailable && historyComplete && positions.every((position) => position.unrealizedPnlUsd != null);
  const realizedPnlUsd = realizedComplete
    ? realized.reduce((sum, row) => sum + (row.realizedPnlUsd || 0), 0)
    : null;
  const saleProceedsUsd = realizedComplete
    ? realized.reduce((sum, row) => sum + (row.saleProceedsUsd || 0), 0)
    : null;
  const fifoCostUsd = realizedComplete
    ? realized.reduce((sum, row) => sum + (row.fifoCostUsd || 0), 0)
    : null;
  const winningTradeCount = realizedComplete
    ? realized.filter((row) => (row.realizedPnlUsd || 0) > 0).length
    : null;
  const losingTradeCount = realizedComplete
    ? realized.filter((row) => (row.realizedPnlUsd || 0) < 0).length
    : null;
  const grossProfitUsd = realizedComplete
    ? realized.reduce((sum, row) => sum + Math.max(0, row.realizedPnlUsd || 0), 0)
    : null;
  const grossLossUsd = realizedComplete
    ? realized.reduce((sum, row) => sum + Math.abs(Math.min(0, row.realizedPnlUsd || 0)), 0)
    : null;
  const profitFactorInfinite = realizedComplete
    && realized.length > 0
    && (grossProfitUsd || 0) > 0
    && grossLossUsd === 0;
  return {
    source: "Binance Agentic Wallet market order history",
    historyAvailable,
    historyComplete,
    fetchedOrders: input.orders.length,
    totalOrders: input.totalOrders,
    positions,
    realized: realized.slice().sort((left, right) => Date.parse(right.completedAt || "") - Date.parse(left.completedAt || "")),
    summary: {
      realizedPnlUsd,
      saleProceedsUsd,
      fifoCostUsd,
      unrealizedPnlUsd: positionPnlComplete ? positions.reduce((sum, position) => sum + (position.unrealizedPnlUsd || 0), 0) : null,
      realizedReturnPct: realizedPnlUsd != null && fifoCostUsd != null && fifoCostUsd > 0
        ? realizedPnlUsd / fifoCostUsd * 100
        : null,
      realizedTradeCount: realizedComplete ? realized.length : null,
      winningTradeCount,
      losingTradeCount,
      winRatePct: realizedComplete && realized.length > 0 && winningTradeCount != null
        ? winningTradeCount / realized.length * 100
        : null,
      grossProfitUsd,
      grossLossUsd,
      profitFactor: realizedComplete && realized.length > 0 && grossProfitUsd != null && grossLossUsd != null
        ? grossLossUsd > 0 ? grossProfitUsd / grossLossUsd : grossProfitUsd === 0 ? 0 : null
        : null,
      profitFactorInfinite
    },
    orders: records.sort((left, right) => Date.parse(right.createdAt || "") - Date.parse(left.createdAt || ""))
  };
}
