import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const target = process.env.TARGET_VERCEL_ENV;
if (!target || !["production", "preview", "development"].includes(target)) {
  throw new Error("TARGET_VERCEL_ENV must be production, preview, or development");
}

const requiredSources = {
  DATABASE_URL: process.env.POSTGRES_PRISMA_URL,
  DIRECT_URL: process.env.POSTGRES_URL_NON_POOLING,
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SERVICE_ROLE_KEY:
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY,
};

for (const [name, value] of Object.entries(requiredSources)) {
  if (!value) throw new Error(`Marketplace source for ${name} is missing in ${target}`);
}

const values = {
  ...requiredSources,
  NEXT_PUBLIC_APP_URL:
    target === "development" ? "http://localhost:3000" : "https://www.welinkbtc-onchainmain.xyz",
  TWO_FACTOR_SIGNING_KEY:
    process.env.TWO_FACTOR_SIGNING_KEY || randomBytes(48).toString("base64url"),
  OAUTH_STATE_SIGNING_KEY:
    process.env.OAUTH_STATE_SIGNING_KEY || randomBytes(48).toString("base64url"),
};

const sensitive = new Set([
  "DATABASE_URL",
  "DIRECT_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TWO_FACTOR_SIGNING_KEY",
  "OAUTH_STATE_SIGNING_KEY",
]);

function runVercel(args) {
  const vercelCli = join(
    process.env.APPDATA,
    "npm",
    "node_modules",
    "vercel",
    "dist",
    "vc.js",
  );
  return spawnSync(process.execPath, [vercelCli, ...args], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    windowsHide: true,
  });
}

for (const [name, value] of Object.entries(values)) {
  if (process.env[name] === value) {
    console.log(`${target}: preserved ${name}`);
    continue;
  }
  const useSensitive = sensitive.has(name) && target !== "development";
  const updateFlags = useSensitive ? ["--sensitive"] : [];
  const addFlags = useSensitive ? ["--sensitive"] : ["--no-sensitive"];
  let result = runVercel([
    "env",
    "update",
    name,
    target,
    "--yes",
    ...updateFlags,
    "--value",
    value,
  ]);
  if (result.status !== 0) {
    result = runVercel([
      "env",
      "add",
      name,
      target,
      "--yes",
      ...addFlags,
      "--value",
      value,
    ]);
  }
  if (result.status !== 0) {
    throw new Error(
      `Failed to configure ${name} for ${target}: ${result.error?.message || result.stderr || result.stdout || `exit ${result.status}`}`,
    );
  }
  console.log(`${target}: configured ${name}`);
}
