-- CreateTable
CREATE TABLE "tidesight_trading_credentials" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "environment" "AlphaExecutionMode" NOT NULL,
    "market" "AlphaMarketType" NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Binance',
    "apiKeyEncrypted" TEXT NOT NULL,
    "apiSecretEncrypted" TEXT NOT NULL,
    "proxyEncrypted" TEXT,
    "apiKeyHint" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "verifiedAt" TIMESTAMP(3),
    "permissionSummary" JSONB,
    "lastError" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tidesight_trading_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tidesight_execution_configs" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "activeMode" "AlphaExecutionMode" NOT NULL DEFAULT 'PAPER',
    "defaultMarket" "AlphaMarketType" NOT NULL DEFAULT 'FUTURES',
    "testnetEnabled" BOOLEAN NOT NULL DEFAULT false,
    "liveEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoExecuteEnabled" BOOLEAN NOT NULL DEFAULT false,
    "killSwitchActive" BOOLEAN NOT NULL DEFAULT false,
    "requireManualConfirmation" BOOLEAN NOT NULL DEFAULT true,
    "requireProtectionOrders" BOOLEAN NOT NULL DEFAULT true,
    "riskPerTradePct" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    "maxLeverage" INTEGER NOT NULL DEFAULT 25,
    "dailyLossLimitPct" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "dedupeWindowMinutes" INTEGER NOT NULL DEFAULT 15,
    "maxOpenPositions" INTEGER NOT NULL DEFAULT 6,
    "maxPortfolioExposurePct" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "minTideSightScore" INTEGER NOT NULL DEFAULT 75,
    "perOrderNotionalLimit" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "dailyNotionalLimit" DOUBLE PRECISION NOT NULL DEFAULT 5000,
    "liveUnlockedAt" TIMESTAMP(3),
    "liveUnlockedBy" UUID,
    "lastReconciledAt" TIMESTAMP(3),
    "reconciliationHealthy" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "autoGeneration" TEXT,
    "autoRunId" TEXT,
    "autoStartedAt" TIMESTAMP(3),
    "autoHeartbeatAt" TIMESTAMP(3),
    "autoError" VARCHAR(2000),
    "autoStopLossPct" DOUBLE PRECISION,
    "autoTakeProfitPct" DOUBLE PRECISION,
    "executionLeaseToken" TEXT,
    "executionLeaseUntil" TIMESTAMP(3),

    CONSTRAINT "tidesight_execution_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tidesight_trade_intents" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "environment" "AlphaExecutionMode" NOT NULL,
    "market" "AlphaMarketType" NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "orderType" TEXT NOT NULL DEFAULT 'MARKET',
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "stopLoss" DOUBLE PRECISION NOT NULL,
    "takeProfit" DOUBLE PRECISION NOT NULL,
    "leverage" INTEGER NOT NULL DEFAULT 1,
    "riskPct" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "tideSightScore" DOUBLE PRECISION,
    "dedupeHash" TEXT NOT NULL,
    "state" "AlphaExecutionState" NOT NULL DEFAULT 'CREATED',
    "rejectionReason" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tidesight_trade_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tidesight_execution_plans" (
    "id" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "environment" "AlphaExecutionMode" NOT NULL,
    "market" "AlphaMarketType" NOT NULL,
    "state" "AlphaExecutionState" NOT NULL DEFAULT 'PLANNED',
    "mainOrder" JSONB NOT NULL,
    "protectionOrders" JSONB NOT NULL,
    "riskSnapshot" JSONB NOT NULL,
    "safeguards" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tidesight_execution_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tidesight_trading_orders" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "planId" TEXT NOT NULL,
    "credentialId" TEXT,
    "environment" "AlphaExecutionMode" NOT NULL,
    "market" "AlphaMarketType" NOT NULL,
    "role" "AlphaOrderRole" NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "orderType" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION,
    "stopPrice" DOUBLE PRECISION,
    "clientOrderId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "exchangeOrderId" TEXT,
    "status" "AlphaOrderStatus" NOT NULL DEFAULT 'PENDING',
    "filledQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "averagePrice" DOUBLE PRECISION,
    "rawResponse" JSONB,
    "errorMessage" VARCHAR(2000),
    "lastReconciledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tidesight_trading_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tidesight_trading_positions" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "planId" TEXT NOT NULL,
    "environment" "AlphaExecutionMode" NOT NULL,
    "market" "AlphaMarketType" NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "markPrice" DOUBLE PRECISION,
    "stopLoss" DOUBLE PRECISION NOT NULL,
    "takeProfit" DOUBLE PRECISION NOT NULL,
    "unrealizedPnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "state" "AlphaExecutionState" NOT NULL DEFAULT 'MONITORING',
    "lastReconciledAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tidesight_trading_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tidesight_trading_audits" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "intentId" TEXT,
    "planId" TEXT,
    "orderId" TEXT,
    "state" "AlphaExecutionState" NOT NULL,
    "status" TEXT NOT NULL,
    "message" VARCHAR(2000) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tidesight_trading_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tidesight_auto_events" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "eventKey" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CLAIMED',
    "planId" TEXT,
    "message" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tidesight_auto_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tidesight_trading_credentials_userId_enabled_idx" ON "tidesight_trading_credentials"("userId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "tidesight_trading_credentials_userId_environment_market_key" ON "tidesight_trading_credentials"("userId", "environment", "market");

-- CreateIndex
CREATE UNIQUE INDEX "tidesight_execution_configs_userId_key" ON "tidesight_execution_configs"("userId");

-- CreateIndex
CREATE INDEX "tidesight_trade_intents_userId_symbol_side_createdAt_idx" ON "tidesight_trade_intents"("userId", "symbol", "side", "createdAt");

-- CreateIndex
CREATE INDEX "tidesight_trade_intents_userId_state_createdAt_idx" ON "tidesight_trade_intents"("userId", "state", "createdAt");

-- CreateIndex
CREATE INDEX "tidesight_trade_intents_dedupeHash_createdAt_idx" ON "tidesight_trade_intents"("dedupeHash", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "tidesight_execution_plans_intentId_key" ON "tidesight_execution_plans"("intentId");

-- CreateIndex
CREATE INDEX "tidesight_execution_plans_userId_state_createdAt_idx" ON "tidesight_execution_plans"("userId", "state", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "tidesight_trading_orders_idempotencyKey_key" ON "tidesight_trading_orders"("idempotencyKey");

-- CreateIndex
CREATE INDEX "tidesight_trading_orders_userId_status_createdAt_idx" ON "tidesight_trading_orders"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "tidesight_trading_orders_planId_role_idx" ON "tidesight_trading_orders"("planId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "tidesight_trading_orders_userId_environment_market_clientOr_key" ON "tidesight_trading_orders"("userId", "environment", "market", "clientOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "tidesight_trading_positions_planId_key" ON "tidesight_trading_positions"("planId");

-- CreateIndex
CREATE INDEX "tidesight_trading_positions_userId_state_openedAt_idx" ON "tidesight_trading_positions"("userId", "state", "openedAt");

-- CreateIndex
CREATE INDEX "tidesight_trading_audits_userId_createdAt_idx" ON "tidesight_trading_audits"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "tidesight_trading_audits_planId_createdAt_idx" ON "tidesight_trading_audits"("planId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "tidesight_auto_events_eventKey_key" ON "tidesight_auto_events"("eventKey");

-- CreateIndex
CREATE INDEX "tidesight_auto_events_userId_createdAt_idx" ON "tidesight_auto_events"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "tidesight_trading_credentials" ADD CONSTRAINT "tidesight_trading_credentials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tidesight_execution_configs" ADD CONSTRAINT "tidesight_execution_configs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tidesight_trade_intents" ADD CONSTRAINT "tidesight_trade_intents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tidesight_execution_plans" ADD CONSTRAINT "tidesight_execution_plans_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "tidesight_trade_intents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tidesight_execution_plans" ADD CONSTRAINT "tidesight_execution_plans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tidesight_trading_orders" ADD CONSTRAINT "tidesight_trading_orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tidesight_trading_orders" ADD CONSTRAINT "tidesight_trading_orders_planId_fkey" FOREIGN KEY ("planId") REFERENCES "tidesight_execution_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tidesight_trading_orders" ADD CONSTRAINT "tidesight_trading_orders_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "tidesight_trading_credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tidesight_trading_positions" ADD CONSTRAINT "tidesight_trading_positions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tidesight_trading_positions" ADD CONSTRAINT "tidesight_trading_positions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "tidesight_execution_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tidesight_trading_audits" ADD CONSTRAINT "tidesight_trading_audits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tidesight_trading_audits" ADD CONSTRAINT "tidesight_trading_audits_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "tidesight_trade_intents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tidesight_trading_audits" ADD CONSTRAINT "tidesight_trading_audits_planId_fkey" FOREIGN KEY ("planId") REFERENCES "tidesight_execution_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tidesight_trading_audits" ADD CONSTRAINT "tidesight_trading_audits_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "tidesight_trading_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tidesight_auto_events" ADD CONSTRAINT "tidesight_auto_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enforce independent execution domain even if an API caller bypasses UI validation.
ALTER TABLE "tidesight_execution_configs" ADD CONSTRAINT "tidesight_config_domain" CHECK ("activeMode" IN ('PAPER','LIVE') AND "defaultMarket" = 'FUTURES' AND "maxLeverage" BETWEEN 1 AND 25 AND "riskPerTradePct" > 0 AND "riskPerTradePct" <= 1.5);
ALTER TABLE "tidesight_execution_configs" ADD CONSTRAINT "tidesight_auto_requires_consent" CHECK (NOT "autoExecuteEnabled" OR ("liveEnabled" AND "liveUnlockedAt" IS NOT NULL AND "autoGeneration" IS NOT NULL AND "autoStartedAt" IS NOT NULL AND "autoStopLossPct" IS NOT NULL AND "autoTakeProfitPct" IS NOT NULL));

