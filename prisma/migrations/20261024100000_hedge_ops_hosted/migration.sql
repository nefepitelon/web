CREATE TABLE "hedge_ops_runtimes" (
  "id" TEXT PRIMARY KEY,
  "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "engine" VARCHAR(16) NOT NULL,
  "configEncrypted" TEXT NOT NULL,
  "snapshotEncrypted" TEXT,
  "views" JSONB,
  "status" VARCHAR(24) NOT NULL DEFAULT 'STOPPED',
  "generation" TEXT,
  "runId" TEXT,
  "operationId" TEXT,
  "operationStartedAt" TIMESTAMP(3),
  "workerStartedAt" TIMESTAMP(3),
  "heartbeatAt" TIMESTAMP(3),
  "lastError" VARCHAR(2000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "hedge_ops_runtimes_userId_engine_key" ON "hedge_ops_runtimes"("userId", "engine");
CREATE INDEX "hedge_ops_runtimes_status_heartbeatAt_idx" ON "hedge_ops_runtimes"("status", "heartbeatAt");
