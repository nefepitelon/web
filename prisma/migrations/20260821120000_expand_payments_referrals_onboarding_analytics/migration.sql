ALTER TABLE "profiles"
  ADD COLUMN "profileCompletedAt" TIMESTAMP(3);

ALTER TABLE "crypto_payments"
  ADD COLUMN "paymentMethod" TEXT NOT NULL DEFAULT 'TRON_USDT',
  ADD COLUMN "paymentAmount" DECIMAL(20,8),
  ADD COLUMN "paymentCurrency" TEXT NOT NULL DEFAULT 'USDT',
  ADD COLUMN "paymentReference" TEXT,
  ADD COLUMN "proofUrl" TEXT,
  ADD COLUMN "reviewDueAt" TIMESTAMP(3),
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedBy" UUID,
  ADD COLUMN "reviewNote" VARCHAR(1000);

UPDATE "crypto_payments"
SET
  "paymentMethod" = 'TRON_USDT',
  "paymentAmount" = "amountCents"::DECIMAL / 100,
  "paymentCurrency" = 'USDT'
WHERE "paymentAmount" IS NULL;

CREATE INDEX "crypto_payments_paymentMethod_status_createdAt_idx"
  ON "crypto_payments"("paymentMethod", "status", "createdAt");
CREATE INDEX "crypto_payments_status_reviewDueAt_idx"
  ON "crypto_payments"("status", "reviewDueAt");

ALTER TABLE "referrals"
  ADD COLUMN "qualifiedAt" TIMESTAMP(3);

ALTER TABLE "commission_ledger"
  ADD COLUMN "rewardType" TEXT NOT NULL DEFAULT 'SUBSCRIPTION',
  ADD COLUMN "level" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX "commission_ledger_rewardType_status_createdAt_idx"
  ON "commission_ledger"("rewardType", "status", "createdAt");

CREATE TABLE "user_onboarding_tasks" (
  "id" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "taskKey" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  CONSTRAINT "user_onboarding_tasks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_onboarding_tasks_userId_taskKey_key"
  ON "user_onboarding_tasks"("userId", "taskKey");
CREATE INDEX "user_onboarding_tasks_taskKey_completedAt_idx"
  ON "user_onboarding_tasks"("taskKey", "completedAt");
ALTER TABLE "user_onboarding_tasks"
  ADD CONSTRAINT "user_onboarding_tasks_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "analytics_events" (
  "id" TEXT NOT NULL,
  "userId" UUID,
  "sessionId" VARCHAR(80) NOT NULL,
  "eventType" VARCHAR(40) NOT NULL DEFAULT 'PAGE_VIEW',
  "path" VARCHAR(300) NOT NULL,
  "day" DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "analytics_events_sessionId_eventType_path_day_key"
  ON "analytics_events"("sessionId", "eventType", "path", "day");
CREATE INDEX "analytics_events_eventType_createdAt_idx"
  ON "analytics_events"("eventType", "createdAt");
CREATE INDEX "analytics_events_userId_createdAt_idx"
  ON "analytics_events"("userId", "createdAt");
CREATE INDEX "analytics_events_day_eventType_idx"
  ON "analytics_events"("day", "eventType");
ALTER TABLE "analytics_events"
  ADD CONSTRAINT "analytics_events_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user_onboarding_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "analytics_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "user_onboarding_tasks" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE "analytics_events" FROM anon, authenticated;

INSERT INTO "system_settings" ("key", "value", "description", "updatedAt")
VALUES (
  'crypto.payment',
  '{"invoiceExpiryMinutes":60,"reviewSlaHours":4,"cnyPerUsd":7.2,"trc20":{"enabled":false,"receiveAddress":"","confirmations":1},"bsc":{"enabled":false,"receiveAddress":"","confirmations":12},"binanceUid":{"enabled":false,"recipient":"","recipientName":"","qrCodeUrl":"","instructions":"请通过币安内部转账向指定 UID 支付 USDT，并填写订单号或上传付款凭证。"},"wechat":{"enabled":false,"recipient":"","recipientName":"","qrCodeUrl":"","instructions":"请扫码支付订单显示的人民币金额，并上传付款截图。"}}',
  '多通道订阅收款设置',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE SET
  "value" = jsonb_build_object(
    'invoiceExpiryMinutes', COALESCE(("system_settings"."value"->>'invoiceExpiryMinutes')::INTEGER, 60),
    'reviewSlaHours', 4,
    'cnyPerUsd', 7.2,
    'trc20', jsonb_build_object(
      'enabled', COALESCE(("system_settings"."value"->>'enabled')::BOOLEAN, false),
      'receiveAddress', COALESCE("system_settings"."value"->>'receiveAddress', ''),
      'confirmations', 1
    ),
    'bsc', jsonb_build_object('enabled', false, 'receiveAddress', '', 'confirmations', 12),
    'binanceUid', jsonb_build_object('enabled', false, 'recipient', '', 'recipientName', '', 'qrCodeUrl', '', 'instructions', '请通过币安内部转账向指定 UID 支付 USDT，并填写订单号或上传付款凭证。'),
    'wechat', jsonb_build_object('enabled', false, 'recipient', '', 'recipientName', '', 'qrCodeUrl', '', 'instructions', '请扫码支付订单显示的人民币金额，并上传付款截图。')
  ),
  "description" = '多通道订阅收款设置',
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "system_settings" ("key", "value", "description", "updatedAt")
VALUES (
  'referral.rules',
  '{"registrationRewardCents":10,"validUserRewardCents":200,"level1RateBps":1200,"level2RateBps":300,"holdDays":14}',
  '邀请注册、有效用户与两级订阅返佣规则',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE SET
  "value" = '{"registrationRewardCents":10,"validUserRewardCents":200,"level1RateBps":1200,"level2RateBps":300,"holdDays":14}',
  "description" = '邀请注册、有效用户与两级订阅返佣规则',
  "updatedAt" = CURRENT_TIMESTAMP;
