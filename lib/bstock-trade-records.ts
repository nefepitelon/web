import "server-only";

import { createHash } from "node:crypto";
import type { BstockTradeRecord } from "@prisma/client";
import type { BstockOrderRecord } from "@/lib/bstock-trade-ledger";

const finished = new Set(["FINISHED", "SUCCESS", "SUCCEEDED", "COMPLETED", "CONFIRMED", "FILLED"]);
const failed = new Set(["FAILED", "FAILURE", "REJECTED", "CANCELED", "CANCELLED", "EXPIRED"]);

export function tradeIntentAuditHash(intent: string) {
  return createHash("sha256").update(intent).digest("hex");
}

function databaseRecordDto(record: BstockTradeRecord): BstockOrderRecord {
  const status = record.status.trim().toUpperCase();
  const successful = finished.has(status);
  return {
    id: record.id,
    orderId: record.orderId,
    intentHash: record.intentHash,
    source: "BSTOCK_ALPHA",
    mode: record.mode,
    side: record.side === "sell" ? "sell" : "buy",
    symbol: record.symbol,
    ticker: record.ticker,
    fromSymbol: record.fromSymbol,
    toSymbol: record.toSymbol,
    fromAmount: record.actualFromAmount || record.requestedAmount,
    toAmount: record.actualToAmount || record.quotedAmount || "",
    status,
    final: successful || failed.has(status),
    successful,
    txHash: record.txHash,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export function mergeBstockOrderRecords(agentOrders: BstockOrderRecord[], databaseRecords: BstockTradeRecord[]) {
  const walletByOrderId = new Map(agentOrders.flatMap((order) => order.orderId ? [[order.orderId, order] as const] : []));
  const walletByTxHash = new Map(agentOrders.flatMap((order) => order.txHash ? [[order.txHash.toLowerCase(), order] as const] : []));
  const merged = databaseRecords.map((record) => {
    const stored = databaseRecordDto(record);
    const live = (stored.orderId ? walletByOrderId.get(stored.orderId) : undefined)
      || (stored.txHash ? walletByTxHash.get(stored.txHash.toLowerCase()) : undefined);
    if (!live) return stored;
    if (live.orderId) walletByOrderId.delete(live.orderId);
    if (live.txHash) walletByTxHash.delete(live.txHash.toLowerCase());
    return {
      ...stored,
      ...live,
      id: stored.id,
      intentHash: stored.intentHash,
      source: "BSTOCK_ALPHA" as const,
      mode: stored.mode
    };
  });
  merged.push(...agentOrders.filter((order) => {
    if (order.orderId && !walletByOrderId.has(order.orderId)) return false;
    if (order.txHash && !walletByTxHash.has(order.txHash.toLowerCase())) return false;
    return true;
  }));
  return merged.sort((left, right) => Date.parse(right.createdAt || "") - Date.parse(left.createdAt || ""));
}
