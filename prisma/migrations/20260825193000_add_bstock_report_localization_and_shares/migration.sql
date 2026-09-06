CREATE TABLE "bstock_research_translations" (
  "id" TEXT NOT NULL,
  "researchJobId" VARCHAR(64) NOT NULL,
  "language" VARCHAR(8) NOT NULL,
  "sourceLanguage" VARCHAR(8) NOT NULL,
  "report" JSONB NOT NULL,
  "model" VARCHAR(80),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bstock_research_translations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bstock_research_translations_researchJobId_language_key"
  ON "bstock_research_translations"("researchJobId", "language");
CREATE INDEX "bstock_research_translations_researchJobId_updatedAt_idx"
  ON "bstock_research_translations"("researchJobId", "updatedAt");

CREATE TABLE "bstock_research_shares" (
  "id" TEXT NOT NULL,
  "shareKey" VARCHAR(64) NOT NULL,
  "ownerKey" VARCHAR(64) NOT NULL,
  "sourceJobId" VARCHAR(64) NOT NULL,
  "language" VARCHAR(8) NOT NULL,
  "symbol" VARCHAR(16) NOT NULL,
  "ticker" VARCHAR(16) NOT NULL,
  "companyName" VARCHAR(200),
  "companyNameZh" VARCHAR(200),
  "report" JSONB NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bstock_research_shares_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bstock_research_shares_shareKey_key"
  ON "bstock_research_shares"("shareKey");
CREATE UNIQUE INDEX "bstock_research_shares_ownerKey_sourceJobId_language_key"
  ON "bstock_research_shares"("ownerKey", "sourceJobId", "language");
CREATE INDEX "bstock_research_shares_shareKey_createdAt_idx"
  ON "bstock_research_shares"("shareKey", "createdAt");
