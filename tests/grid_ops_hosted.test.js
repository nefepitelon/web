import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (value) => fs.readFileSync(path.join(root, value), "utf8");

test("hosted Grid Ops persists isolated encrypted config, snapshots and commands", () => {
  const schema = read("prisma/schema.prisma");
  const service = read("lib/grid-ops-hosted/service.ts");
  const config = read("lib/grid-ops-hosted/config.ts");
  assert.match(schema, /model HostedGridOpsBot/);
  assert.match(schema, /model HostedGridOpsCommand/);
  assert.match(schema, /userId\s+String\s+@unique\s+@db\.Uuid/);
  assert.match(service, /encryptHostedGridOpsEnvironment/);
  assert.match(config, /encryptTradingSecret/);
  assert.doesNotMatch(config, /process\.env\[/);
});

test("hosted Grid and Hedge commands execute through a durable workflow", () => {
  const workflow = read("lib/grid-ops-hosted/workflow.ts");
  const runtime = read("lib/grid-ops-hosted/runtime.ts");
  const api = read("app/api/grid-ops-hosted/[...path]/route.ts");
  assert.match(workflow, /"use workflow"/);
  assert.match(runtime, /"use step"/);
  assert.match(runtime, /case "GRID_START"/);
  assert.match(runtime, /case "HEDGE_START"/);
  assert.match(api, /assertSameOrigin\(request\)/);
  assert.match(api, /requireAlphaOperator\(\{ live: true \}\)/);
  assert.match(api, /version: "2\.2\.7"/);
  assert.match(runtime, /hedgeDashboard/);
});

test("the same ten-exchange console is bridged to authenticated hosted APIs", () => {
  const consoleRoute = read("app/grid-ops-hosted-console/route.ts");
  const surface = read("components/grid-ops-surface.tsx");
  assert.match(consoleRoute, /grid-ops.*public.*index\.html/s);
  assert.match(consoleRoute, /PREFIX = '\/api\/grid-ops-hosted'/);
  assert.match(consoleRoute, /requireAlphaOperator/);
  assert.match(surface, /使用本地交易引擎/);
  assert.match(surface, /使用线上服务器托管/);
  assert.match(surface, /十交易所 AI 网格与 AI 对冲策略/);
});
