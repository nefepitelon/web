const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "../alpha-scanner.js"), "utf8");
const context = vm.createContext({});
vm.runInContext(source.slice(source.indexOf("const TELEGRAM_SIGNAL_CHANNEL ="), source.indexOf("function strongSignalIdentity")), context);
const signal = (overrides = {}) => ({
  channel_username: "eqn_oi_price_monitor", source_mode: "public_preview", parse_status: "parsed", symbol: "BTC",
  oi_change_pct: 5.2, price_change_pct: 2.1, source_message_url: "https://t.me/EQN_OI_Price_monitor/20662", ...overrides
});

test("Alpha stream isolates EQN records before the latest-twenty limit", () => {
  const rows = [...Array.from({ length: 21 }, () => signal({ channel_username: "BWE_OI_Price_monitor" })), signal({ channel_username: " @EQN_OI_Price_monitor " })];
  assert.equal(context.currentTelegramSignals(rows).length, 1);
  assert.equal(context.currentTelegramSignals(rows)[0].symbol, "BTC");
  assert.equal(context.currentTelegramSignals(Array.from({ length: 30 }, () => signal())).length, 20);
});

test("notices, mock records and mismatched source links never reach the signal stream", () => {
  const invalid = [signal({ symbol: "UNKNOWN" }), signal({ parse_status: "unparsed" }), signal({ source_mode: "mock" }),
    signal({ source_message_url: "https://t.me/BWE_OI_Price_monitor/20662" }), signal({ source_message_url: "https://example.com/20662" }),
    signal({ oi_change_pct: null, price_change_pct: null })];
  assert.equal(context.currentTelegramSignals(invalid).length, 0);
});

test("valid Unicode tickers and unknown original clocks stay displayable without invented timestamps", () => {
  const rows = context.currentTelegramSignals([signal({ symbol: "龙虾", signal_time: null, signal_time_source: "unknown" })]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].symbol, "龙虾");
  assert.equal(rows[0].signal_time, null);
});

test("cached, fallback and wrong-channel payloads cannot enable automatic signal eligibility", () => {
  assert.equal(context.telegramFeedAllowsAuto({ target_channel: "EQN_OI_Price_monitor", stale: false }), true);
  for (const payload of [{ target_channel: "BWE_OI_Price_monitor" }, { target_channel: "EQN_OI_Price_monitor", stale: true },
    { target_channel: "EQN_OI_Price_monitor", fallback: "persistent_cache" }, {}]) {
    assert.equal(context.telegramFeedAllowsAuto(payload), false);
  }
});
