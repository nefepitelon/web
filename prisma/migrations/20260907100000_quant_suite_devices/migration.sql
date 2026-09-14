CREATE TABLE "quant_suite_devices" (
  "id" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "engines" TEXT[] NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quant_suite_devices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "quant_suite_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "quant_suite_devices_tokenHash_key" ON "quant_suite_devices"("tokenHash");
CREATE INDEX "quant_suite_devices_userId_revokedAt_idx" ON "quant_suite_devices"("userId", "revokedAt");
ALTER TABLE "quant_suite_devices" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "quant_suite_devices" FROM anon, authenticated;
