// Read-only schema/permission verification; never print credentials or account data.
const fs = require("node:fs");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const { parseEnv } = require("node:util");
if (fs.existsSync(".vercel/.env.production.local")) Object.assign(process.env, parseEnv(fs.readFileSync(".vercel/.env.production.local", "utf8")));
process.env.DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL;
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();
(async () => {
  const tables = await db.$queryRawUnsafe(`SELECT relname, relrowsecurity,
    has_table_privilege('anon', oid, 'SELECT,INSERT,UPDATE,DELETE') AS anon_access,
    has_table_privilege('authenticated', oid, 'SELECT,INSERT,UPDATE,DELETE') AS authenticated_access
    FROM pg_class WHERE relname IN ('bstock_auto_configs','bstock_auto_orders','bstock_auto_positions','bstock_auto_events') ORDER BY relname`);
  assert.equal(tables.length, 4);
  for (const table of tables) {
    assert.equal(table.relrowsecurity, true);
    assert.equal(table.anon_access, false);
    assert.equal(table.authenticated_access, false);
  }
  const migrations = ["20260908100000_bstock_automation", "20260909040000_bstock_manual_review"];
  for (const name of migrations) {
    const rows = await db.$queryRawUnsafe("SELECT checksum, finished_at IS NOT NULL AS finished FROM _prisma_migrations WHERE migration_name = $1 AND rolled_back_at IS NULL", name);
    const checksum = crypto.createHash("sha256").update(fs.readFileSync(`prisma/migrations/${name}/migration.sql`)).digest("hex");
    assert.ok(rows.some(row => row.finished && row.checksum === checksum));
  }
  const columns = await db.$queryRawUnsafe(`SELECT column_name, is_nullable, data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bstock_trade_records'
      AND column_name IN ('automationIgnoredAt', 'automationIgnoredBy') ORDER BY column_name`);
  assert.deepEqual(columns.map(row => [row.column_name, row.is_nullable, row.data_type]), [
    ["automationIgnoredAt", "YES", "timestamp without time zone"], ["automationIgnoredBy", "YES", "character varying"]
  ]);
  const indexes = await db.$queryRawUnsafe(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
    AND tablename = 'bstock_trade_records' AND indexname = 'bstock_trade_records_ownerKey_automationIgnoredAt_status_idx'`);
  assert.equal(indexes.length, 1);
  console.log(JSON.stringify({ ok: true, tables, migrationsVerified: migrations, manualReviewSchemaVerified: true, readOnly: true }));
})().catch(() => { console.error("bStock automation schema verification failed; inspect migrations using server-side access."); process.exitCode = 1; }).finally(() => db.$disconnect());
