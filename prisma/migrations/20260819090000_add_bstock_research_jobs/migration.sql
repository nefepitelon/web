CREATE TABLE "bstock_research_jobs" (
  "id" TEXT NOT NULL,
  "agentKey" VARCHAR(64) NOT NULL,
  "provider" VARCHAR(32) NOT NULL DEFAULT 'AGENT_STUDIO',
  "symbol" VARCHAR(16) NOT NULL,
  "jobId" VARCHAR(200) NOT NULL,
  "jobTokenEncrypted" TEXT NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'queued',
  "paymentTxHash" VARCHAR(200),
  "reportMarkdown" TEXT,
  "errorMessage" VARCHAR(2000),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bstock_research_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bstock_research_jobs_jobId_key" ON "bstock_research_jobs"("jobId");
CREATE INDEX "bstock_research_jobs_agentKey_createdAt_idx" ON "bstock_research_jobs"("agentKey", "createdAt");
CREATE INDEX "bstock_research_jobs_agentKey_status_updatedAt_idx" ON "bstock_research_jobs"("agentKey", "status", "updatedAt");
