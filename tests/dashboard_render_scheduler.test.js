const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "dashboard.js"), "utf8");
const schedulerSource = source.slice(source.indexOf("const createDashboardChartScheduler ="), source.indexOf("const dashboardChartScheduler ="));

const makeHarness = ({ observers = true } = {}) => {
  const frames = new Map();
  const listeners = new Map();
  const canvases = new Map();
  let nextFrame = 1;
  let time = 0;
  let intersection;
  let resize;
  const document = {
    hidden: false,
    querySelector: (selector) => canvases.get(selector),
    addEventListener: (name, callback) => listeners.set(name, callback)
  };
  const window = {
    requestAnimationFrame: (callback) => { const id = nextFrame++; frames.set(id, callback); return id; },
    cancelAnimationFrame: (id) => frames.delete(id)
  };
  class IntersectionObserver {
    constructor(callback, options) { this.callback = callback; this.options = options; this.observed = []; intersection = this; }
    observe(target) { this.observed.push(target); }
  }
  class ResizeObserver {
    constructor(callback) { this.callback = callback; this.observed = []; resize = this; }
    observe(target) { this.observed.push(target); }
  }
  if (observers) Object.assign(window, { IntersectionObserver, ResizeObserver });
  const context = vm.createContext({ window, document, IntersectionObserver, ResizeObserver, performance: { now: () => time }, console });
  const scheduler = vm.runInContext(`${schedulerSource}\ncreateDashboardChartScheduler();`, context);
  const addCanvas = (selector) => {
    const classes = new Set();
    const target = { classes, classList: { toggle: (name, on) => on ? classes.add(name) : classes.delete(name) } };
    const canvas = { closest: () => target, parentElement: {} };
    canvases.set(selector, canvas);
    return { target, stage: canvas.parentElement };
  };
  const runFrame = () => {
    const first = frames.entries().next().value;
    if (!first) return false;
    frames.delete(first[0]);
    first[1]();
    return true;
  };
  const runFrames = () => { let count = 0; while (runFrame()) { if (++count > 100) throw new Error("Render loop did not settle"); } return count; };
  return {
    scheduler, document, frames, addCanvas, runFrame, runFrames,
    advance: (duration) => { time += duration; },
    enter: (...targets) => intersection.callback(targets.map((target) => ({ target, isIntersecting: true }))),
    leave: (...targets) => intersection.callback(targets.map((target) => ({ target, isIntersecting: false }))),
    resize: (...stages) => resize.callback(stages.map((target) => ({ target }))),
    hidden: (hidden) => { document.hidden = hidden; listeners.get("visibilitychange")(); }
  };
};

test("36 dashboard canvases do no offscreen drawing and coalesce repeated data updates", () => {
  const h = makeHarness();
  const drawings = [];
  const panels = Array.from({ length: 36 }, (_, index) => {
    const selector = `#chart-${index}`;
    const canvas = h.addCanvas(selector);
    let latest = 0;
    const draw = () => {
      if (h.scheduler.request(selector, draw)) return;
      drawings.push([index, latest]);
    };
    return { ...canvas, draw, update: (value) => { latest = value; draw(); } };
  });
  panels.forEach((panel) => panel.draw());
  assert.equal(h.frames.size, 0);
  assert.equal(drawings.length, 0);
  panels[20].update(1);
  panels[20].update(2);
  panels[20].update(3);
  h.enter(panels[20].target);
  assert.equal(h.frames.size, 1);
  h.runFrames();
  assert.deepEqual(drawings, [[20, 3]]);
  panels[20].update(4);
  panels[20].update(5);
  assert.equal(h.frames.size, 1);
  h.runFrames();
  assert.deepEqual(drawings, [[20, 3], [20, 5]]);
  h.leave(panels[20].target);
  panels[20].update(6);
  assert.equal(h.frames.size, 0);
  h.enter(panels[20].target);
  h.runFrames();
  assert.deepEqual(drawings.at(-1), [20, 6]);
});

test("visible chart work yields across frames and an external renderer wrapper cannot recurse", () => {
  const h = makeHarness();
  const drawings = [];
  const panels = Array.from({ length: 4 }, (_, index) => {
    const selector = `#chart-${index}`;
    const panel = h.addCanvas(selector);
    const draw = () => {
      if (h.scheduler.request(selector, draw)) return;
      drawings.push(index);
      h.advance(9);
    };
    h.scheduler.request(selector, () => draw());
    return panel;
  });
  h.enter(...panels.map((panel) => panel.target));
  h.runFrame();
  assert.deepEqual(drawings, [0]);
  assert.equal(h.runFrames(), 3);
  assert.deepEqual(drawings, [0, 1, 2, 3]);
  assert.equal(h.frames.size, 0);
});

test("resizes redraw visible canvases and defer hidden ones until their next entry", () => {
  const h = makeHarness();
  const a = h.addCanvas("#a");
  const b = h.addCanvas("#b");
  const drawings = [];
  h.scheduler.request("#a", () => drawings.push("a"));
  h.scheduler.request("#b", () => drawings.push("b"));
  h.enter(a.target);
  h.runFrames();
  h.resize(a.stage, b.stage);
  h.runFrames();
  assert.deepEqual(drawings, ["a", "a"]);
  h.enter(b.target);
  h.runFrames();
  assert.deepEqual(drawings, ["a", "a", "b"]);
});

test("background tabs stop pending draws and seal animation, then draw fresh on return", () => {
  const h = makeHarness();
  const panel = h.addCanvas("#a");
  let latest = 1;
  const drawings = [];
  const draw = () => { if (!h.scheduler.request("#a", draw)) drawings.push(latest); };
  draw();
  h.enter(panel.target);
  assert.equal(panel.target.classes.has("is-chart-visible"), true);
  h.hidden(true);
  assert.equal(h.frames.size, 0);
  assert.equal(panel.target.classes.has("is-chart-visible"), false);
  latest = 2;
  draw();
  h.hidden(false);
  h.runFrames();
  assert.deepEqual(drawings, [2]);
  assert.equal(panel.target.classes.has("is-chart-visible"), true);
});

test("PNG flush is synchronous even for a pending/offscreen canvas", () => {
  const h = makeHarness();
  h.addCanvas("#a");
  let drawn = 0;
  const draw = () => { if (!h.scheduler.request("#a", draw)) drawn++; };
  draw();
  h.scheduler.flush("#a");
  assert.equal(drawn, 1);
  assert.equal(h.frames.size, 0);
});

test("observer-less fallback still renders charts and settles after one frame", () => {
  const h = makeHarness({ observers: false });
  h.addCanvas("#a");
  let drawn = 0;
  h.scheduler.request("#a", () => drawn++);
  h.runFrames();
  assert.equal(drawn, 1);
});

test("scroll navigation finds the active indicator with no stale height cache and <= 6 reads", () => {
  const start = source.indexOf("const findTrendPanelAtMarker =");
  const end = source.indexOf("const setupTrendNavigator =", start);
  const find = vm.runInNewContext(`${source.slice(start, end)}\nfindTrendPanelAtMarker;`);
  let reads = 0;
  const panels = Array.from({ length: 35 }, (_, index) => ({
    top: index * 620,
    getBoundingClientRect() { reads++; return { top: this.top }; }
  }));
  for (const marker of [-100, 0, 619, 620, 6200, 21080, 30000]) {
    reads = 0;
    const expected = Math.min(34, Math.max(0, Math.floor(marker / 620)));
    assert.equal(find(panels, marker), panels[expected]);
    assert.ok(reads <= 6);
  }
  panels.forEach((panel, index) => { panel.top = index * 850; });
  assert.equal(find(panels, 1700), panels[2]);
});
