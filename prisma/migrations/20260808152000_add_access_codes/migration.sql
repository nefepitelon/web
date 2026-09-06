-- CreateTable
CREATE TABLE "access_codes" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "codeHint" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "durationDays" INTEGER NOT NULL DEFAULT 30,
    "maxRedemptions" INTEGER,
    "redemptionCount" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "access_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_code_redemptions" (
    "id" TEXT NOT NULL,
    "accessCodeId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'account',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_code_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "access_codes_codeHash_key" ON "access_codes"("codeHash");

-- CreateIndex
CREATE INDEX "access_codes_active_startsAt_expiresAt_idx" ON "access_codes"("active", "startsAt", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "access_code_redemptions_accessCodeId_userId_key" ON "access_code_redemptions"("accessCodeId", "userId");

-- CreateIndex
CREATE INDEX "access_code_redemptions_userId_endsAt_idx" ON "access_code_redemptions"("userId", "endsAt");

-- CreateIndex
CREATE INDEX "access_code_redemptions_accessCodeId_createdAt_idx" ON "access_code_redemptions"("accessCodeId", "createdAt");

-- AddForeignKey
ALTER TABLE "access_code_redemptions" ADD CONSTRAINT "access_code_redemptions_accessCodeId_fkey" FOREIGN KEY ("accessCodeId") REFERENCES "access_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_code_redemptions" ADD CONSTRAINT "access_code_redemptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
