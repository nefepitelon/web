ALTER TABLE "quant_suite_instances"
  ADD COLUMN "cachedRuntime" JSONB,
  ADD COLUMN "runtimeObservedAt" TIMESTAMP(3),
  ADD COLUMN "runtimeWorkerId" TEXT;

CREATE TABLE "quant_suite_dispatches" (
  "id" TEXT NOT NULL,
  "commandId" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "engine" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "controlSequence" INTEGER NOT NULL,
  "revision" INTEGER NOT NULL,
  "configHash" TEXT NOT NULL,
  "expectedVersion" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "workerId" TEXT,
  "leaseTokenHash" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "dispatchedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "result" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quant_suite_dispatches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "quant_suite_dispatches_commandId_fkey" FOREIGN KEY ("commandId") REFERENCES "quant_suite_commands"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "quant_suite_dispatches_commandId_key" ON "quant_suite_dispatches"("commandId");
CREATE INDEX "quant_suite_dispatches_workerId_status_createdAt_idx" ON "quant_suite_dispatches"("workerId", "status", "createdAt");
CREATE INDEX "quant_suite_dispatches_userId_engine_status_idx" ON "quant_suite_dispatches"("userId", "engine", "status");
CREATE INDEX "quant_suite_dispatches_status_leaseExpiresAt_idx" ON "quant_suite_dispatches"("status", "leaseExpiresAt");

CREATE TABLE "quant_suite_workers" (
  "id" TEXT NOT NULL,
  "protocolVersion" INTEGER NOT NULL DEFAULT 1,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quant_suite_workers_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "quant_suite_dispatches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quant_suite_workers" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "quant_suite_dispatches" FROM anon, authenticated;
REVOKE ALL ON TABLE "quant_suite_workers" FROM anon, authenticated;
