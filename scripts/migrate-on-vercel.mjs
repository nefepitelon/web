import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (process.env.VERCEL_ENV !== "production") process.exit(0);

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL;
const directUrl = process.env.DIRECT_URL || process.env.POSTGRES_URL_NON_POOLING || databaseUrl;

if (!databaseUrl || !directUrl) {
  console.error("Production database variables are unavailable; deployment stopped before publishing.");
  process.exit(1);
}

const prismaCli = fileURLToPath(new URL("../node_modules/prisma/build/index.js", import.meta.url));
const migration = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: directUrl },
  stdio: "inherit"
});

if (migration.error) {
  console.error("Unable to start the production database migration.");
  process.exit(1);
}
process.exit(migration.status ?? 1);
