const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "..", "chrome-extension", "x-main-world.js"), "utf8");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createRuntimeHarness() {
  let content = "";
  let publishState = "";
  const pastePayloads = [];
  const messages = [];
  const windowListeners = new Map();
  const location = { origin: "https://x.com" };
  class FakeEvent {
    constructor(type, options = {}) { this.type = type; Object.assign(this, options); this.defaultPrevented = false; }
    preventDefault() { if (this.cancelable !== false) this.defaultPrevented = true; }
  }
  class FakeDataTransfer {
    constructor() { this.values = new Map(); }
    setData(type, value) { this.values.set(type, String(value)); }
    getData(type) { return this.values.get(type) || ""; }
  }
  const window = {
    addEventListener(type, handler) {
      if (!windowListeners.has(type)) windowListeners.set(type, new Set());
      windowListeners.get(type).add(handler);
    },
    removeEventListener(type, handler) { windowListeners.get(type)?.delete(handler); },
    postMessage(payload) { messages.push(payload); },
    getSelection() { return { removeAllRanges() {}, addRange() {} }; }
  };
  const editor = {
    offsetWidth: 800,
    offsetHeight: 180,
    getClientRects: () => [{}],
    focus() {},
    dispatchEvent(event) {
      if (event.type === "paste") {
        const text = event.clipboardData.getData("text/plain");
        pastePayloads.push(text);
        publishState = text;
        content = text;
        event.preventDefault();
      }
      return !event.defaultPrevented;
    },
    get innerText() { return content; },
    get textContent() { return content; }
  };
  const document = { querySelectorAll: () => [editor], createRange: () => ({ selectNodeContents() {} }) };
  const unrefTimeout = (callback, ms) => {
    const timer = setTimeout(callback, ms);
    timer.unref?.();
    return timer;
  };
  vm.runInNewContext(source, { window, document, location, Map, Promise, DataTransfer: FakeDataTransfer, ClipboardEvent: FakeEvent, Event: FakeEvent, Object, setTimeout: unrefTimeout, clearTimeout });
  const emit = (data) => windowListeners.get("message")?.forEach((handler) => handler({ source: window, origin: location.origin, data }));
  return { emit, messages, pastePayloads, content: () => content, published: () => publishState };
}

test("X main bridge delivers one paste transaction and one complete publish state", async () => {
  const harness = createRuntimeHarness();
  const text = "首行标题\n\n正文段落 #BTC 🚀\n\n末尾一行";
  const request = { source: "welinkbtc-x-isolated", type: "COMMIT_X_TEXT", requestId: "same-request", text };

  for (let attempt = 0; attempt < 5; attempt += 1) harness.emit(request);
  await sleep(650);

  assert.equal(harness.content(), text);
  assert.equal(harness.published(), text);
  assert.deepEqual(harness.pastePayloads, [text]);
  assert.equal(harness.messages.filter((message) => message.type === "COMMIT_X_RESULT").length, 1);
  assert.equal(harness.messages.find((message) => message.type === "COMMIT_X_RESULT")?.result?.stateAccepted, true);

  harness.emit(request);
  await sleep(20);
  assert.equal(harness.content(), text);
  assert.deepEqual(harness.pastePayloads, [text]);
  assert.equal(harness.messages.filter((message) => message.type === "COMMIT_X_RESULT").length, 2);
});
