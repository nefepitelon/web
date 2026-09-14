const test = require("node:test");
const assert = require("node:assert/strict");
const {
  RETENTION_MS,
  SYNC_INTERVAL_MS,
  collectSurfItems,
  freshnessFor,
  mergeFeedItems,
  normalizeSurfItem,
  scoreSurfItem
} = require("../api/surf-pulse");

const NOW = Date.parse("2026-08-02T12:00:00Z");

function item(overrides = {}) {
  return {
    id: "pulse-1",
    source_type: "news",
    source_name: "THEBLOCK",
    event_type: "New Product / Upgrade",
    primary_url: "https://example.com/news",
    title: "Binance launches a major institutional product",
    summary: "The product was approved after a $250 million partnership.",
    source_count: 4,
    project: { id: "project-1", name: "Example", slug: "example", is_listed: true },
    published_at: "2026-08-02T10:00:00Z",
    ...overrides
  };
}

test("scores fresh multi-source high-impact Surf items near the top of the range", () => {
  assert.equal(scoreSurfItem(item(), NOW), 100);
});

test("freshness battery declines across the fifteen-day retention window", () => {
  assert.deepEqual(freshnessFor("2026-08-02T10:00:00Z", NOW), {
    ageHours: 2,
    ageDay: 0,
    batteryLevel: 5,
    batteryTone: "fresh"
  });
  assert.equal(freshnessFor("2026-08-01T10:00:00Z", NOW).batteryLevel, 4);
  assert.equal(freshnessFor("2026-08-01T10:00:00Z", NOW).batteryTone, "aging");
  assert.equal(freshnessFor(new Date(NOW - 5 * 86_400_000).toISOString(), NOW).batteryLevel, 3);
  assert.equal(freshnessFor(new Date(NOW - 10 * 86_400_000).toISOString(), NOW).batteryLevel, 2);
  assert.equal(freshnessFor(new Date(NOW - 14 * 86_400_000).toISOString(), NOW).batteryLevel, 1);
  assert.equal(freshnessFor(new Date(NOW - 14 * 86_400_000).toISOString(), NOW).batteryTone, "stale");
});

test("normalizes current Surf fields without carrying full article content", () => {
  const normalized = normalizeSurfItem(item({ content: "Full copyrighted article body" }), NOW);
  assert.equal(normalized.id, "pulse-1");
  assert.equal(normalized.project.name, "Example");
  assert.equal(normalized.batteryLevel, 5);
  assert.equal("content" in normalized, false);
});

test("keeps items through day fifteen and drops only older Surf items", () => {
  const boundaryItem = item({ published_at: new Date(NOW - RETENTION_MS).toISOString() });
  const expiredItem = item({ published_at: new Date(NOW - RETENTION_MS - 1).toISOString() });
  assert.notEqual(normalizeSurfItem(boundaryItem, NOW), null);
  assert.equal(normalizeSurfItem(expiredItem, NOW), null);
});

test("replaces unsafe source URLs with the Surf Pulse page", () => {
  const normalized = normalizeSurfItem(item({ primary_url: "javascript:alert(1)" }), NOW);
  assert.equal(normalized.url, "https://asksurf.ai/pulse");
});

test("collects and dedupes three Surf pages into ninety real-shaped items", async () => {
  const requestedUrls = [];
  let page = 0;
  const fetchImpl = async (url) => {
    requestedUrls.push(String(url));
    const offset = page * 30;
    page += 1;
    return {
      ok: true,
      async json() {
        return {
          data: {
            has_more: true,
            items: Array.from({ length: 30 }, (_, index) => item({
              id: `pulse-${offset + index + 1}`,
              published_at: new Date(NOW - (offset + index) * 3_600_000).toISOString()
            }))
          }
        };
      }
    };
  };

  const result = await collectSurfItems({ limit: 90, lang: "zh", now: NOW, fetchImpl });
  assert.equal(result.items.length, 90);
  assert.equal(result.received, 90);
  assert.equal(result.pagesFetched, 3);
  assert.equal(new Set(result.items.map((entry) => entry.id)).size, 90);
  assert.equal(requestedUrls.length, 3);
  assert.match(requestedUrls[1], /[?&]ts=\d+/);
  assert.equal(SYNC_INTERVAL_MS, 10 * 60 * 1000);
});

test("merges multiple realtime sources in chronological order", () => {
  const surf = normalizeSurfItem(item(), NOW);
  const telegram = {
    id: "aicoin2021-1",
    title: "New AiCoin update",
    url: "https://t.me/aicoin2021/1",
    publishedAt: "2026-08-02T11:00:00Z"
  };
  assert.deepEqual(mergeFeedItems([[surf], [telegram]], 2).map((entry) => entry.id), ["aicoin2021-1", "pulse-1"]);
});
