ALTER TABLE "bstock_research_jobs"
  ADD COLUMN "ownerKey" VARCHAR(64),
  ADD COLUMN "retryable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "resumeCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastResumedAt" TIMESTAMP(3),
  ADD COLUMN "expiresAt" TIMESTAMP(3);

CREATE INDEX "bstock_research_jobs_ownerKey_symbol_createdAt_idx"
  ON "bstock_research_jobs"("ownerKey", "symbol", "createdAt");
CREATE INDEX "bstock_research_jobs_ownerKey_status_updatedAt_idx"
  ON "bstock_research_jobs"("ownerKey", "status", "updatedAt");
