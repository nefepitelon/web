const assert = require("node:assert/strict");
const test = require("node:test");
require("tsx/cjs");
const { readDisplayPreferences, persistDisplayPreference } = require("../lib/display-preferences.ts");
test("display preferences validate stored values and preserve current document defaults", () => {
  global.document = { documentElement: { dataset: { theme: "light", language: "en" } } };
  const stored = new Map([["welinkbtc-theme", "dark"], ["welinkbtc-language", "zh"]]);
  global.localStorage = { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) };
  assert.deepEqual(readDisplayPreferences(), { theme: "dark", language: "zh" });
  persistDisplayPreference("theme", "light");
  assert.equal(stored.get("welinkbtc-theme"), "light");
  stored.set("welinkbtc-language", "invalid");
  assert.equal(readDisplayPreferences().language, "en");
});
test("restricted storage does not break display preferences", () => {
  global.document = { documentElement: { dataset: { theme: "light", language: "en" } } };
  global.localStorage = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("SecurityError"); } };
  assert.deepEqual(readDisplayPreferences(), { theme: "light", language: "en" });
  assert.doesNotThrow(() => persistDisplayPreference("theme", "dark"));
});
