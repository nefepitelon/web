CREATE TABLE "hosted_grid_ops_bots" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "configEncrypted" TEXT NOT NULL,
    "configSummary" JSONB NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'STOPPED',
    "runId" VARCHAR(160),
    "snapshot" JSONB,
    "lastError" VARCHAR(2000),
    "heartbeatAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "hosted_grid_ops_bots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "hosted_grid_ops_commands" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "type" VARCHAR(48) NOT NULL,
    "target" VARCHAR(48),
    "payload" JSONB,
    "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "error" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "hosted_grid_ops_commands_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hosted_grid_ops_bots_userId_key" ON "hosted_grid_ops_bots"("userId");
CREATE INDEX "hosted_grid_ops_bots_status_heartbeatAt_idx" ON "hosted_grid_ops_bots"("status", "heartbeatAt");
CREATE INDEX "hosted_grid_ops_commands_botId_status_createdAt_idx" ON "hosted_grid_ops_commands"("botId", "status", "createdAt");
CREATE INDEX "hosted_grid_ops_commands_userId_createdAt_idx" ON "hosted_grid_ops_commands"("userId", "createdAt");
ALTER TABLE "hosted_grid_ops_bots" ADD CONSTRAINT "hosted_grid_ops_bots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hosted_grid_ops_commands" ADD CONSTRAINT "hosted_grid_ops_commands_botId_fkey" FOREIGN KEY ("botId") REFERENCES "hosted_grid_ops_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hosted_grid_ops_commands" ADD CONSTRAINT "hosted_grid_ops_commands_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
