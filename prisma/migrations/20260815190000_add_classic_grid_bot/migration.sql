CREATE TABLE "classic_grid_bots" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "configEncrypted" TEXT NOT NULL,
    "configSummary" JSONB NOT NULL,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(24) NOT NULL DEFAULT 'STOPPED',
    "runId" VARCHAR(160),
    "snapshot" JSONB,
    "lastError" VARCHAR(2000),
    "heartbeatAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "classic_grid_bots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "classic_grid_bots_userId_key" ON "classic_grid_bots"("userId");
CREATE INDEX "classic_grid_bots_status_heartbeatAt_idx" ON "classic_grid_bots"("status", "heartbeatAt");

ALTER TABLE "classic_grid_bots"
ADD CONSTRAINT "classic_grid_bots_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
