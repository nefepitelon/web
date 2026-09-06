CREATE TYPE "WlbTransactionType" AS ENUM (
  'DEPOSIT',
  'TRANSFER',
  'WITHDRAWAL',
  'COMMISSION',
  'REWARD',
  'ADJUSTMENT'
);

CREATE TYPE "WlbTransactionStatus" AS ENUM (
  'PENDING',
  'CONFIRMING',
  'COMPLETED',
  'REJECTED',
  'FAILED',
  'EXPIRED'
);

CREATE TABLE "wlb_accounts" (
  "id" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "availableMilliWlb" BIGINT NOT NULL DEFAULT 0,
  "pendingWithdrawalMilliWlb" BIGINT NOT NULL DEFAULT 0,
  "totalCreditedMilliWlb" BIGINT NOT NULL DEFAULT 0,
  "totalDebitedMilliWlb" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "wlb_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "wlb_accounts_non_negative" CHECK (
    "availableMilliWlb" >= 0 AND "pendingWithdrawalMilliWlb" >= 0
  )
);

CREATE TABLE "wlb_transactions" (
  "id" TEXT NOT NULL,
  "type" "WlbTransactionType" NOT NULL,
  "status" "WlbTransactionStatus" NOT NULL DEFAULT 'PENDING',
  "ownerUserId" UUID NOT NULL,
  "counterpartyUserId" UUID,
  "amountMilliWlb" BIGINT NOT NULL,
  "usdtAmountCents" INTEGER,
  "paymentMethod" TEXT,
  "network" TEXT,
  "receiveAddress" TEXT,
  "payoutAddress" TEXT,
  "txHash" TEXT,
  "externalReference" TEXT,
  "note" VARCHAR(1000),
  "metadata" JSONB,
  "expiresAt" TIMESTAMP(3),
  "reviewedBy" UUID,
  "reviewedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "wlb_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "wlb_transactions_positive_amount" CHECK ("amountMilliWlb" > 0)
);

CREATE TABLE "wlb_ledger_entries" (
  "id" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "phase" VARCHAR(24) NOT NULL,
  "availableDeltaMilliWlb" BIGINT NOT NULL,
  "pendingDeltaMilliWlb" BIGINT NOT NULL,
  "availableAfterMilliWlb" BIGINT NOT NULL,
  "pendingAfterMilliWlb" BIGINT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wlb_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chain_transaction_claims" (
  "id" TEXT NOT NULL,
  "network" VARCHAR(24) NOT NULL,
  "txHash" VARCHAR(160) NOT NULL,
  "purpose" VARCHAR(48) NOT NULL,
  "referenceId" VARCHAR(191) NOT NULL,
  "userId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chain_transaction_claims_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wlb_accounts_userId_key" ON "wlb_accounts"("userId");
CREATE UNIQUE INDEX "wlb_transactions_externalReference_key" ON "wlb_transactions"("externalReference");
CREATE UNIQUE INDEX "wlb_transactions_network_txHash_key" ON "wlb_transactions"("network", "txHash");
CREATE INDEX "wlb_transactions_ownerUserId_status_createdAt_idx" ON "wlb_transactions"("ownerUserId", "status", "createdAt");
CREATE INDEX "wlb_transactions_counterpartyUserId_status_createdAt_idx" ON "wlb_transactions"("counterpartyUserId", "status", "createdAt");
CREATE INDEX "wlb_transactions_type_status_createdAt_idx" ON "wlb_transactions"("type", "status", "createdAt");
CREATE UNIQUE INDEX "wlb_ledger_entries_transactionId_userId_phase_key" ON "wlb_ledger_entries"("transactionId", "userId", "phase");
CREATE INDEX "wlb_ledger_entries_userId_createdAt_idx" ON "wlb_ledger_entries"("userId", "createdAt");
CREATE UNIQUE INDEX "chain_transaction_claims_network_txHash_key" ON "chain_transaction_claims"("network", "txHash");
CREATE INDEX "chain_transaction_claims_purpose_referenceId_idx" ON "chain_transaction_claims"("purpose", "referenceId");
CREATE INDEX "chain_transaction_claims_userId_createdAt_idx" ON "chain_transaction_claims"("userId", "createdAt");

ALTER TABLE "wlb_accounts"
  ADD CONSTRAINT "wlb_accounts_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "wlb_transactions"
  ADD CONSTRAINT "wlb_transactions_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "wlb_transactions"
  ADD CONSTRAINT "wlb_transactions_counterpartyUserId_fkey"
  FOREIGN KEY ("counterpartyUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "wlb_ledger_entries"
  ADD CONSTRAINT "wlb_ledger_entries_transactionId_fkey"
  FOREIGN KEY ("transactionId") REFERENCES "wlb_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wlb_ledger_entries"
  ADD CONSTRAINT "wlb_ledger_entries_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "chain_transaction_claims"
  ADD CONSTRAINT "chain_transaction_claims_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "wlb_accounts" (
  "id", "userId", "availableMilliWlb", "pendingWithdrawalMilliWlb",
  "totalCreditedMilliWlb", "totalDebitedMilliWlb", "createdAt", "updatedAt"
)
SELECT
  CONCAT('wlb_', REPLACE("id"::TEXT, '-', '')),
  "id", 0, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users"
ON CONFLICT ("userId") DO NOTHING;

INSERT INTO "chain_transaction_claims" (
  "id", "network", "txHash", "purpose", "referenceId", "userId", "createdAt"
)
SELECT
  CONCAT('legacy_crypto_', "id"),
  UPPER("network"),
  LOWER("txHash"),
  'SUBSCRIPTION',
  "id",
  "userId",
  COALESCE("confirmedAt", "updatedAt")
FROM "crypto_payments"
WHERE "txHash" IS NOT NULL
  AND "status" = 'PAID'
  AND UPPER("network") IN ('BSC', 'TRON')
ON CONFLICT ("network", "txHash") DO NOTHING;

INSERT INTO "system_settings" ("key", "value", "description", "updatedAt")
VALUES (
  'wlb.asset',
  '{"usdtToWlb":10,"depositEnabled":true,"transferEnabled":true,"withdrawalEnabled":true,"minDepositUsdt":1,"minTransferWlb":1,"minWithdrawalWlb":10,"withdrawalFeeWlb":0,"maxDailyTransferWlb":100000}',
  'WLB 站内资产、划转与提现风控配置',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;

ALTER TABLE "wlb_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wlb_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wlb_ledger_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chain_transaction_claims" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE "wlb_accounts" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE "wlb_transactions" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE "wlb_ledger_entries" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE "chain_transaction_claims" FROM anon, authenticated;

CREATE OR REPLACE FUNCTION prevent_wlb_ledger_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'WLB ledger entries are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "wlb_ledger_entries_append_only"
BEFORE UPDATE OR DELETE ON "wlb_ledger_entries"
FOR EACH ROW EXECUTE FUNCTION prevent_wlb_ledger_mutation();
