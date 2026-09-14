const test = require("node:test");
const assert = require("node:assert/strict");

const {
  MemorySignalStore,
  SupabaseSignalStore,
  collectPublicPreviewSignals,
  collectTelegramSignals,
  makeDedupeHash,
  parseTelegramSignal,
  publicPreviewMessagesFromHtml,
  publicPreviewMessagesFromMarkdown,
  telegramMessagesFromUpdate,
  verifiedSignalTime
} = require("../workers/telegram_signal_collector");

test("parses the target channel bilingual OI-up price-up format", () => {
  const raw = `🇨🇳 🟢 [1000RATSUSDT] 币安未平仓合约量 +5.7%，过去 3600 秒价格上涨 15.0%，未平仓合约量：2130 万美元，24 小时价格变动：+99.5%
🇺🇸 🟢 [1000RATSUSDT] Binance openinterest +5.7%, Price +15.0% in the past 3600 seconds, OI: $21.3M`;
  const signal = parseTelegramSignal(raw, {
    channelId: -100123,
    channelUsername: "BWE_OI_Price_monitor",
    messageId: 88,
    signalTime: 1785584000,
    sourceMode: "webhook"
  });

  assert.equal(signal.symbol, "1000RATS");
  assert.equal(signal.pair, "1000RATSUSDT");
  assert.equal(signal.direction, "long");
  assert.equal(signal.price, null);
  assert.equal(signal.price_change_pct, 15);
  assert.equal(signal.oi_change_pct, 5.7);
  assert.equal(signal.trigger_type, "oi_up_price_up");
  assert.equal(signal.parse_status, "parsed");
  assert.ok(signal.confidence >= 0.9);
  assert.equal(signal.telegram_message_id, "88");
});

test("parses OI-up price-down as a short trigger", () => {
  const signal = parseTelegramSignal("🔻 [SNXXUSDT] Binance openinterest +11.7%, Price -7.6% in the past 3600 seconds");
  assert.equal(signal.symbol, "SNXX");
  assert.equal(signal.direction, "short");
  assert.equal(signal.price_change_pct, -7.6);
  assert.equal(signal.oi_change_pct, 11.7);
  assert.equal(signal.trigger_type, "oi_up_price_down");
});

test("parses OI-down price-up as the correct divergence quadrant", () => {
  const signal = parseTelegramSignal("🟢 [KOMAUSDT] 币安未平仓合约量 -10.0%，过去 3600 秒价格上涨 12.4%");
  assert.equal(signal.symbol, "KOMA");
  assert.equal(signal.direction, "long");
  assert.equal(signal.trigger_type, "oi_down_price_up");
});

test("parses a structured English signal with an absolute price", () => {
  const signal = parseTelegramSignal(`Symbol: BTCUSDT
Direction: LONG
Price: $63,250.50
OI Change: +8.2%
Trigger Type: OI Breakout
Time: 2026-08-01T10:20:30Z`);

  assert.equal(signal.symbol, "BTC");
  assert.equal(signal.direction, "long");
  assert.equal(signal.price, 63250.5);
  assert.equal(signal.price_change_pct, null);
  assert.equal(signal.oi_change_pct, 8.2);
  assert.equal(signal.trigger_type, "oi_breakout");
  assert.equal(signal.signal_time, "2026-08-01T10:20:30.000Z");
  assert.equal(signal.parse_status, "parsed");
});

test("parses word-based price and OI changes with a bare LONG marker", () => {
  const signal = parseTelegramSignal("BTCUSDT LONG | Price increased 3.5% | OI decreased 2.1% | Trigger volume spike");
  assert.equal(signal.symbol, "BTC");
  assert.equal(signal.direction, "long");
  assert.equal(signal.price_change_pct, 3.5);
  assert.equal(signal.oi_change_pct, -2.1);
  assert.equal(signal.trigger_type, "volume_spike");
  assert.equal(signal.parse_status, "parsed");
});

test("parses compact Chinese fields and liquidation trigger", () => {
  const signal = parseTelegramSignal("币种：ETH/USDT 方向：空 价格：1823.5 OI变化：-4.2% 触发类型：多单爆仓 时间：2026-08-01 18:30:00+08:00");
  assert.equal(signal.symbol, "ETH");
  assert.equal(signal.direction, "short");
  assert.equal(signal.price, 1823.5);
  assert.equal(signal.oi_change_pct, -4.2);
  assert.equal(signal.trigger_type, "liquidation");
  assert.equal(signal.signal_time, "2026-08-01T10:30:00.000Z");
});

test("keeps unparseable text with low confidence", () => {
  const raw = "市场突然有点热，继续观察。";
  const signal = parseTelegramSignal(raw);
  assert.equal(signal.symbol, null);
  assert.equal(signal.direction, "unknown");
  assert.equal(signal.parse_status, "unparsed");
  assert.ok(signal.confidence < 0.5);
  assert.equal(signal.raw_text, raw);
});

test("dedupe hash is stable for the same Telegram message identity", () => {
  const first = makeDedupeHash({ channelId: -1001, messageId: 99, rawText: "BTC long" });
  const edited = makeDedupeHash({ channelId: -1001, messageId: 99, rawText: "BTC long edited" });
  const next = makeDedupeHash({ channelId: -1001, messageId: 100, rawText: "BTC long" });
  assert.equal(first, edited);
  assert.notEqual(first, next);
});

test("dedupe hash matches between public preview and webhook modes", () => {
  const preview = makeDedupeHash({ channelUsername: "BWE_OI_Price_monitor", messageId: 17131, rawText: "preview" });
  const webhook = makeDedupeHash({
    channelId: -100123,
    channelUsername: "@BWE_OI_Price_monitor",
    messageId: 17131,
    rawText: "webhook"
  });
  assert.equal(preview, webhook);
});

test("extracts the latest 20 messages from Telegram public preview HTML", () => {
  const html = Array.from({ length: 22 }, (_, index) => {
    const messageId = index + 1;
    return `<div class="tgme_widget_message_wrap js-widget_message_wrap">
      <div class="tgme_widget_message" data-post="BWE_OI_Price_monitor/${messageId}">
        <div class="tgme_widget_message_text js-message_text" dir="auto"><i><b>🟢</b></i> [TOKEN${messageId}USDT] 币安未平仓合约量 +${messageId}.0%，过去 3600 秒价格上涨 ${messageId + 1}.0%<br/>Price +${messageId + 1}.0%</div>
        <time datetime="2026-08-01T00:${String(messageId).padStart(2, "0")}:00+00:00">time</time>
      </div>
    </div>`;
  }).join("");

  const messages = publicPreviewMessagesFromHtml(html);
  assert.equal(messages.length, 20);
  assert.equal(messages[0].options.messageId, "3");
  assert.equal(messages[19].options.messageId, "22");
  assert.match(messages[19].rawText, /TOKEN22USDT/);
  assert.match(messages[19].rawText, /🟢/);
  assert.match(messages[19].rawText, /Price \+23\.0%/);
});

test("public preview collection parses and stores real-shaped messages", async () => {
  const html = `<div class="tgme_widget_message_wrap js-widget_message_wrap">
    <div data-post="BWE_OI_Price_monitor/17131">
      <div class="tgme_widget_message_text js-message_text" dir="auto">[1000SATSUSDT] 币安未平仓合约量 +5.4%，过去 3600 秒价格上涨 10.0%<br/>[1000SATSUSDT] Binance openinterest +5.4%, Price +10.0%</div>
      <time datetime="2026-08-01T07:38:21+00:00">07:38</time>
    </div>
  </div>`;
  const store = new MemorySignalStore();
  const result = await collectPublicPreviewSignals({
    store,
    fetchImpl: async () => ({ ok: true, text: async () => html })
  });

  assert.equal(result.received, 1);
  assert.equal(result.parsed, 1);
  assert.equal(result.latest[0].symbol, "1000SATS");
  assert.equal(result.latest[0].source_mode, "public_preview");
  assert.equal(result.latest[0].source_message_url, "https://t.me/BWE_OI_Price_monitor/17131");
});

test("extracts signal messages from the read-only Markdown fallback", () => {
  const markdown = `[](https://t.me/BWE_OI_Price_monitor/20001)
_**🟢**_ [SOLUSDT] 币安未平仓合约量 +7.0%，过去 3600 秒价格上涨 4.0%
_**🟢**_ [SOLUSDT] Binance openinterest +7.0%, Price +4.0%

[](https://t.me/BWE_OI_Price_monitor/20002)
_**🔻**_ [ETHUSDT] Binance openinterest +8.0%, Price -5.0%`;
  const messages = publicPreviewMessagesFromMarkdown(markdown);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].options.messageId, "20001");
  assert.match(messages[1].rawText, /ETHUSDT/);
  assert.equal(messages[0].options.signalTime, null);
  const signals = messages.map((message) => parseTelegramSignal(message.rawText, message.options));
  assert.ok(signals.every((signal) => signal.signal_time === null && signal.signal_time_source === "unknown"));
});

test("missing or invalid source times remain unknown instead of using collection time", () => {
  const raw = "[SOLUSDT] OI +7.0%, Price +4.0%";
  for (const signalTime of [undefined, null, "", "not-a-date"]) {
    const signal = parseTelegramSignal(raw, { signalTime, sourceMode: "public_preview" });
    assert.equal(signal.signal_time, null);
    assert.equal(signal.signal_time_source, "unknown");
    assert.ok(signal.received_at, "receipt time remains available separately");
  }
});

test("legacy synthesized preview times are suppressed while genuine source times are preserved", () => {
  const signal = { source_mode: "public_preview", received_at: "2026-09-09T10:00:00Z", signal_time: "2026-09-09T09:59:45Z" };
  assert.equal(verifiedSignalTime(signal), null);
  assert.equal(verifiedSignalTime({ ...signal, signal_time_source: "source_timestamp" }), "2026-09-09T09:59:45.000Z");
  assert.equal(verifiedSignalTime({ ...signal, signal_time: "2026-09-09T08:00:00Z" }), "2026-09-09T08:00:00.000Z");
  assert.equal(verifiedSignalTime({ ...signal, source_mode: "webhook" }), "2026-09-09T09:59:45.000Z");
});

test("fresh untimed messages keep Telegram message order and replace stale synthesized cache entries", async () => {
  const markdown = `[](https://t.me/BWE_OI_Price_monitor/20001)
[SOLUSDT] OI +7.0%, Price +4.0%
[](https://t.me/BWE_OI_Price_monitor/20002)
[ETHUSDT] OI +8.0%, Price -5.0%`;
  const inputs = publicPreviewMessagesFromMarkdown(markdown);
  const previous = inputs.map((input) => parseTelegramSignal(input.rawText, { ...input.options, signalTime: new Date().toISOString() }));
  const result = await collectPublicPreviewSignals({
    store: new MemorySignalStore(previous),
    fetchImpl: async (url) => {
      if (!url.includes("r.jina.ai")) throw new Error("direct preview unavailable");
      return { ok: true, text: async () => markdown };
    }
  });
  assert.deepEqual(result.latest.map((signal) => signal.telegram_message_id), ["20002", "20001"]);
  assert.ok(result.latest.every((signal) => signal.signal_time === null));
});

test("the existing Supabase schema receives only timestamped records and no unsupported metadata", async () => {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, options) => { requests.push(JSON.parse(options.body)); return { ok: true }; };
  try {
    const store = new SupabaseSignalStore({ url: "https://example.invalid", serviceRoleKey: "unit-test" });
    const raw = "[SOLUSDT] OI +7.0%, Price +4.0%";
    const untimed = parseTelegramSignal(raw, { sourceMode: "public_preview" });
    assert.deepEqual(await store.upsertMany([untimed]), { inserted: 0, duplicates: 0 });
    assert.equal(requests.length, 0);
    const timed = parseTelegramSignal(raw, { sourceMode: "public_preview", signalTime: "2026-09-09T08:00:00Z" });
    await store.upsertMany([untimed, timed]);
    assert.equal(requests[0].length, 1);
    assert.equal(requests[0][0].signal_time, "2026-09-09T08:00:00.000Z");
    assert.equal("signal_time_source" in requests[0][0], false);
  } finally {
    global.fetch = originalFetch;
  }
});

test("public preview collection falls back to the fresh read-only proxy", async () => {
  const markdown = `[](https://t.me/BWE_OI_Price_monitor/20001)
[SOLUSDT] OI +7.0%, Price +4.0%`;
  const requests = [];
  const result = await collectPublicPreviewSignals({
    store: new MemorySignalStore(),
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (requests.length === 1) throw new Error("Telegram host unavailable");
      return { ok: true, text: async () => markdown };
    }
  });

  assert.equal(requests.length, 2);
  assert.match(requests[1].url, /^https:\/\/r\.jina\.ai\/https:\/\/t\.me\/s\//);
  assert.equal(requests[1].options.headers["x-no-cache"], "true");
  assert.equal(requests[1].options.headers["x-cache-tolerance"], "0");
  assert.equal(result.source_kind, "jina_fresh_reader");
  assert.equal(result.latest[0].symbol, "SOL");
});

test("live public preview is returned when persistent storage is unavailable", async () => {
  const html = `<div class="tgme_widget_message_wrap js-widget_message_wrap">
    <div data-post="BWE_OI_Price_monitor/20003">
      <div class="tgme_widget_message_text js-message_text">[ETHUSDT] Binance openinterest +6.0%, Price -4.0%</div>
      <time datetime="2026-08-02T02:00:00+00:00">02:00</time>
    </div>
  </div>`;
  const suspendedStore = {
    name: "vercel-blob",
    async upsertMany() {
      throw new Error("store suspended");
    },
    async listRecent() {
      return [];
    }
  };
  const result = await collectPublicPreviewSignals({
    store: suspendedStore,
    fetchImpl: async () => ({ ok: true, text: async () => html })
  });

  assert.equal(result.storage_degraded, true);
  assert.equal(result.storage_error, "store suspended");
  assert.equal(result.latest.length, 1);
  assert.equal(result.latest[0].symbol, "ETH");
});

test("mock mode keeps a rolling latest-20 set and dedupes equal texts", async () => {
  const store = new MemorySignalStore();
  const texts = Array.from({ length: 22 }, (_, index) => ({
    text: `[TOKEN${index}USDT] OI Change: +${index + 1}% Price +${index + 2}%`,
    timestamp: new Date(Date.UTC(2026, 7, 1, 0, index)).toISOString()
  }));
  texts.push(texts[texts.length - 1]);

  const result = await collectTelegramSignals({
    mode: "mock",
    payload: { texts },
    store
  });

  assert.equal(result.received, 20);
  assert.equal(result.latest.length, 19);
  assert.equal(result.duplicates, 1);
  assert.equal(result.latest[0].symbol, "TOKEN21");
});

test("webhook mode accepts only the configured target channel", async () => {
  const targetUpdate = {
    channel_post: {
      message_id: 7,
      date: 1785584000,
      chat: { id: -10088, username: "BWE_OI_Price_monitor" },
      text: "[SOLUSDT] Binance openinterest +4.1%, Price +3.2%"
    }
  };
  const otherUpdate = {
    channel_post: {
      message_id: 8,
      date: 1785584001,
      chat: { id: -10089, username: "another_channel" },
      text: "[BTCUSDT] OI +9%, Price +5%"
    }
  };

  assert.equal(telegramMessagesFromUpdate(targetUpdate).length, 1);
  assert.equal(telegramMessagesFromUpdate(otherUpdate).length, 0);

  const result = await collectTelegramSignals({
    mode: "webhook",
    payload: { updates: [targetUpdate, otherUpdate] },
    store: new MemorySignalStore()
  });
  assert.equal(result.received, 1);
  assert.equal(result.latest[0].symbol, "SOL");
  assert.equal(result.latest[0].source_mode, "webhook");
});
