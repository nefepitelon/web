-- A reviewed startup override is independent of the real trade lifecycle.
-- Preserve every existing order, amount, receipt and completedAt value.
ALTER TABLE "bstock_trade_records"
  ADD COLUMN "automationIgnoredAt" TIMESTAMP(3),
  ADD COLUMN "automationIgnoredBy" VARCHAR(42);

CREATE INDEX "bstock_trade_records_ownerKey_automationIgnoredAt_status_idx"
  ON "bstock_trade_records"("ownerKey", "automationIgnoredAt", "status");
