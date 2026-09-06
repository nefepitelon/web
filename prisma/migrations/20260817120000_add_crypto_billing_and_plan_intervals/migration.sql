CREATE TYPE "CryptoPaymentStatus" AS ENUM ('PENDING', 'CONFIRMING', 'PAID', 'FAILED', 'EXPIRED', 'REVIEW');

ALTER TABLE "plans"
  ADD COLUMN "yearlyCents" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "subscriptions"
  ADD COLUMN "billingInterval" TEXT NOT NULL DEFAULT 'month',
  ADD COLUMN "amountCents" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "crypto_payments" (
  "id" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "planKey" TEXT NOT NULL,
  "billingInterval" TEXT NOT NULL DEFAULT 'month',
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'usd',
  "network" TEXT NOT NULL DEFAULT 'TRON',
  "asset" TEXT NOT NULL DEFAULT 'USDT',
  "receiveAddress" TEXT NOT NULL,
  "txHash" TEXT,
  "status" "CryptoPaymentStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "submittedAt" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3),
  "blockNumber" BIGINT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "crypto_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "crypto_payments_txHash_key" ON "crypto_payments"("txHash");
CREATE INDEX "crypto_payments_userId_status_createdAt_idx" ON "crypto_payments"("userId", "status", "createdAt");
CREATE INDEX "crypto_payments_status_expiresAt_idx" ON "crypto_payments"("status", "expiresAt");

ALTER TABLE "crypto_payments"
  ADD CONSTRAINT "crypto_payments_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "plans" SET "monthlyCents" = 900, "yearlyCents" = 9000 WHERE "key" = 'pro';
UPDATE "plans" SET "monthlyCents" = 1900, "yearlyCents" = 19000 WHERE "key" = 'max';

INSERT INTO "content_gates" ("id", "key", "label", "minimumPlan", "guestPreview", "previewLimit", "enabled", "createdAt", "updatedAt")
VALUES
  ('gate-grid-ops', 'grid.ops', 'AI 网格交易 Ops', 'max', true, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gate-classic-grid', 'grid.classic', 'AIClassic 网格', 'max', true, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gate-toolbox-read', 'toolbox.read', '百宝箱工具台', 'free', true, 8, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gate-toolbox-export', 'toolbox.export', '百宝箱数据导出', 'pro', false, 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET
  "label" = EXCLUDED."label",
  "minimumPlan" = EXCLUDED."minimumPlan",
  "guestPreview" = EXCLUDED."guestPreview",
  "previewLimit" = EXCLUDED."previewLimit",
  "enabled" = EXCLUDED."enabled",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "system_settings" ("key", "value", "description", "updatedAt")
VALUES (
  'crypto.payment',
  '{"enabled":false,"network":"TRON","asset":"USDT","receiveAddress":"","invoiceExpiryMinutes":60}',
  'USDT-TRC20 订阅收款设置',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
