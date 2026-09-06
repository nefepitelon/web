const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function runStatusFixture() {
  const source = [
    "import { agentStudioErrorMessage, parseAgentStudioErrorPayload, parseAgentStudioJobPayload, resolveAgentStudioTerminalErrorCode } from './lib/bstock-agent-studio-status.ts';",
    "const jobId = 'x402_d873fb17f85b5599e289e526c2d526e1';",
    "const retryable = parseAgentStudioJobPayload({ jobId, status: 'failed', errorCode: 'analysis_timeout', retryable: true }, jobId);",
    "const terminal = parseAgentStudioJobPayload({ jobId, status: 'failed', errorCode: 'analysis_failed', retryable: false }, jobId);",
    "const succeeded = parseAgentStudioJobPayload({ jobId, status: 'succeeded', downloadUrl: 'https://stock-agent.bnbchain.org/reports/result.md' }, jobId);",
    "const unsafe = parseAgentStudioErrorPayload({ errorCode: '<script>alert(1)</script>', retryable: false }, 409);",
    "let mismatch = ''; try { parseAgentStudioJobPayload({ jobId: 'x402_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', status: 'queued' }, jobId); } catch (error) { mismatch = error.message; }",
    "process.stdout.write(JSON.stringify({ retryable, terminal, succeeded, unsafe, inferredLegacyCode: resolveAgentStudioTerminalErrorCode(null, 2), retryableMessage: agentStudioErrorMessage(retryable.errorCode, retryable.retryable), terminalMessage: agentStudioErrorMessage(terminal.errorCode, terminal.retryable), mismatch }));"
  ].join("\n");
  return spawnSync(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), "--eval", source], {
    cwd: root,
    encoding: "utf8"
  });
}

test("Agent Studio official task states preserve safe failure causes and recovery semantics", () => {
  const result = runStatusFixture();
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.retryable.errorCode, "analysis_timeout");
  assert.equal(parsed.retryable.retryable, true);
  assert.match(parsed.retryableMessage, /原付款任务仍可恢复/);
  assert.equal(parsed.terminal.retryable, false);
  assert.match(parsed.terminalMessage, /不能再恢复/);
  assert.equal(parsed.succeeded.downloadUrl, "https://stock-agent.bnbchain.org/reports/result.md");
  assert.equal(parsed.unsafe.errorCode, "analysis_failed");
  assert.equal(parsed.inferredLegacyCode, "attempts_exhausted");
  assert.match(parsed.mismatch, /mismatched jobId/);
});

test("Agent Studio routes distinguish resumable jobs, terminal failures and new paid attempts", () => {
  const fs = require("node:fs");
  const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
  const job = read("app/api/bstock-alpha/research/job/route.ts");
  const recover = read("app/api/bstock-alpha/research/recover/route.ts");
  const preview = read("app/api/bstock-alpha/research/preview/route.ts");
  const execute = read("app/api/bstock-alpha/research/execute/route.ts");
  const helper = read("lib/bstock-agent-studio.ts");
  const schema = read("prisma/schema.prisma");
  const migration = read("prisma/migrations/20260827152000_add_bstock_research_upstream_error_code/migration.sql");

  assert.match(job, /parseAgentStudioJobPayload/);
  assert.match(job, /upstreamErrorCode: failure\.errorCode/);
  assert.match(job, /"attempts_exhausted"/);
  assert.match(recover, /isStudioJobTerminalFailure/);
  assert.match(recover, /canCreateNew: true/);
  assert.match(preview, /previousStudioFailure/);
  assert.match(execute, /new_job_after_terminal_failure/);
  assert.match(helper, /STUDIO_MAX_RESUMES = 2/);
  assert.match(schema, /upstreamErrorCode\s+String\?/);
  assert.match(migration, /ADD COLUMN "upstreamErrorCode" VARCHAR\(64\)/);
});
