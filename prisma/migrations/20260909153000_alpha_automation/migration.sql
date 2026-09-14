CREATE TABLE "AlphaAutomationConfig" (
  "userId" UUID NOT NULL PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "settings" JSONB NOT NULL, "version" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false, "status" TEXT NOT NULL DEFAULT 'STOPPED',
  "generation" TEXT, "grantFingerprint" TEXT, "market" TEXT NOT NULL DEFAULT 'futures',
  "startedAt" TIMESTAMP(3), "expiresAt" TIMESTAMP(3), "lastScanAt" TIMESTAMP(3),
  "nextScanAt" TIMESTAMP(3), "lastOrderAt" TIMESTAMP(3), "heartbeatAt" TIMESTAMP(3),
  "lastError" TEXT, "runId" TEXT, "leaseToken" TEXT, "leaseUntil" TIMESTAMP(3), "submissionToken" TEXT, "submissionUntil" TIMESTAMP(3),
  "dailyBaseline" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "AlphaAutomationOrder" (
  "id" UUID NOT NULL PRIMARY KEY, "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "generation" TEXT NOT NULL, "cycleKey" TEXT NOT NULL, "symbol" TEXT NOT NULL,
  "side" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'RESERVED', "candidate" JSONB NOT NULL,
  "notional" DOUBLE PRECISION NOT NULL, "planId" TEXT, "closeAfter" TIMESTAMP(3) NOT NULL,
  "error" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "AlphaAutomationOrder_planId_key" ON "AlphaAutomationOrder"("planId");
CREATE UNIQUE INDEX "AlphaAutomationOrder_userId_generation_cycleKey_symbol_key" ON "AlphaAutomationOrder"("userId", "generation", "cycleKey", "symbol");
CREATE INDEX "AlphaAutomationOrder_userId_status_createdAt_idx" ON "AlphaAutomationOrder"("userId", "status", "createdAt");
