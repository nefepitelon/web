import assert from "node:assert/strict";
import test from "node:test";
import {
  FILES_BASE_URL,
  FILES_MIRROR_BASE_URL,
  fetchPublicBtcPriceHistory
} from "../api/_bgeometrics-hodl-history.js";

test("BGeometrics HODL history falls back to the publisher's official GitHub mirror", async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  const firstTimestamp = Date.UTC(2011, 0, 1);
  const rows = Array.from({ length: 1000 }, (_, index) => [firstTimestamp + index * 86_400_000, 100 + index]);
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith(`${FILES_BASE_URL}/`)) throw new TypeError("upstream TLS unavailable");
    if (url.startsWith(`${FILES_MIRROR_BASE_URL}/`)) return Response.json(rows);
    throw new Error(`Unexpected URL ${url}`);
  };

  try {
    const result = await fetchPublicBtcPriceHistory();
    assert.equal(result.length, 1000);
    assert.deepEqual(calls, [
      `${FILES_BASE_URL}/hodl_waves_supply_btc_price.json`,
      `${FILES_MIRROR_BASE_URL}/hodl_waves_supply_btc_price.json`
    ]);
  } finally {
    globalThis.fetch = previousFetch;
    delete globalThis.__welinkBgeometricsBtcPriceHistoryCache;
  }
});
