ALTER TABLE "hosted_grid_ops_bots"
ADD COLUMN "marketCatalog" JSONB;

-- Market definitions account for roughly 95% of the durable snapshot. They
-- are needed only by the market picker and should not ride along with every
-- runtime heartbeat/status query through the shared connection pooler.
UPDATE "hosted_grid_ops_bots"
SET
  "marketCatalog" = "snapshot" -> 'markets',
  "snapshot" = "snapshot" - 'markets'
WHERE "snapshot" IS NOT NULL
  AND "snapshot" ? 'markets';
