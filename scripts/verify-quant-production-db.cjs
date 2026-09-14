// Read-only production schema verification. Never print credentials or user data.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {parseEnv} = require('node:util');
if (fs.existsSync('.vercel/.env.production.local')) Object.assign(process.env, parseEnv(fs.readFileSync('.vercel/.env.production.local', 'utf8')));
process.env.DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL;
const {PrismaClient} = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  const tables = await db.$queryRawUnsafe(`SELECT relname, relrowsecurity,
    has_table_privilege('anon', oid, 'SELECT,INSERT,UPDATE,DELETE') AS anon_access,
    has_table_privilege('authenticated', oid, 'SELECT,INSERT,UPDATE,DELETE') AS authenticated_access
    FROM pg_class WHERE relname IN ('quant_suite_instances','quant_suite_commands','quant_suite_dispatches','quant_suite_workers','quant_suite_devices') ORDER BY relname`);
  assert.equal(tables.length, 5);
  for (const table of tables) { assert.equal(table.relrowsecurity, true); assert.equal(table.anon_access, false); assert.equal(table.authenticated_access, false); }
  const migrations = await db.$queryRawUnsafe(`SELECT migration_name, checksum, finished_at IS NOT NULL AS finished FROM _prisma_migrations WHERE migration_name LIKE '%quant_suite%' AND rolled_back_at IS NULL`);
  const names = ['20260906010000_quant_suite','20260907083000_quant_suite_dispatch','20260907100000_quant_suite_devices'];
  for (const name of names) {
    const checksum = crypto.createHash('sha256').update(fs.readFileSync(path.join('prisma/migrations', name, 'migration.sql'))).digest('hex');
    assert.ok(migrations.some(item => item.migration_name === name && item.finished && item.checksum === checksum), `Migration mismatch: ${name}`);
  }
  console.log(JSON.stringify({ok: true, tables, migrationsVerified: names.length, readOnly: true}));
})().catch(() => { console.error('Production schema verification failed; inspect migration state with server-side access.'); process.exitCode = 1; }).finally(() => db.$disconnect());
