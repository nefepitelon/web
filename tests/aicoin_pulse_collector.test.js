const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  MemoryAicoinPulseStore,
  SYNC_INTERVAL_MS,
  authorizedCronRequest,
  classifyAicoinItem,
  mergeAicoinItems,
  parseAicoinPreviewHtml,
  syncAicoinPulse,
  upgradeCachedAicoinItem
} = require("../workers/aicoin_pulse_collector");
const { mergeFeedItems } = require("../api/surf-pulse");

const NOW = Date.parse("2026-09-14T02:00:00Z");

function message({ id, time, html }) {
  return `
    <div class="tgme_widget_message_wrap">
      <div class="tgme_widget_message" data-post="aicoin2021/${id}">
        <div class="tgme_widget_message_text">${html}</div>
        <a class="tgme_widget_message_date"><time datetime="${time}"></time></a>
      </div>
    </div>`;
}

const PREVIEW_HTML = `<!doctype html><html><body>
  ${message({
    id: 12001,
    time: "2026-09-14T01:40:00Z",
    html: "〖CVC 热度上升，24h 成交量放大〗<br>CVC 过去 24h 成交量放大至近 7 日平均的 13.5 倍，价格上涨 44.3%。<br>通过 AiCoin PRO「主力大单」进一步观察。<br>以上内容仅供参考。"
  })}
  ${message({
    id: 12002,
    time: "2026-09-14T01:45:00Z",
    html: "〖本周 ARB、ZRO、STRK 等代币将迎来大额解锁〗<br>ARB 于 9 月 16 日解锁 1228 万美元。"
  })}
  ${message({
    id: 12003,
    time: "2026-09-14T01:50:00Z",
    html: "〖注册 OKX，手续费返 20%〗<br>点击链接立即注册领取优惠"
  })}
</body></html>`;

test("parses AiCoin news with source time, classification and ad-line cleanup", () => {
  const result = parseAicoinPreviewHtml(PREVIEW_HTML, NOW);
  assert.equal(result.received, 3);
  assert.equal(result.filteredAds, 1);
  assert.equal(result.items.length, 2);

  const movement = result.items.find((item) => item.externalId === "12001");
  assert.equal(movement.title, "CVC 热度上升，24h 成交量放大");
  assert.equal(movement.eventType, "Market Movement");
  assert.equal(movement.publishedAt, "2026-09-14T01:40:00.000Z");
  assert.equal(movement.sourceName, "AiCoin Telegram");
  assert.equal(movement.sourceHubName, "Telegram");
  assert.doesNotMatch(movement.summary, /AiCoin PRO|主力大单/);
  assert.match(movement.url, /t\.me\/aicoin2021\/12001$/);

  const unlock = result.items.find((item) => item.externalId === "12002");
  assert.equal(unlock.eventType, "Token Unlock");
  assert.ok(unlock.score > 70);
});

test("classifies security, regulation and institutional updates before generic market movement", () => {
  assert.equal(classifyAicoinItem("跨链协议遭漏洞攻击，攻击者已套现"), "Security Incident");
  assert.equal(classifyAicoinItem("美国 SEC 推进数字资产法案"), "Regulatory / Legal Event");
  assert.equal(classifyAicoinItem("美国总统同意 Crypto Clarity Act 最终草案"), "Regulatory / Legal Event");
  assert.equal(classifyAicoinItem("英国央行内部加息辩论升温"), "Macroeconomics");
  assert.equal(classifyAicoinItem("Swift 与 17 家银行试点代币化存款跨境结算"), "Institutional Adoption");
});

test("deduplicates AiCoin items by message id and normalized headline", () => {
  const first = parseAicoinPreviewHtml(PREVIEW_HTML, NOW).items[0];
  const sameHeadline = { ...first, id: "aicoin2021-99999", externalId: "99999" };
  const merged = mergeAicoinItems([first], [sameHeadline, first]);
  assert.equal(merged.length, 1);
});

test("scheduled sync accumulates new messages without duplicating earlier snapshots", async () => {
  const store = new MemoryAicoinPulseStore();
  const fetchImpl = async () => ({ ok: true, async text() { return PREVIEW_HTML; } });
  const first = await syncAicoinPulse({ store, fetchImpl, now: NOW });
  const second = await syncAicoinPulse({ store, fetchImpl, now: NOW + SYNC_INTERVAL_MS });
  assert.equal(first.added, 2);
  assert.equal(second.added, 0);
  assert.equal(second.count, 2);
  assert.equal(store.snapshot.items.length, 2);
});

test("upgrades persisted snapshots with current classification and readable Chinese punctuation", () => {
  const upgraded = upgradeCachedAicoinItem({
    id: "aicoin2021-12004",
    title: "美国总统同意 Crypto Clarity Act 最终草案",
    summary: "监管机构将公布执行细则,市场等待进一步确认",
    eventType: "Market Update",
    publishedAt: "2026-09-14T01:55:00Z",
    score: 1
  }, NOW);
  assert.equal(upgraded.eventType, "Regulatory / Legal Event");
  assert.match(upgraded.summary, /细则，市场/);
  assert.ok(upgraded.score > 80);
});

test("cron authorization requires the configured bearer secret", () => {
  const env = { CRON_SECRET: "test-cron-secret" };
  assert.equal(authorizedCronRequest({ headers: { authorization: "Bearer test-cron-secret" } }, env), true);
  assert.equal(authorizedCronRequest({ headers: { authorization: "Bearer wrong" } }, env), false);
  assert.equal(authorizedCronRequest({ headers: {} }, env), false);
});

test("realtime feed deduplicates exact headlines across Surf and AiCoin", () => {
  const common = {
    title: "Swift 与 17 家银行试点代币化存款跨境结算",
    publishedAt: "2026-09-14T01:40:00Z",
    url: "https://example.com/swift"
  };
  const merged = mergeFeedItems([
    [{ ...common, id: "surf-1" }],
    [{ ...common, id: "aicoin-1", url: "https://t.me/aicoin2021/1" }]
  ], 10);
  assert.equal(merged.length, 1);
});

test("Vercel schedules the AiCoin collector every ten minutes", () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "vercel.json"), "utf8"));
  assert.ok(config.crons.some((cron) => cron.path === "/api/aicoin-pulse-collector" && cron.schedule === "*/10 * * * *"));
});
