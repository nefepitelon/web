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

test("polled read-only APIs bypass duplicate auth and persistent rate-limit egress", async () => {
  const [proxy, service, route, surface, quotes, chart, rateLimit, membership] = await Promise.all([
    read("proxy.ts"),
    read("lib/box-breakout/service.ts"),
    read("app/api/box-breakout/route.ts"),
    read("components/box-breakout-surface.tsx"),
    read("app/api/box-breakout/quotes/route.ts"),
    read("app/api/box-breakout/chart/route.ts"),
    read("lib/rate-limit.ts"),
    read("lib/membership.ts"),
  ]);
  assert.match(proxy, /bypassSupabaseAuth/);
  assert.match(proxy, /request\.method !== "GET"[\s\S]*request\.method !== "HEAD"[\s\S]*request\.method !== "OPTIONS"/);
  assert.match(proxy, /request\.nextUrl\.pathname === "\/api\/box-breakout"/);
  assert.match(proxy, /\/api\/box-breakout\/quotes/);
  assert.match(proxy, /\/api\/box-breakout\/chart/);
  assert.match(proxy, /\/api\/alpha-scan/);
  assert.match(proxy, /\/api\/binance-alpha-lists/);
  assert.match(proxy, /\/api\/cryptobubbles/);
  assert.match(proxy, /\/api\/surf-pulse/);
  assert.match(proxy, /\/api\/telegram-signal-collector/);
  assert.match(proxy, /SELF_AUTHENTICATING_READ_PATHS/);
  assert.match(proxy, /\/api\/alpha-execution\/status/);
  assert.match(proxy, /\/api\/alpha-execution\/automation/);
  assert.ok(proxy.indexOf("if (bypassSupabaseAuth") < proxy.indexOf("supabase.auth.getClaims"));
  assert.match(service, /options\.persistent !== false && isDatabaseConfigured\(\)/);
  assert.match(route, /getActiveViewerId/);
  assert.match(route, /"state", 90, userId, \{ persistent: false \}/);
  assert.match(membership, /select: \{[\s\S]*id: true,[\s\S]*status: true,[\s\S]*twoFactor: \{ select: \{ enabledAt: true \} \}/);
  assert.match(surface, /IDLE_STATE_POLL_MS = 15 \* 60_000/);
  assert.match(surface, /visibilitychange/);
  assert.match(quotes, /persistent: false/);
  assert.match(chart, /persistent: false/);
  assert.match(quotes, /s-maxage=10/);
  assert.match(chart, /s-maxage=900/);
  assert.match(rateLimit, /select: \{ count: true \}/);
});

test("alpha execution polls use a narrow access projection and longer idle intervals", async () => {
  const [membership, access, statusRoute, automationRoute, pnlRoute, scanner, automation] = await Promise.all([
    read("lib/membership.ts"),
    read("lib/alpha-execution/access.ts"),
    read("app/api/alpha-execution/status/route.ts"),
    read("app/api/alpha-execution/automation/route.ts"),
    read("app/api/alpha-execution/pnl/route.ts"),
    read("alpha-scanner.js"),
    read("alpha-auto-trading.js")
  ]);
  assert.match(membership, /export async function getActiveViewerAccess/);
  assert.match(membership, /roles: \{[\s\S]*where: \{ role: \{ key: "admin" \} \}/);
  assert.match(membership, /subscriptions: \{[\s\S]*planKey: "max"/);
  assert.match(membership, /accessRedemptions: \{[\s\S]*select: \{ id: true \}/);
  assert.match(access, /requireAlphaReadOperator/);
  assert.match(statusRoute, /requireAlphaReadOperator\(\)/);
  assert.doesNotMatch(statusRoute, /requireAlphaOperator\(\)/);
  assert.match(automationRoute, /export async function GET\(\)[\s\S]*requireAlphaReadOperator\(\)/);
  assert.match(automationRoute, /export async function POST[\s\S]*requireAlphaOperator\(\)/);
  assert.match(pnlRoute, /requireAlphaReadOperator\(\)/);
  assert.doesNotMatch(pnlRoute, /requireAlphaOperator\(\)/);
  assert.match(scanner, /alphaExecutionIdleRefreshMs = 15 \* 60_000/);
  assert.match(scanner, /livePnlRefreshMs = 15 \* 60_000/);
  assert.match(automation, /running\(\) \|\| finishing\(\) \? 15_000 : 15 \* 60_000/);
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
  assert.match(route, /readHostedGridOpsView\(viewer.id, bot.id, "markets", target\)/);
  const readModel = await read("lib/grid-ops-hosted/read-model.ts");
  assert.match(readModel, /"marketCatalog" ->/);
  assert.match(readModel, /"userId" = \$\{userId\}/);
  assert.doesNotMatch(runtime, /return \{ stop: false, delayMs: 15_000 \}/);
});

test("polling safeguards cap stale order checks and pause hidden tabs", async () => {
  const bstock = await read("bstock-alpha.js");
  assert.match(bstock, /submittedAgeMs >= 15 \* 60_000/);
  assert.match(bstock, /if \(document\.hidden\)/);
  assert.match(bstock, /attempt < 120/);
});
