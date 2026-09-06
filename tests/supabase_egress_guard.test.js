import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("internal workflow transport bypasses Supabase auth", async () => {
  const proxy = await read("proxy.ts");
  assert.match(proxy, /isInternalWorkflowPath/);
  assert.match(proxy, /pathname\.startsWith\("\/\.well-known\/workflow\/"\)/);
  assert.ok(proxy.indexOf("if (isInternalWorkflowPath") < proxy.indexOf("supabase.auth.getClaims"));
  assert.match(proxy, /matcher:[\s\S]*\\\.well-known\/workflow\//);
});

test("normal viewer reads do not rewrite the full user projection", async () => {
  const membership = await read("lib/membership.ts");
  assert.match(membership, /projectionNeedsRepair/);
  assert.match(membership, /VIEWER_LOGIN_REFRESH_MS = 6 \* 60 \* 60_000/);
  assert.ok(membership.indexOf("if (projectionNeedsRepair)") < membership.indexOf("syncAuthenticatedUser(data.user)"));
});

test("idle hosted bots stop instead of polling large snapshots", async () => {
  const [schema, migration, service, runtime, route] = await Promise.all([
    read("prisma/schema.prisma"),
    read("prisma/migrations/20260826090000_split_hosted_market_catalog/migration.sql"),
    read("lib/grid-ops-hosted/service.ts"),
    read("lib/grid-ops-hosted/runtime.ts"),
    read("app/api/grid-ops-hosted/[...path]/route.ts"),
  ]);
  assert.match(schema, /marketCatalog\s+Json\?/);
  assert.match(migration, /"snapshot" = "snapshot" - 'markets'/);
  assert.doesNotMatch(service.match(/hostedGridOpsBotSelect = \{[\s\S]*?\n\}/)?.[0] || "", /marketCatalog/);
  assert.match(service, /ACTIVE_RUN_HEARTBEAT_GRACE_MS = 60_000/);
  assert.match(service, /heartbeatIsFresh && \["STARTING", "RUNNING", "ERROR"\]\.includes\(bot\.status\)/);
  assert.match(service, /if \(pending\) return ensureHostedGridOpsRun\(bot\)/);
  assert.match(runtime, /state\.status === "READY"\) return \{ stop: true, delayMs: 0 \}/);
  assert.match(runtime, /select: \{ id: true, status: true, configEncrypted: true, snapshot: true \}/);
  assert.match(runtime, /const \{ markets = \{\}, \.\.\.runtimeSnapshot \} = snapshot/);
  assert.match(route, /select: \{ marketCatalog: true \}/);
  assert.doesNotMatch(runtime, /return \{ stop: false, delayMs: 15_000 \}/);
});

test("polling safeguards cap stale order checks and pause hidden tabs", async () => {
  const bstock = await read("bstock-alpha.js");
  assert.match(bstock, /submittedAgeMs >= 15 \* 60_000/);
  assert.match(bstock, /if \(document\.hidden\)/);
  assert.match(bstock, /attempt < 120/);
});
