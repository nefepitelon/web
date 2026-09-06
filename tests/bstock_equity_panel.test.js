const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "bstock-equity-panel.js"), "utf8");
const html = fs.readFileSync(path.join(root, "bstock-alpha.html"), "utf8");

class Element {
  constructor() {
    this.attributes = new Map(); this.events = new Map(); this.children = [];
    this.open = false; this.hidden = false; this.textContent = "";
    const classes = new Set();
    this.classList = {
      add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name),
      toggle(name) { if (classes.has(name)) { classes.delete(name); return false; } classes.add(name); return true; }
    };
  }
  addEventListener(name, callback) { const handlers = this.events.get(name) || []; handlers.push(callback); this.events.set(name, handlers); }
  emit(name, event = {}) { for (const handler of this.events.get(name) || []) handler({ target: this, ...event }); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name); }
  replaceChildren(...children) { this.children = children; }
  showModal() { this.open = true; }
  close() { this.open = false; this.emit("close"); }
  focus() { this.focused = true; }
  getBoundingClientRect() { return { left: 400, top: 14, right: 1400, bottom: 900 }; }
}
function fixture() {
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => [match[1], new Element()]));
  const frames = [], timers = new Map();
  const document = new Element();
  document.body = new Element();
  document.getElementById = (id) => elements.get(id) || null;
  document.createElement = (name) => { assert.equal(name, "iframe"); const frame = new Element(); frames.push(frame); return frame; };
  let id = 0;
  vm.runInNewContext(source, { document, setTimeout: (fn) => { timers.set(++id, fn); return id; }, clearTimeout: (id) => timers.delete(id) });
  return { document, frames, timers, get: document.getElementById, open: () => document.getElementById("open-equity-panel").emit("click") };
}

test("equity button sits before POLICY and its independent assets are deployed through the legacy allowlist", () => {
  assert.ok(html.indexOf('id="open-equity-panel"') < html.indexOf('class="mode-switch"'));
  assert.match(html, /美股<span class="equity-launch-en">US Stock<\/span>全览/);
  assert.match(html, /aria-controls="equity-panel" aria-expanded="false"/);
  assert.match(html, /aria-labelledby="equity-panel-title"/);
  assert.match(html, /bstock-equity-panel\.js\?v=20260904-equity-panel-v2/);
  assert.match(html, /bstock-equity-panel\.css\?v=20260904-equity-panel-v2/);
  const result = spawnSync(process.execPath, ["--import", "tsx", "-e", `
    const assert = require('node:assert/strict');
    const { serveLegacy } = require('./lib/legacy-route.ts');
    (async () => {
      const page = await serveLegacy(new Request('http://localhost/legacy/bstock-alpha?embedded=1'), ['bstock-alpha']);
      assert.equal(page.status, 200);
      const html = await page.text();
      assert.match(html, /data-legacy-source="bstock-equity-panel.css"/);
      assert.match(html, /src="\\/legacy\\/bstock-equity-panel.js\\?v=20260904-equity-panel-v2"/);
      for (const name of ['bstock-equity-panel.js', 'bstock-equity-panel.css']) {
        assert.equal((await serveLegacy(new Request('http://localhost/legacy/' + name), [name])).status, 200);
      }
      assert.equal((await serveLegacy(new Request('http://localhost/legacy/private.js'), ['private.js'])).status, 404);
    })().catch(e => { console.error(e); process.exitCode = 1; });
  `], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("equity drawer only exposes refresh and close, without external links or wide mode", () => {
  const panel = html.match(/<dialog class="equity-panel"[\s\S]*?<\/dialog>/)?.[0];
  assert.ok(panel);
  assert.deepEqual([...panel.matchAll(/<button\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1]), ["reload-equity-panel", "close-equity-panel"]);
  assert.doesNotMatch(panel, /<a\b|<footer\b|独立打开|新窗口|aria-describedby/);
  const css = fs.readFileSync(path.join(root, "bstock-equity-panel.css"), "utf8");
  assert.doesNotMatch(source + css, /expand-equity-panel|is-wide|equity-panel-footer|独立打开|新窗口/);
});

test("Surf is lazy loaded once per open and cannot navigate the parent or receive wallet context", () => {
  const app = fixture();
  assert.equal(app.frames.length, 0);
  app.open(); app.open();
  assert.equal(app.frames.length, 1);
  assert.equal(app.frames[0].src, "https://asksurf.ai/equity");
  assert.equal(app.get("open-equity-panel").getAttribute("aria-expanded"), "true");
  const sandbox = app.frames[0].getAttribute("sandbox");
  assert.match(sandbox, /allow-scripts/);
  assert.doesNotMatch(sandbox, /allow-top-navigation/);
  assert.doesNotMatch(source, /postMessage|walletAddress|localStorage|document\.cookie|\/api\/bstock-alpha/);
});

test("reload replaces the frame and stale load events cannot hide the new loading state", () => {
  const app = fixture(); app.open();
  app.get("reload-equity-panel").emit("click");
  assert.equal(app.frames.length, 2);
  app.frames[0].emit("load");
  assert.equal(app.get("equity-panel-loading").hidden, false);
  app.frames[1].emit("load");
  assert.equal(app.get("equity-panel-loading").hidden, true);
  assert.equal(app.get("equity-panel-content").getAttribute("aria-busy"), "false");
  assert.equal(app.timers.size, 0);
});

test("closing unloads the external page, cancels timers and restores trigger focus", () => {
  const app = fixture(); app.open();
  app.get("close-equity-panel").emit("click");
  assert.equal(app.get("equity-panel").open, false);
  assert.equal(app.get("equity-panel-frame-host").children.length, 0);
  assert.equal(app.get("open-equity-panel").getAttribute("aria-expanded"), "false");
  assert.equal(app.get("open-equity-panel").focused, true);
  assert.equal(app.document.body.classList.contains("equity-panel-open"), false);
  assert.equal(app.timers.size, 0);
  app.open();
  assert.equal(app.frames.length, 2);
});

test("slow loads and failures suggest refreshing without external navigation or automatic reload", () => {
  const app = fixture(); app.open();
  for (const timer of app.timers.values()) timer();
  assert.match(app.get("equity-panel-loading-detail").textContent, /右上角刷新/);
  app.frames[0].emit("error");
  assert.equal(app.get("equity-panel-loading").hidden, false);
  assert.match(app.get("equity-panel-loading-detail").textContent, /右上角刷新/);
  assert.equal(app.frames.length, 1);
  assert.equal(app.timers.size, 0);
});

test("Escape and backdrop close the drawer without a wide-mode control", () => {
  const app = fixture(); app.open();
  assert.equal(app.get("expand-equity-panel"), null);
  assert.equal(app.frames.length, 1);
  app.document.emit("keydown", { key: "Escape", preventDefault() {} });
  assert.equal(app.get("equity-panel").open, false);
  app.open();
  app.get("equity-panel").emit("click", { clientX: 100, clientY: 200 });
  assert.equal(app.get("equity-panel").open, false);
});

test("order-review shortcuts cannot execute behind the open equity drawer", () => {
  const app = fixture(); app.open();
  let stopped = false;
  app.document.emit("keydown", { key: "Enter", ctrlKey: true, preventDefault() {}, stopImmediatePropagation() { stopped = true; } });
  assert.equal(stopped, true);
  app.get("equity-panel").close(); stopped = false;
  app.document.emit("keydown", { key: "Enter", ctrlKey: true, stopImmediatePropagation() { stopped = true; } });
  assert.equal(stopped, false);
});
