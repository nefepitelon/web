CREATE TABLE "bstock_trade_records" (
  "id" TEXT NOT NULL,
  "ownerKey" VARCHAR(64) NOT NULL,
  "agentKey" VARCHAR(64) NOT NULL,
  "intentHash" VARCHAR(64) NOT NULL,
  "orderId" VARCHAR(128),
  "mode" VARCHAR(16) NOT NULL,
  "side" VARCHAR(8) NOT NULL,
  "symbol" VARCHAR(32) NOT NULL,
  "ticker" VARCHAR(16) NOT NULL,
  "fromToken" VARCHAR(128) NOT NULL,
  "toToken" VARCHAR(128) NOT NULL,
  "fromSymbol" VARCHAR(32) NOT NULL,
  "toSymbol" VARCHAR(32) NOT NULL,
  "requestedAmount" VARCHAR(100) NOT NULL,
  "quotedAmount" VARCHAR(100),
  "actualFromAmount" VARCHAR(100),
  "actualToAmount" VARCHAR(100),
  "slippageRatio" VARCHAR(50),
  "campaignEligibility" VARCHAR(32),
  "status" VARCHAR(32) NOT NULL DEFAULT 'INTENT_CREATED',
  "txHash" VARCHAR(200),
  "submittedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bstock_trade_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bstock_trade_records_intentHash_key" ON "bstock_trade_records"("intentHash");
CREATE UNIQUE INDEX "bstock_trade_records_orderId_key" ON "bstock_trade_records"("orderId");
CREATE INDEX "bstock_trade_records_ownerKey_createdAt_idx" ON "bstock_trade_records"("ownerKey", "createdAt");
CREATE INDEX "bstock_trade_records_ownerKey_status_updatedAt_idx" ON "bstock_trade_records"("ownerKey", "status", "updatedAt");
