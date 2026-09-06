const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../home-product-demo.js"), "utf8");

function harness(reduce = false, withImages = true) {
  let now = 0;
  let nextTimer = 1;
  let intersection;
  let languageObserver;
  const timers = new Map();
  function events(target = {}) {
    const listeners = new Map();
    target.addEventListener = (type, callback) => {
      const list = listeners.get(type) || [];
      list.push(callback);
      listeners.set(type, list);
    };
    target.emit = (type, detail = {}) => (listeners.get(type) || []).forEach((callback) => callback({ target, ...detail }));
    return target;
  }
  const document = events({ hidden: false, documentElement: { lang: "zh-CN" }, activeElement: {} });
  const root = events({ dataset: {}, matches: () => false });
  function element(dataset = {}) {
    const attributes = new Map();
    const classes = new Set();
    const node = events({ dataset, textContent: "", hidden: false, tabIndex: -1,
      setAttribute: (key, value) => attributes.set(key, value),
      getAttribute: (key) => attributes.get(key),
      contains: (other) => other === node,
      matches: () => dataset.demoZh != null,
      querySelector: () => null,
      focus: () => { document.activeElement = node; root.emit("focusin", { target: node }); },
      classList: { toggle: (value, active) => active ? classes.add(value) : classes.delete(value), contains: (value) => classes.has(value) }
    });
    return node;
  }
  const names = [["onchain", "链上看板", "On-chain"], ["radar", "妖币雷达", "Radar"], ["alphaops", "Alpha空投", "AlphaOps"], ["bstock", "bStock美股", "bStock"], ["grid", "智能网格", "Grid"], ["quant", "观潮量化", "Quant"]];
  const tabs = names.map(([id, zh, en], index) => {
    const node = element({ demoTab: id, demoZh: zh, demoEn: en });
    node.setAttribute("aria-controls", `product-demo-panel-${id}`);
    node.setAttribute("aria-selected", String(index === 0));
    return node;
  });
  const images = names.map(() => ({ loading: "lazy" }));
  const panels = names.map(([id], index) => Object.assign(element(), {
    id: `product-demo-panel-${id}`,
    querySelector: (selector) => withImages && selector === "img" ? images[index] : null
  }));
  const toggle = element();
  const count = element();
  const status = element();
  root.contains = (node) => [root, ...tabs, ...panels, toggle, count, status].includes(node);
  root.querySelectorAll = (selector) => selector === "button[data-demo-tab]" || selector === "[data-demo-zh][data-demo-en]" ? tabs : [];
  root.querySelector = (selector) => ({ "[data-demo-toggle]": toggle, "[data-demo-count]": count, "[data-demo-status]": status })[selector];
  document.querySelectorAll = () => [root];
  document.getElementById = (id) => panels.find((panel) => panel.id === id);
  const motion = events({ matches: reduce });
  const window = events({ matchMedia: () => motion, IntersectionObserver: true });
  vm.runInNewContext(source, {
    document, window,
    performance: { now: () => now },
    setTimeout: (callback, delay) => { const id = nextTimer++; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
    queueMicrotask: (callback) => callback(),
    IntersectionObserver: class { constructor(callback) { intersection = callback; } observe() {} },
    MutationObserver: class { constructor(callback) { languageObserver = callback; } observe() {} }
  });
  return {
    root, tabs, panels, images, toggle, count, status, document, motion,
    intersect: (visible) => intersection([{ isIntersecting: visible }]),
    language: (lang) => { document.documentElement.lang = lang; languageObserver(); },
    focus: (node) => node.focus(),
    blur: () => { document.activeElement = {}; root.emit("focusout"); },
    tick: (duration) => {
      const end = now + duration;
      let next;
      while ((next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0]) && next[1].at <= end) {
        now = next[1].at;
        timers.delete(next[0]);
        next[1].callback();
      }
      now = end;
    }
  };
}

test("product demo rotates only while visible, exposes one panel and never announces automatic changes", () => {
  const h = harness();
  h.tick(12000);
  assert.equal(h.count.textContent, "01 / 06");
  assert.equal(h.root.dataset.running, "false");
  h.intersect(true);
  h.tick(5999);
  assert.equal(h.count.textContent, "01 / 06");
  h.tick(1);
  assert.equal(h.count.textContent, "02 / 06");
  assert.equal(h.panels.filter((panel) => !panel.hidden).length, 1);
  assert.equal(h.tabs[1].getAttribute("aria-selected"), "true");
  assert.equal(h.status.textContent, "");
  h.intersect(false);
  h.tick(12000);
  assert.equal(h.count.textContent, "02 / 06");
});

test("hover and document visibility pause the remaining slide time", () => {
  const h = harness();
  h.intersect(true);
  h.tick(2000);
  h.root.emit("pointerenter", { pointerType: "mouse" });
  h.tick(12000);
  assert.equal(h.count.textContent, "01 / 06");
  h.root.emit("pointerleave");
  h.tick(3999);
  assert.equal(h.count.textContent, "01 / 06");
  h.tick(1);
  assert.equal(h.count.textContent, "02 / 06");
  h.document.hidden = true;
  h.document.emit("visibilitychange");
  h.tick(12000);
  assert.equal(h.count.textContent, "02 / 06");
  h.document.hidden = false;
  h.document.emit("visibilitychange");
  h.tick(6000);
  assert.equal(h.count.textContent, "03 / 06");
});

test("manual navigation stops rotation and deliberate Play can run with its button still focused", () => {
  const h = harness();
  h.intersect(true);
  h.tabs[3].emit("click");
  assert.equal(h.count.textContent, "04 / 06");
  assert.equal(h.status.textContent, "bStock美股");
  assert.equal(h.toggle.textContent, "播放演示");
  h.tick(18000);
  assert.equal(h.count.textContent, "04 / 06");
  h.focus(h.toggle);
  h.toggle.emit("click");
  assert.equal(h.root.dataset.running, "true");
  h.tick(6000);
  assert.equal(h.count.textContent, "05 / 06");
  h.focus(h.panels[4]);
  assert.equal(h.root.dataset.running, "false");
  h.tick(12000);
  assert.equal(h.count.textContent, "05 / 06");
});

test("keyboard navigation wraps, focuses the selected tab and uses roving tab stops", () => {
  const h = harness();
  let prevented = false;
  h.tabs[0].emit("keydown", { key: "ArrowLeft", preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(h.document.activeElement, h.tabs[5]);
  assert.equal(h.count.textContent, "06 / 06");
  assert.equal(h.tabs.filter((tab) => tab.tabIndex === 0).length, 1);
  h.tabs[5].emit("keydown", { key: "Home", preventDefault() {} });
  assert.equal(h.document.activeElement, h.tabs[0]);
  h.tabs[0].emit("keydown", { key: "End", preventDefault() {} });
  assert.equal(h.document.activeElement, h.tabs[5]);
  h.tabs[5].emit("keydown", { key: "ArrowDown", preventDefault() {} });
  assert.equal(h.document.activeElement, h.tabs[0]);
});

test("reduced motion starts paused and language changes translate leaves and panel labels", () => {
  const h = harness(true);
  h.intersect(true);
  h.tick(18000);
  assert.equal(h.count.textContent, "01 / 06");
  assert.equal(h.toggle.textContent, "播放演示");
  h.language("en");
  assert.equal(h.tabs[0].textContent, "On-chain");
  assert.equal(h.panels[0].getAttribute("aria-label"), "On-chain");
  assert.equal(h.toggle.textContent, "Play demo");
  h.tabs[5].emit("click");
  assert.equal(h.status.textContent, "Quant");
  h.toggle.emit("click");
  h.tick(6000);
  assert.equal(h.count.textContent, "01 / 06");
});

test("product screenshots prewarm only the next slide after entering the viewport", () => {
  const h = harness();
  assert.equal(h.images.filter((image) => image.loading === "eager").length, 0);
  h.intersect(true);
  assert.equal(h.images[1].loading, "eager");
  assert.equal(h.images.filter((image) => image.loading === "eager").length, 1);
  h.tick(6000);
  assert.equal(h.images[2].loading, "eager");
  assert.equal(h.images.filter((image) => image.loading === "eager").length, 2);
  h.intersect(false);
  h.tabs[3].emit("click");
  assert.equal(h.images[4].loading, "lazy");
  h.intersect(true);
  assert.equal(h.images[4].loading, "eager");
  const noImages = harness(false, false);
  assert.doesNotThrow(() => { noImages.intersect(true); noImages.tick(6000); });
});

test("reselecting the current tab preserves its remaining progress when playback resumes", () => {
  const h = harness();
  h.intersect(true);
  h.tick(4000);
  h.tabs[0].emit("click");
  h.tick(12000);
  assert.equal(h.count.textContent, "01 / 06");
  h.focus(h.toggle);
  h.toggle.emit("click");
  h.tick(1999);
  assert.equal(h.count.textContent, "01 / 06");
  h.tick(1);
  assert.equal(h.count.textContent, "02 / 06");
});
