const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const script = fs.readFileSync(path.join(__dirname, "../bstock-autotrade.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../bstock-alpha.html"), "utf8");
const defaults = { strategy: "adaptive", budgetUsd: 100, orderUsd: 20, maxPositions: 3, stopLossPct: 3, takeProfitPct: 6, maxDrawdownPct: 10, dailyLossPct: 5, intervalSeconds: 60 };
const walletAddress = "0x1111111111111111111111111111111111111111";
const response = (payload, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => structuredClone(payload) });
const snapshot = (extra = {}) => ({ ok: true, capability: "agentic", config: null, events: [], positions: [], manualBlockers: [], manualBlockerCount: 0, ...extra });
const reviewedBlocker = (id, extra = {}) => ({ id, symbol: "NVDAB", side: "buy", status: "SUBMITTED", orderId: `wallet-${id}`, reviewVersion: `version-${id}`, canIgnore: true, ...extra });
const reviewedSnapshot = (manualBlockers, extra = {}) => snapshot({ manualBlockers, manualBlockerCount: manualBlockers.length, manualReviewVersion: "batch-v1", manualIgnoreCount: manualBlockers.filter(item => item.canIgnore).length, manualIgnoreAllAvailable: true, ...extra });
const flush = async () => { await new Promise(setImmediate); await new Promise(setImmediate); };

function harness(fetchImpl) {
  const ids = new Map();
  const observers = [];
  const intervals = [];
  const calls = [];
  let context = { mode: "agent", address: walletAddress };
  class Element {
    constructor(tag = "div") { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = {}; this.value = ""; this.checked = false; this.disabled = false; this.hidden = false; this._text = ""; }
    set id(value) { this._id = value; ids.set(value, this); }
    get id() { return this._id; }
    set textContent(value) { this._text = String(value); this.children = []; }
    get textContent() { return this._text + this.children.map(item => item.textContent).join(""); }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key]; }
    addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
    emit(type, event = {}) { for (const callback of this.listeners[type] || []) callback({ preventDefault() {}, target: this, ...event }); }
    click() { if (!this.disabled) this.emit("click"); }
    append(...nodes) { for (const child of nodes) { if (child.tagName === "FRAGMENT") this.append(...child.children); else { this.children.push(child); child.parentElement = this; } } }
    replaceChildren(...nodes) { this.children = []; this._text = ""; this.append(...nodes); }
    before(element) { const parent = this.parentElement; const index = parent.children.indexOf(this); parent.children.splice(index, 0, element); element.parentElement = parent; }
    querySelectorAll(selector) {
      const all = this.children.flatMap(item => [item, ...item.querySelectorAll("*")]);
      if (selector === "*") return all;
      if (selector === "[data-auto-text]") return all.filter(item => item.dataset.autoText);
      if (selector === "input[name], select[name]") return all.filter(item => ["INPUT", "SELECT"].includes(item.tagName) && item.name);
      if (selector === "details[open]") return all.filter(item => item.tagName === "DETAILS" && item.open);
      if (selector.startsWith(".")) return all.filter(item => String(item.className || "").split(" ").includes(selector.slice(1)));
      return [];
    }
    setCustomValidity(value) { this.validationMessage = value; }
    reportValidity() { return true; }
    scrollIntoView() {}
    focus() {}
    remove() {}
  }
  const document = { documentElement: new Element("html"), body: new Element("body"), hidden: false, listeners: {},
    getElementById: id => ids.get(id), createElement: tag => new Element(tag), createDocumentFragment: () => new Element("fragment"),
    addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
  };
  document.documentElement.dataset.language = "zh";
  const root = new Element("section"); root.id = "bstock-autotrade"; document.body.append(root);
  for (const [, name] of html.matchAll(/id="autotrade-([^"]+)"/g)) { const element = new Element(); element.id = `autotrade-${name}`; root.append(element); }
  const form = ids.get("autotrade-settings"); form.hidden = true; form.elements = {};
  for (const [name, value] of Object.entries(defaults)) { const input = new Element(name === "strategy" ? "select" : "input"); input.name = name; input.value = value; form.elements[name] = input; form.append(input); }
  const window = { listeners: {}, BstockAutoWalletContext: { getState: () => context }, matchMedia: () => ({ matches: true }),
    addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); },
    emit(type) { for (const callback of this.listeners[type] || []) callback({ type }); }
  };
  vm.runInNewContext(script, { window, document, location: { origin: "https://preview.test" }, Date, Intl, URL, URLSearchParams, AbortController, Blob, Set, Map,
    MutationObserver: class { constructor(callback) { observers.push(callback); } observe() {} },
    setTimeout: () => 1, clearTimeout() {}, setInterval: callback => { intervals.push(callback); },
    fetch: async (url, options = {}) => { const call = { url, method: options.method || "GET", body: options.body ? JSON.parse(options.body) : null }; calls.push(call); return fetchImpl(call); }
  });
  return { ids, root, form, calls, intervals, window,
    el: name => ids.get(`autotrade-${name}`),
    setLanguage: value => { document.documentElement.dataset.language = value; observers.forEach(callback => callback()); },
    setWallet: value => { context = value; window.emit("bstock:wallet-context"); }
  };
}

test("manual blocker card shows total, first ten records and active quote deadline without asserting completion", async () => {
  const blockers = Array.from({ length: 12 }, (_, index) => ({ id: `record-${index}`, symbol: index === 0 ? "<img src=x>" : "NVDAB", side: "buy", status: index === 0 ? "SUBMISSION_UNKNOWN" : "INTENT_CREATED", orderId: `order-${index}`, createdAt: new Date().toISOString(), quoteValidUntil: index === 0 ? null : new Date(Date.now() + 60_000).toISOString() }));
  const app = harness(() => response(snapshot({ manualBlockers: blockers, manualBlockerCount: 12 })));
  await flush();
  assert.equal(app.el("reconcile").hidden, false);
  assert.equal(app.el("blockers").hidden, false);
  assert.equal(app.el("blockers").querySelectorAll(".autotrade-blocker").length, 10);
  assert.match(app.el("blockers").textContent, /共 12 条/);
  assert.match(app.el("blockers").textContent, /提交结果未知/);
  assert.match(app.el("blockers").textContent, /报价有效至/);
  assert.match(app.el("blockers").textContent, /<img src=x>/);
  assert.equal(app.root.querySelectorAll("*").filter(item => item.tagName === "IMG").length, 0);
  app.setLanguage("en");
  assert.equal(app.el("reconcile").textContent, "Reconcile past orders");
  assert.match(app.el("blockers").textContent, /Submission outcome unknown/);
  assert.match(app.el("blockers").textContent, /12 total/);
});

test("start conflict retains structured blockers and user settings, resets consent and never auto-retries", async () => {
  const blockers = [{ id: "stale-manual", symbol: "NVDAB", side: "sell", status: "SUBMITTED", orderId: "old-order", createdAt: new Date(0).toISOString() }];
  let blocked = false;
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  const app = harness(call => call.method === "POST" ? delayed : response(snapshot(blocked ? { manualBlockers: blockers, manualBlockerCount: 1 } : {})));
  await flush();
  app.el("toggle").click();
  app.form.elements.budgetUsd.value = 150;
  app.el("acknowledged").checked = true;
  app.el("acknowledged").emit("change");
  app.form.emit("submit");
  assert.equal(app.el("start").textContent, "核对历史订单并检查授权…");
  blocked = true;
  release(response({ ok: false, error: "存在待核对订单", manualBlockers: blockers, manualBlockerCount: 1 }, 409));
  await flush();
  assert.equal(app.form.hidden, false);
  assert.equal(app.form.elements.budgetUsd.value, 150);
  assert.equal(app.el("acknowledged").checked, false);
  assert.equal(app.el("start").disabled, true);
  assert.match(app.el("blockers").textContent, /old-order/);
  assert.equal(app.el("toggle").getAttribute("aria-checked"), "false");
  app.intervals.forEach(callback => callback());
  await flush();
  assert.deepEqual(app.calls.filter(call => call.method === "POST").map(call => call.body.action), ["start"]);
});

test("explicit reconciliation reports counts and lookup uncertainty without enabling or submitting another action", async () => {
  const blockers = [{ id: "unknown", symbol: "AAPLB", side: "buy", status: "SUBMISSION_UNKNOWN" }];
  const app = harness(call => response(snapshot({ manualBlockers: blockers, manualBlockerCount: 1, ...(call.method === "POST" ? { reconciliation: { reconciled: 2, remaining: 1, lookupFailed: true } } : {}) })));
  await flush();
  app.el("reconcile").click();
  await flush();
  assert.deepEqual(app.calls.filter(call => call.method === "POST").map(call => call.body), [{ action: "reconcile" }]);
  assert.match(app.el("message").textContent, /已核对 2 条记录，仍有 1 条待处理/);
  assert.match(app.el("message").textContent, /未知订单仍保留待核对/);
  assert.match(app.el("message").textContent, /自动交易未开启/);
  assert.equal(app.el("toggle").getAttribute("aria-checked"), "false");
  app.setLanguage("en");
  assert.match(app.el("message").textContent, /Reconciled 2 records; 1 still need attention/);
  assert.match(app.el("message").textContent, /Auto trading was not started/);
});

test("a previous wallet's delayed reconciliation cannot expose blockers after switching to browser mode", async () => {
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  const app = harness(call => call.method === "POST" ? delayed : response(snapshot({ capability: call.url.includes("provider=browser") ? "browser" : "agentic" })));
  await flush();
  app.el("reconcile").click();
  app.setWallet({ mode: "browser", address: "0x2222222222222222222222222222222222222222" });
  release(response(snapshot({ manualBlockers: [{ id: "private-old-wallet-order", symbol: "OLD" }], manualBlockerCount: 1, reconciliation: { reconciled: 1, remaining: 1 } })));
  await flush();
  assert.equal(app.el("reconcile").hidden, true);
  assert.equal(app.el("reconcile").disabled, true);
  assert.equal(app.el("blockers").hidden, true);
  assert.doesNotMatch(app.root.textContent, /private-old-wallet-order/);
  assert.equal(app.el("message").hidden, true);
  app.el("reconcile").click();
  assert.equal(app.calls.filter(call => call.method === "POST").length, 1);
});

test("ignore actions require a separate accessible confirmation and cancel never mutates", async () => {
  const app = harness(() => response(reviewedSnapshot([reviewedBlocker("past-1")])));
  await flush();
  assert.equal(app.el("ignore-all").disabled, false);
  assert.equal(app.el("blockers").querySelectorAll(".autotrade-ignore-one").length, 1);
  app.el("ignore-all").click();
  assert.equal(app.el("ignore-confirmation").getAttribute("role"), "group");
  assert.equal(app.el("ignore-confirmation").getAttribute("aria-labelledby"), "autotrade-ignore-title");
  assert.match(app.el("ignore-confirmation").textContent, /自行核对钱包订单及链上记录/);
  assert.match(app.el("ignore-confirmation").textContent, /不会撤单、不会将订单标为成交，也不会删除/);
  assert.match(app.el("ignore-confirmation").textContent, /原订单仍可能执行/);
  assert.match(app.el("ignore-confirmation").textContent, /不自动启用交易，新订单不受影响/);
  assert.equal(app.el("ignore-confirm").disabled, true);
  app.el("ignore-confirm").click();
  assert.equal(app.calls.filter(call => call.method === "POST").length, 0);
  app.el("ignore-acknowledged").checked = true;
  app.el("ignore-acknowledged").emit("change");
  assert.equal(app.el("ignore-confirm").disabled, false);
  app.setLanguage("en");
  assert.match(app.el("ignore-confirmation").textContent, /does not cancel an order, mark it filled or delete its record/);
  assert.match(app.el("ignore-confirmation").textContent, /does not enable trading or affect new orders/);
  app.el("ignore-cancel").click();
  assert.equal(app.root.querySelectorAll(".autotrade-ignore-confirmation").length, 0);
  assert.equal(app.el("ignore-all").disabled, false);
  assert.equal(app.calls.filter(call => call.method === "POST").length, 0);
});

test("single-record ignore sends its exact reviewed version, preserves settings and clears start consent without starting", async () => {
  let ignored = false;
  const first = reviewedBlocker("reviewed-first");
  const second = reviewedBlocker("untouched-second", { symbol: "AAPLB" });
  const app = harness(call => {
    if (call.method === "POST") { ignored = true; return response(reviewedSnapshot([second], { manualReviewVersion: "batch-v2", ignored: { count: 1 } })); }
    return response(reviewedSnapshot(ignored ? [second] : [first, second], { manualReviewVersion: ignored ? "batch-v2" : "batch-v1" }));
  });
  await flush();
  app.el("toggle").click();
  app.form.elements.budgetUsd.value = 250;
  app.el("acknowledged").checked = true;
  app.el("acknowledged").emit("change");
  app.el("blockers").querySelectorAll(".autotrade-ignore-one")[0].click();
  assert.match(app.el("ignore-confirmation").textContent, /wallet-reviewed-first/);
  assert.equal(app.el("start").disabled, true);
  app.form.emit("submit");
  assert.equal(app.calls.filter(call => call.method === "POST").length, 0);
  app.el("ignore-acknowledged").checked = true;
  app.el("ignore-acknowledged").emit("change");
  app.el("ignore-confirm").click();
  await flush();
  assert.deepEqual(app.calls.filter(call => call.method === "POST").map(call => call.body), [{ action: "ignore-manual", scope: "one", recordId: first.id, reviewVersion: first.reviewVersion, acknowledged: true }]);
  assert.match(app.calls.find(call => call.method === "POST").url, /provider=agent/);
  assert.equal(app.form.hidden, false);
  assert.equal(app.form.elements.budgetUsd.value, 250);
  assert.equal(app.el("acknowledged").checked, false);
  assert.equal(app.el("start").disabled, true);
  assert.equal(app.el("toggle").getAttribute("aria-checked"), "false");
  assert.match(app.el("message").textContent, /已忽略 1 条/);
  assert.match(app.el("message").textContent, /设置已保留/);
  assert.doesNotMatch(app.el("blockers").textContent, /wallet-reviewed-first/);
  assert.match(app.el("blockers").textContent, /wallet-untouched-second/);
  app.intervals.forEach(callback => callback());
  await flush();
  assert.equal(app.calls.filter(call => call.method === "POST").length, 1);
});

test("batch ignore counts only eligible historical orders and posts the complete snapshot fingerprint including unshown records", async () => {
  const quotes = Array.from({ length: 2 }, (_, index) => reviewedBlocker(`quote-${index}`, { status: "INTENT_CREATED", canIgnore: false, quoteValidUntil: new Date(Date.now() + 90_000).toISOString() }));
  const rows = [...quotes, ...Array.from({ length: 11 }, (_, index) => reviewedBlocker(`past-${index}`))];
  let ignored = false;
  const app = harness(call => {
    if (call.method === "POST") { ignored = true; return response(reviewedSnapshot(quotes, { manualReviewVersion: "quotes-only", ignored: { count: 11 } })); }
    return response(reviewedSnapshot(ignored ? quotes : rows, { manualReviewVersion: ignored ? "quotes-only" : "all-thirteen-records" }));
  });
  await flush();
  assert.equal(app.el("blockers").querySelectorAll(".autotrade-blocker").length, 10);
  assert.equal(app.el("blockers").querySelectorAll(".autotrade-ignore-one")[0].disabled, true);
  assert.match(app.el("blockers").textContent, /报价不能忽略/);
  app.el("ignore-all").click();
  assert.match(app.el("ignore-title").textContent, /11 条/);
  assert.doesNotMatch(app.el("ignore-title").textContent, /13 条/);
  assert.match(app.el("ignore-confirmation").textContent, /仍需等待报价有效期结束/);
  app.el("ignore-acknowledged").checked = true;
  app.el("ignore-acknowledged").emit("change");
  app.el("ignore-confirm").click();
  await flush();
  assert.deepEqual(app.calls.filter(call => call.method === "POST").map(call => call.body), [{ action: "ignore-manual", scope: "all", reviewVersion: "all-thirteen-records", acknowledged: true }]);
  assert.match(app.el("message").textContent, /已忽略 11 条/);
  assert.match(app.el("blockers").textContent, /共 2 条/);
  assert.equal(app.el("ignore-all").disabled, true);
  assert.equal(app.el("toggle").getAttribute("aria-checked"), "false");
});

test("a changed batch disables its old confirmation and server conflicts never expand or retry the ignore", async () => {
  const rows = [reviewedBlocker("old")];
  let version = "batch-v1";
  let posts = 0;
  const app = harness(call => {
    if (call.method === "POST") {
      posts += 1;
      version = "batch-v3";
      rows.push(reviewedBlocker("arrived-during-post"));
      return response({ ...reviewedSnapshot(rows, { manualReviewVersion: version }), ok: false, code: "MANUAL_REVIEW_CHANGED", error: "快照已变化，请重新核对" }, 409);
    }
    return response(reviewedSnapshot(rows, { manualReviewVersion: version }));
  });
  await flush();
  app.el("ignore-all").click();
  app.el("ignore-acknowledged").checked = true;
  app.el("ignore-acknowledged").emit("change");
  version = "batch-v2";
  rows.push(reviewedBlocker("arrived-during-review"));
  app.intervals.forEach(callback => callback());
  await flush();
  assert.equal(app.el("ignore-confirm").disabled, true);
  assert.match(app.el("ignore-confirmation").textContent, /列表或状态已更新/);
  app.el("ignore-confirm").click();
  assert.equal(posts, 0);
  app.el("ignore-cancel").click();
  app.el("ignore-all").click();
  app.el("ignore-acknowledged").checked = true;
  app.el("ignore-acknowledged").emit("change");
  app.el("ignore-confirm").click();
  await flush();
  assert.equal(posts, 1);
  assert.equal(app.calls.find(call => call.method === "POST").body.reviewVersion, "batch-v2");
  assert.equal(app.root.querySelectorAll(".autotrade-ignore-confirmation").length, 0);
  assert.match(app.el("message").textContent, /快照已变化/);
  assert.equal(app.el("acknowledged").checked, false);
  app.intervals.forEach(callback => callback());
  await flush();
  assert.equal(posts, 1);
  assert.match(app.el("blockers").textContent, /arrived-during-post/);
});

test("large total batches disable ignore-all but still permit individually reviewed historical records", async () => {
  const app = harness(() => response(reviewedSnapshot([reviewedBlocker("single")], { manualBlockerCount: 1001, manualIgnoreCount: 1, manualIgnoreAllAvailable: false })));
  await flush();
  assert.equal(app.el("ignore-all").disabled, true);
  assert.match(app.el("blockers").textContent, /超过 1,000 条，批量忽略不可用/);
  assert.equal(app.el("blockers").querySelectorAll(".autotrade-ignore-one")[0].disabled, false);
  app.el("ignore-all").click();
  assert.equal(app.root.querySelectorAll(".autotrade-ignore-confirmation").length, 0);
  app.el("blockers").querySelectorAll(".autotrade-ignore-one")[0].click();
  assert.equal(app.root.querySelectorAll(".autotrade-ignore-confirmation").length, 1);
  assert.equal(app.calls.filter(call => call.method === "POST").length, 0);
});

test("wallet changes invalidate ignore consent and delayed results cannot leak into browser mode", async () => {
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  const app = harness(call => call.method === "POST" ? delayed : response(call.url.includes("provider=browser") ? snapshot({ capability: "browser" }) : reviewedSnapshot([reviewedBlocker("agent-only-order")])));
  await flush();
  app.el("ignore-all").click();
  app.el("ignore-acknowledged").checked = true;
  app.el("ignore-acknowledged").emit("change");
  app.el("ignore-confirm").click();
  app.setWallet({ mode: "browser", address: "0x2222222222222222222222222222222222222222" });
  release(response(reviewedSnapshot([reviewedBlocker("secret-old-wallet-result")], { ignored: { count: 1 } })));
  await flush();
  assert.equal(app.root.querySelectorAll(".autotrade-ignore-confirmation").length, 0);
  assert.equal(app.root.querySelectorAll(".autotrade-ignore-action").length, 0);
  assert.equal(app.el("blockers").hidden, true);
  assert.equal(app.el("message").hidden, true);
  assert.doesNotMatch(app.root.textContent, /secret-old-wallet-result/);
  assert.equal(app.el("acknowledged").checked, false);
  assert.equal(app.calls.filter(call => call.method === "POST").length, 1);
});

test("the wallet epoch rejects an old ignore response even after switching back to the same agent address", async () => {
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  const app = harness(call => call.method === "POST" ? delayed : response(reviewedSnapshot([reviewedBlocker("still-visible")])));
  await flush();
  app.el("ignore-all").click();
  app.el("ignore-acknowledged").checked = true;
  app.el("ignore-acknowledged").emit("change");
  app.el("ignore-confirm").click();
  app.setWallet({ mode: "browser", address: walletAddress });
  app.setWallet({ mode: "agent", address: walletAddress });
  release(response(reviewedSnapshot([], { ignored: { count: 999 } })));
  await flush();
  assert.equal(app.el("message").hidden, true);
  assert.doesNotMatch(app.root.textContent, /999/);
  assert.match(app.el("blockers").textContent, /still-visible/);
  assert.equal(app.root.querySelectorAll(".autotrade-ignore-confirmation").length, 0);
  assert.equal(app.el("acknowledged").checked, false);
  assert.equal(app.calls.filter(call => call.method === "POST").length, 1);
});
