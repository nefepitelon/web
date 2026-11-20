const test = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");
const fs = require("node:fs");
const vm = require("node:vm");
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync("lib/stm-hunt/export.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: mod, exports: mod.exports });
test("STM CSV treats upstream formula-like content as text and quotes separators", () => {
  const cell = mod.exports.stmCsvCell;
  for (const s of ["=HYPERLINK(x)", "+CMD", "@SUM(A1)", "-1+1", " \t=1+1"]) assert.ok(cell(s).startsWith('"\''));
  assert.equal(cell('a,"b'), '"a,""b"');
  assert.equal(cell(null), '""');
});
