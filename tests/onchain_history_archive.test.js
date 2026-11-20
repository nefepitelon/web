const test = require("node:test");
const assert = require("node:assert/strict");

test("public history parsing rejects null observations, preserves negative NUPL and deduplicates dates", async () => {
  const { parseHistoryPairs } = await import("../lib/onchain-history.js");
  const time = Date.parse("2022-11-01");
  assert.deepEqual(parseHistoryPairs([[time, null], [time, -0.2], [time + 86400000, 0], [time, -0.3], ["invalid", 1]]), [
    { date: "2022-11-01", value: -0.3 }, { date: "2022-11-02", value: 0 }
  ]);
});

test("a rolling four-year refresh retains archived cycles while applying corrected values by date", async () => {
  const { fetchCompleteHistory, archivedHistory } = await import("../lib/onchain-history.js");
  const seed = archivedHistory("tmmp");
  const recent = seed.slice(-10).map(row => [Date.parse(row.date), row.value + 1]);
  const result = await fetchCompleteHistory("tmmp", {
    fetchImpl: async () => new Response(JSON.stringify(recent)), now: Date.parse("2026-11-04")
  });
  assert.equal(result.from, "2011-06-01");
  assert.equal(result.rows.length, seed.length);
  assert.equal(result.rows.at(-1).value, seed.at(-1).value + 1);
  assert.equal(result.stale, false);
  assert.equal(result.fallback, false);
});

test("both archive hosts failing preserves actual dated observations without inventing a current point", async () => {
  const { fetchCompleteHistory } = await import("../lib/onchain-history.js");
  const urls = [];
  const result = await fetchCompleteHistory("tmmp", {
    fetchImpl: async url => { urls.push(url); throw new Error("Offline"); }, now: Date.parse("2026-12-01")
  });
  assert.equal(urls.length, 2);
  assert.equal(result.to, "2026-11-03");
  assert.equal(result.from, "2011-06-01");
  assert.equal(result.stale, true);
  assert.equal(result.fallback, true);
});

test("LTH-NUPL restores pre-2022 history from observed cost bases, and retains published NUPL on overlaps", async () => {
  const originalFetch = global.fetch;
  global.fetch = async url => {
    if (String(url).includes("ticker/price")) return new Response(JSON.stringify({ price: "78000" }));
    throw new Error("Offline");
  };
  try {
    const { buildLthNuplPayload } = await import("../api/lth-nupl.js");
    const { archivedHistory } = await import("../lib/onchain-history.js");
    const result = await buildLthNuplPayload();
    assert.ok(result.series[0].date < "2013-01-01");
    assert.ok(result.series[0].calculated);
    const row = result.series.find(row => row.date === "2013-01-01");
    const price = archivedHistory("price").find(row => row.date === "2013-01-01").value;
    const lth = archivedHistory("lth").find(row => row.date === "2013-01-01").value;
    assert.equal(row.nupl, 1 - lth / price);
    const published = result.series.find(row => row.date === "2022-11-04");
    assert.equal(published.nupl, 0.0105);
    assert.equal(published.calculated, false);
    assert.match(result.sources.methodology, /no interpolation/);
    assert.ok(result.series.at(-1).date >= "2026-11-02");
  } finally { global.fetch = originalFetch; }
});
