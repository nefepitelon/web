const test = require("node:test");
const assert = require("node:assert/strict");
const { create } = require("../trend-indicator-cycle.js");

class Surface extends EventTarget { hidden = false; }
function harness(options = {}) {
  let clock = 0, serial = 0, ready = true, observe;
  const timers = new Map(), calls = [], errors = [], doc = new Surface(), win = new Surface(), section = {};
  let disconnected = false;
  class Observer {
    constructor(callback) { observe = callback; }
    observe() {}
    disconnect() { disconnected = true; }
  }
  const controller = create({
    document: doc, window: win, section, IntersectionObserver: Observer,
    canAdvance: () => ready, now: () => clock,
    schedule: (callback, delay) => { const id = ++serial; timers.set(id, { at: clock + delay, callback }); return id; },
    cancel: (id) => timers.delete(id),
    advance: () => { calls.push(clock); return options.advance?.(); },
    onError: (error) => errors.push(error),
  });
  const setVisible = (visible) => observe([{ target: section, isIntersecting: visible, intersectionRatio: visible ? 1 : 0 }]);
  setVisible(true);
  return {
    controller, calls, errors, timers, doc, win, setVisible,
    setReady(value) { ready = value; controller.sync(); },
    disconnected: () => disconnected,
    tick(duration) {
      const end = clock + duration;
      let entry;
      while ((entry = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0]) && entry[1].at <= end) {
        clock = entry[1].at; timers.delete(entry[0]); entry[1].callback();
      }
      clock = end;
    },
  };
}

test("cycles at 25 seconds with only one timer even when sync repeats", () => {
  const h = harness();
  for (let index = 0; index < 20; index++) h.controller.sync();
  assert.equal(h.timers.size, 1);
  h.tick(24999); assert.deepEqual(h.calls, []);
  h.tick(1); assert.deepEqual(h.calls, [25000]);
  h.tick(50000); assert.deepEqual(h.calls, [25000, 50000, 75000]);
  assert.equal(h.timers.size, 1);
});

test("loading, menu, focus, and dragging guards suspend and restart a full interval", () => {
  const h = harness();
  for (const guard of ["loading", "menu", "focus", "dragging"]) {
    h.tick(24000); h.setReady(false);
    assert.equal(h.controller.getState().reason, "blocked", guard);
    assert.equal(h.timers.size, 0);
    h.tick(100000); h.setReady(true);
    const before = h.calls.length;
    h.tick(24999); assert.equal(h.calls.length, before, guard);
    h.tick(1); assert.equal(h.calls.length, before + 1, guard);
  }
});

test("hidden, offscreen, and pagehide periods never accumulate overdue switches", () => {
  const h = harness();
  const pauses = [
    [() => { h.doc.hidden = true; h.doc.dispatchEvent(new Event("visibilitychange")); }, () => { h.doc.hidden = false; h.doc.dispatchEvent(new Event("visibilitychange")); }],
    [() => h.setVisible(false), () => h.setVisible(true)],
    [() => h.win.dispatchEvent(new Event("pagehide")), () => h.win.dispatchEvent(new Event("pageshow"))],
  ];
  for (const [pause, resume] of pauses) {
    h.tick(20000); const before = h.calls.length; pause();
    assert.equal(h.timers.size, 0);
    h.tick(300000); resume();
    assert.equal(h.calls.length, before);
    h.tick(24999); assert.equal(h.calls.length, before);
    h.tick(1); assert.equal(h.calls.length, before + 1);
  }
});

test("manual changes reset time and explicit pause survives page visibility changes", () => {
  const h = harness();
  h.tick(24999); h.controller.reset();
  h.tick(24999); assert.equal(h.calls.length, 0);
  h.tick(1); assert.equal(h.calls.length, 1);
  h.controller.setEnabled(false);
  h.win.dispatchEvent(new Event("pagehide")); h.win.dispatchEvent(new Event("pageshow"));
  h.tick(300000); assert.equal(h.calls.length, 1);
  assert.equal(h.controller.getState().reason, "disabled");
  h.controller.setEnabled(true);
  h.tick(24999); assert.equal(h.calls.length, 1);
  h.tick(1); assert.equal(h.calls.length, 2);
});

test("an asynchronous indicator cannot overlap and resumes 25 seconds after settling", async () => {
  let resolve;
  const h = harness({ advance: () => new Promise((done) => { resolve = done; }) });
  h.tick(25000);
  assert.equal(h.controller.getState().pending, true);
  h.tick(100000); h.controller.reset();
  assert.equal(h.calls.length, 1); assert.equal(h.timers.size, 0);
  resolve(); await Promise.resolve();
  h.tick(24999); assert.equal(h.calls.length, 1);
  h.tick(1); assert.equal(h.calls.length, 2);
  h.controller.destroy(); resolve(); await Promise.resolve();
  assert.equal(h.timers.size, 0);
});

test("failed synchronous and asynchronous indicators still allow the next interval", async () => {
  let attempt = 0;
  const h = harness({ advance: () => {
    if (++attempt === 1) throw new Error("indicator unavailable");
    if (attempt === 2) return Promise.reject(new Error("request failed"));
  } });
  h.tick(25000); assert.equal(h.errors.length, 1);
  h.tick(25000); await Promise.resolve();
  assert.equal(h.errors.length, 2);
  h.tick(24999); assert.equal(h.calls.length, 2);
  h.tick(1); assert.equal(h.calls.length, 3);
  assert.equal(h.timers.size, 1);
});

test("canceled queued callbacks and destroyed observers cannot recreate timers", () => {
  const h = harness();
  const oldCallback = [...h.timers.values()][0].callback;
  h.tick(1000); h.controller.reset(); oldCallback();
  assert.equal(h.calls.length, 0); assert.equal(h.timers.size, 1);
  const currentCallback = [...h.timers.values()][0].callback;
  h.controller.destroy(); currentCallback(); h.setVisible(true);
  h.win.dispatchEvent(new Event("pageshow"));
  h.controller.reset(); h.controller.setEnabled(true); h.controller.sync();
  h.tick(100000);
  assert.equal(h.calls.length, 0); assert.equal(h.timers.size, 0);
  assert.equal(h.disconnected(), true);
});

test("the eligibility guard is rechecked at the deadline before advancing", () => {
  let ready = true, callback, calls = 0;
  const controller = create({ canAdvance: () => ready, advance: () => calls++,
    schedule: (fn) => { callback = fn; return 1; }, cancel: () => {}, document: null, window: null });
  ready = false; callback();
  assert.equal(calls, 0); assert.equal(controller.getState().reason, "blocked");
  ready = true; controller.sync(); callback();
  assert.equal(calls, 1); controller.destroy();
});
