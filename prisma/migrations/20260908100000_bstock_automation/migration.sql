CREATE TABLE "bstock_auto_configs" (
  "ownerKey" VARCHAR(64) PRIMARY KEY, "walletAddress" VARCHAR(42) NOT NULL,
  "sessionEncrypted" TEXT, "enabled" BOOLEAN NOT NULL DEFAULT false,
  "status" VARCHAR(32) NOT NULL DEFAULT 'STOPPED', "generation" VARCHAR(64),
  "settings" JSONB NOT NULL, "strategyVersion" VARCHAR(64) NOT NULL,
  "runId" VARCHAR(200), "startedAt" TIMESTAMP(3), "heartbeatAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3), "lastError" VARCHAR(2000),
  "equityStartUsd" DECIMAL(30,10) NOT NULL DEFAULT 0, "equityHighUsd" DECIMAL(30,10) NOT NULL DEFAULT 0,
  "realizedBaseline" DECIMAL(30,10) NOT NULL DEFAULT 0, "stats" JSONB,
  "leaseToken" VARCHAR(64), "leaseUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "bstock_auto_orders" (
  "id" TEXT PRIMARY KEY, "ownerKey" VARCHAR(64) NOT NULL, "generation" VARCHAR(64) NOT NULL,
  "signalKey" VARCHAR(160) NOT NULL UNIQUE, "symbol" VARCHAR(32) NOT NULL, "side" VARCHAR(8) NOT NULL,
  "strategy" VARCHAR(32) NOT NULL, "strategyVersion" VARCHAR(64) NOT NULL, "reason" VARCHAR(2000) NOT NULL,
  "decision" JSONB NOT NULL, "requestedAmount" VARCHAR(100) NOT NULL, "tradeRecordId" VARCHAR(64) UNIQUE,
  "status" VARCHAR(32) NOT NULL DEFAULT 'QUOTING', "orderId" VARCHAR(128), "txHash" VARCHAR(200) UNIQUE,
  "actualQuantity" VARCHAR(100), "actualUsd" DECIMAL(30,10), "realizedPnlUsd" DECIMAL(30,10),
  "gasEstimateUsd" DECIMAL(30,10), "error" VARCHAR(2000), "submittedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "bstock_auto_orders_ownerKey_status_createdAt_idx" ON "bstock_auto_orders"("ownerKey", "status", "createdAt");
CREATE TABLE "bstock_auto_positions" (
  "id" TEXT PRIMARY KEY, "ownerKey" VARCHAR(64) NOT NULL, "symbol" VARCHAR(32) NOT NULL,
  "contractAddress" VARCHAR(42) NOT NULL, "multiplier" VARCHAR(100) NOT NULL, "quantity" VARCHAR(100) NOT NULL,
  "costUsd" DECIMAL(30,10) NOT NULL, "highPrice" DECIMAL(30,10) NOT NULL,
  "strategy" VARCHAR(32) NOT NULL, "entryOrderId" VARCHAR(64) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("ownerKey", "symbol")
);
CREATE TABLE "bstock_auto_events" (
  "id" TEXT PRIMARY KEY, "ownerKey" VARCHAR(64) NOT NULL, "generation" VARCHAR(64),
  "kind" VARCHAR(32) NOT NULL, "status" VARCHAR(32), "symbol" VARCHAR(32), "side" VARCHAR(8), "strategy" VARCHAR(32),
  "reason" VARCHAR(2000) NOT NULL, "orderId" VARCHAR(128), "txHash" VARCHAR(200), "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "bstock_auto_events_ownerKey_createdAt_idx" ON "bstock_auto_events"("ownerKey", "createdAt");

-- These tables contain trading delegation and private account history. Only
-- server-side Prisma may access them; browser Supabase roles have no grants.
ALTER TABLE "bstock_auto_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bstock_auto_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bstock_auto_positions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bstock_auto_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "bstock_auto_configs", "bstock_auto_orders", "bstock_auto_positions", "bstock_auto_events" FROM anon, authenticated;
