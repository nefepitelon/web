CREATE TYPE "AlphaExecutionMode" AS ENUM ('PAPER', 'MOCK_EXCHANGE', 'TESTNET', 'LIVE');
CREATE TYPE "AlphaMarketType" AS ENUM ('SPOT', 'FUTURES');
CREATE TYPE "AlphaExecutionState" AS ENUM ('CREATED', 'NORMALIZED', 'DEDUPE_CHECKED', 'RISK_REJECTED', 'RISK_APPROVED', 'PLANNED', 'AWAITING_CONFIRMATION', 'EXECUTING', 'SUBMITTED', 'PARTIALLY_FILLED', 'FILLED', 'PROTECTION_ACTIVE', 'MONITORING', 'RECONCILING', 'RECONCILED', 'CANCELED', 'CLOSED', 'KILLED', 'FAILED', 'UNKNOWN');
CREATE TYPE "AlphaOrderStatus" AS ENUM ('PENDING', 'SUBMITTED', 'NEW', 'PARTIALLY_FILLED', 'FILLED', 'CANCELED', 'REJECTED', 'EXPIRED', 'UNKNOWN');
CREATE TYPE "AlphaOrderRole" AS ENUM ('ENTRY', 'STOP_LOSS', 'TAKE_PROFIT', 'CLOSE');

CREATE TABLE "alpha_trading_credentials" (
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
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "alpha_trading_credentials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "alpha_execution_configs" (
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
  "riskPerTradePct" DOUBLE PRECISION NOT NULL DEFAULT 0.75,
  "maxLeverage" INTEGER NOT NULL DEFAULT 3,
  "dailyLossLimitPct" DOUBLE PRECISION NOT NULL DEFAULT 2,
  "dedupeWindowMinutes" INTEGER NOT NULL DEFAULT 15,
  "maxOpenPositions" INTEGER NOT NULL DEFAULT 6,
  "maxPortfolioExposurePct" DOUBLE PRECISION NOT NULL DEFAULT 50,
  "minAlphaScore" INTEGER NOT NULL DEFAULT 75,
  "perOrderNotionalLimit" DOUBLE PRECISION NOT NULL DEFAULT 50,
  "dailyNotionalLimit" DOUBLE PRECISION NOT NULL DEFAULT 200,
  "liveUnlockedAt" TIMESTAMP(3),
  "liveUnlockedBy" UUID,
  "lastReconciledAt" TIMESTAMP(3),
  "reconciliationHealthy" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "alpha_execution_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "alpha_trade_intents" (
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
  "alphaScore" DOUBLE PRECISION,
  "dedupeHash" TEXT NOT NULL,
  "state" "AlphaExecutionState" NOT NULL DEFAULT 'CREATED',
  "rejectionReason" VARCHAR(2000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "alpha_trade_intents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "alpha_execution_plans" (
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
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "alpha_execution_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "alpha_trading_orders" (
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
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "alpha_trading_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "alpha_trading_positions" (
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
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "alpha_trading_positions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "alpha_trading_audits" (
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
  CONSTRAINT "alpha_trading_audits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "alpha_trading_credentials_userId_environment_market_key" ON "alpha_trading_credentials"("userId", "environment", "market");
CREATE INDEX "alpha_trading_credentials_userId_enabled_idx" ON "alpha_trading_credentials"("userId", "enabled");
CREATE UNIQUE INDEX "alpha_execution_configs_userId_key" ON "alpha_execution_configs"("userId");
CREATE INDEX "alpha_trade_intents_userId_symbol_side_createdAt_idx" ON "alpha_trade_intents"("userId", "symbol", "side", "createdAt");
CREATE INDEX "alpha_trade_intents_userId_state_createdAt_idx" ON "alpha_trade_intents"("userId", "state", "createdAt");
CREATE INDEX "alpha_trade_intents_dedupeHash_createdAt_idx" ON "alpha_trade_intents"("dedupeHash", "createdAt");
CREATE UNIQUE INDEX "alpha_execution_plans_intentId_key" ON "alpha_execution_plans"("intentId");
CREATE INDEX "alpha_execution_plans_userId_state_createdAt_idx" ON "alpha_execution_plans"("userId", "state", "createdAt");
CREATE UNIQUE INDEX "alpha_trading_orders_idempotencyKey_key" ON "alpha_trading_orders"("idempotencyKey");
CREATE UNIQUE INDEX "alpha_trading_orders_userId_environment_market_clientOrderId_key" ON "alpha_trading_orders"("userId", "environment", "market", "clientOrderId");
CREATE INDEX "alpha_trading_orders_userId_status_createdAt_idx" ON "alpha_trading_orders"("userId", "status", "createdAt");
CREATE INDEX "alpha_trading_orders_planId_role_idx" ON "alpha_trading_orders"("planId", "role");
CREATE UNIQUE INDEX "alpha_trading_positions_planId_key" ON "alpha_trading_positions"("planId");
CREATE INDEX "alpha_trading_positions_userId_state_openedAt_idx" ON "alpha_trading_positions"("userId", "state", "openedAt");
CREATE INDEX "alpha_trading_audits_userId_createdAt_idx" ON "alpha_trading_audits"("userId", "createdAt");
CREATE INDEX "alpha_trading_audits_planId_createdAt_idx" ON "alpha_trading_audits"("planId", "createdAt");

ALTER TABLE "alpha_trading_credentials" ADD CONSTRAINT "alpha_trading_credentials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alpha_execution_configs" ADD CONSTRAINT "alpha_execution_configs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alpha_trade_intents" ADD CONSTRAINT "alpha_trade_intents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alpha_execution_plans" ADD CONSTRAINT "alpha_execution_plans_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "alpha_trade_intents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alpha_execution_plans" ADD CONSTRAINT "alpha_execution_plans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alpha_trading_orders" ADD CONSTRAINT "alpha_trading_orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alpha_trading_orders" ADD CONSTRAINT "alpha_trading_orders_planId_fkey" FOREIGN KEY ("planId") REFERENCES "alpha_execution_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alpha_trading_orders" ADD CONSTRAINT "alpha_trading_orders_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "alpha_trading_credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "alpha_trading_positions" ADD CONSTRAINT "alpha_trading_positions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alpha_trading_positions" ADD CONSTRAINT "alpha_trading_positions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "alpha_execution_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alpha_trading_audits" ADD CONSTRAINT "alpha_trading_audits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alpha_trading_audits" ADD CONSTRAINT "alpha_trading_audits_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "alpha_trade_intents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alpha_trading_audits" ADD CONSTRAINT "alpha_trading_audits_planId_fkey" FOREIGN KEY ("planId") REFERENCES "alpha_execution_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alpha_trading_audits" ADD CONSTRAINT "alpha_trading_audits_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "alpha_trading_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
