const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../product-dashboard.js"), "utf8");
const controllerStart = source.indexOf("  function createHomeOrbitAnimator(");
const controllerEnd = source.indexOf("\n  const DAY_MS", controllerStart);
const createAnimator = vm.runInNewContext(`${source.slice(controllerStart, controllerEnd)}\ncreateHomeOrbitAnimator;`);
const { fitHomeCamera, projectOrbitPoint } = vm.runInNewContext(`${source.slice(controllerStart, controllerEnd)}\n({ fitHomeCamera, projectOrbitPoint });`);

function assertCameraClose(actual, expected) {
  for (const key of Object.keys(expected)) {
    assert.ok(Math.abs(actual[key] - expected[key]) < 1e-10, `${key} must resume without a visual jump`);
  }
}

function harness({ enabled = true, ready = true, initial = {}, minZoom = 0.55 } = {}) {
  let clock = 0;
  let nextId = 1;
  const pending = new Map();
  const snapshots = [];
  const camera = { yaw: -0.12, pitch: 0.28, zoom: 0.96, panX: 0, panY: 18, ...initial };
  const animator = createAnimator({
    camera,
    enabled,
    minZoom,
    canAnimate: () => ready,
    now: () => clock,
    draw: () => snapshots.push({ ...camera }),
    schedule: (callback, delay) => { const id = nextId++; pending.set(id, { at: clock + delay, callback }); return id; },
    cancel: (id) => pending.delete(id)
  });
  animator.sync();
  return {
    animator, camera, snapshots, pending,
    setReady: (next) => { ready = next; animator.sync(); },
    tick: (duration) => {
      const end = clock + duration;
      let entry;
      while ((entry = [...pending.entries()].sort((a, b) => a[1].at - b[1].at)[0]) && entry[1].at <= end) {
        clock = entry[1].at;
        pending.delete(entry[0]);
        entry[1].callback();
      }
      clock = end;
    }
  };
}

test("home auto camera gently orbits and zooms within bounds at about 30 frames per second", () => {
  const h = harness();
  h.tick(60000);
  assert.ok(h.snapshots.length >= 1799 && h.snapshots.length <= 1802);
  assert.ok(h.snapshots.some((frame) => frame.yaw > 0.07));
  assert.ok(h.snapshots.some((frame) => frame.yaw < -0.31));
  assert.ok(h.snapshots.some((frame) => frame.zoom > 0.99));
  assert.ok(h.snapshots.some((frame) => frame.zoom < 0.93));
  for (const frame of h.snapshots) {
    assert.ok(Math.abs(frame.yaw + 0.12) <= 0.200001);
    assert.ok(Math.abs(frame.pitch - 0.28) <= 0.055001);
    assert.ok(Math.abs(frame.zoom / 0.96 - 1) <= 0.045001);
    assert.equal(frame.panX, 0);
    assert.equal(frame.panY, 18);
  }
});

test("home auto camera leaves no frame timers while hidden, outside the viewport, or in 2D", () => {
  const h = harness({ ready: false });
  assert.equal(h.pending.size, 0);
  h.tick(60000);
  assert.equal(h.snapshots.length, 0);
  h.setReady(true);
  h.tick(5000);
  const frozen = { ...h.camera };
  const draws = h.snapshots.length;
  h.setReady(false);
  assert.equal(h.pending.size, 0);
  assert.equal(h.animator.isRunning(), false);
  h.tick(60000);
  assert.equal(h.snapshots.length, draws);
  assert.deepEqual(h.camera, frozen);
  h.setReady(true);
  assertCameraClose(h.camera, frozen);
});

test("manual gestures pause auto movement and resume smoothly from the final camera after twelve seconds", () => {
  const h = harness();
  h.tick(5000);
  h.setReady(false);
  h.animator.interaction();
  Object.assign(h.camera, { yaw: 0.54, pitch: -0.31, zoom: 1.32, panX: 122, panY: -45 });
  const manual = { ...h.camera };
  const draws = h.snapshots.length;
  h.tick(20000);
  assert.equal(h.snapshots.length, draws);
  assert.deepEqual(h.camera, manual);
  // Release: a full idle interval begins when the gesture ends.
  h.animator.interaction();
  h.setReady(true);
  h.tick(11999);
  assert.equal(h.snapshots.length, draws);
  h.tick(1);
  assert.deepEqual(h.camera, manual);
  assert.equal(h.animator.isRunning(), true);
  h.tick(1000);
  assert.ok(h.camera.yaw > manual.yaw && h.camera.yaw - manual.yaw < 0.01);
  assert.equal(h.camera.panX, 122);
  assert.equal(h.camera.panY, -45);
});

test("reduced-motion default and the pause control stop animation until explicitly enabled", () => {
  const h = harness({ enabled: false });
  h.tick(60000);
  assert.equal(h.snapshots.length, 0);
  assert.equal(h.pending.size, 0);
  h.animator.setEnabled(true);
  h.tick(1000);
  assert.ok(h.snapshots.length > 1);
  h.animator.setEnabled(false);
  const frozen = { ...h.camera };
  const draws = h.snapshots.length;
  assert.equal(h.pending.size, 0);
  h.tick(60000);
  assert.equal(h.snapshots.length, draws);
  h.animator.setEnabled(true);
  assertCameraClose(h.camera, frozen);
});

test("automatic motion respects manual zoom/pitch limits and does not rotate across the back-facing boundary", () => {
  const h = harness({ initial: { yaw: Math.PI / 2 - 0.07, pitch: 0.91, zoom: 2.24 } });
  h.tick(60000);
  for (const frame of h.snapshots) {
    assert.ok(frame.yaw < Math.PI / 2);
    assert.ok(frame.pitch <= 0.92);
    assert.ok(frame.zoom <= 2.25 && frame.zoom >= 0.55);
  }
});

test("the shared dashboard hides its unbound auto-motion button even in manual 3D view", () => {
  const start = source.indexOf("  const updateViewUi = () => {");
  const end = source.indexOf("\n  const updateUi =", start);
  const updateSource = `${source.slice(start, end)}\nupdateViewUi();`;
  for (const [isHomePage, view, expectedHidden] of [[false, "3d", true], [true, "3d", false], [true, "2d", true]]) {
    const orbitAuto = { hidden: false };
    vm.runInNewContext(updateSource, {
      state: { view }, isHomePage, orbitAuto, orbitControls: {}, orbitHint: null, orbitReset: null,
      viewButtons: [], section: { classList: { toggle() {} } }, canvas: { setAttribute() {} },
      orbitAnimator: null, updateOrbitAutoUi() {}, copy: (zh) => zh
    });
    assert.equal(orbitAuto.hidden, expectedHidden, `home=${isHomePage}, view=${view}`);
  }
});

test("homepage camera fits the full world box throughout the combined 240-second orbit at desktop and mobile widths", () => {
  for (const [width, height] of [[1905, 720], [1265, 720], [640, 560], [600, 560], [520, 560], [480, 560], [375, 560], [320, 560]]) {
    const initial = fitHomeCamera(width, height);
    const h = harness({ initial, minZoom: 0.20 });
    h.tick(240000); // LCM of the 48 s yaw, 60 s pitch and 24 s zoom cycles.
    assert.ok(initial.zoom < 0.75, `fit zoom at ${width}`);
    assert.ok(h.snapshots.some((frame) => frame.zoom > initial.zoom * 1.04), `${width} automatic zoom in`);
    assert.ok(h.snapshots.some((frame) => frame.zoom < initial.zoom * 0.96), `${width} automatic zoom out`);
    const bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
    for (const camera of h.snapshots) {
      for (const x of [-5, 5]) for (const y of [0, 5.75]) for (const z of [-1.7, 1.7]) {
        const point = projectOrbitPoint({ x, y, z }, width, height, camera);
        bounds.left = Math.min(bounds.left, point.x);
        bounds.right = Math.max(bounds.right, point.x);
        bounds.top = Math.min(bounds.top, point.y);
        bounds.bottom = Math.max(bounds.bottom, point.y);
      }
    }
    assert.ok(bounds.left >= Math.min(80, width * 0.18), `${width} left ${bounds.left}`);
    assert.ok(bounds.right <= width - 24, `${width} right ${bounds.right}`);
    assert.ok(bounds.top >= (width < 720 ? 104 : 88), `${width} top ${bounds.top}`);
    assert.ok(bounds.bottom <= height - (width < 720 ? 250 : 78), `${width} bottom ${bounds.bottom}`);
  }
});

test("programmatic viewport refitting rebases the animation without undoing the fitted camera", () => {
  const h = harness({ initial: fitHomeCamera(1265, 720) });
  h.tick(18000);
  const mobile = { ...fitHomeCamera(375, 560) };
  Object.assign(h.camera, mobile);
  h.animator.reframe();
  assert.deepEqual(h.camera, mobile);
  assert.equal(h.pending.size, 1);
  h.tick(1000);
  assert.ok(Math.abs(h.camera.yaw - mobile.yaw) < 0.01);
  assert.equal(h.camera.panX, mobile.panX);
  assert.equal(h.camera.panY, mobile.panY);
});

test("only homepage initializes with fitted defaults; the standalone dashboard retains its original camera", () => {
  const start = source.indexOf("  const defaultCamera = Object.freeze(");
  const end = source.indexOf("\n  const activePointers", start);
  for (const isHomePage of [true, false]) {
    const result = vm.runInNewContext(`${source.slice(start, end)}\n({ camera, cameraFitManaged });`, {
      isHomePage, fitHomeCamera, canvas: { getBoundingClientRect: () => ({ width: 375, height: 560 }) }
    });
    assert.equal(result.cameraFitManaged, isHomePage);
    assert.deepEqual({ ...result.camera }, isHomePage
      ? { ...fitHomeCamera(375, 560) }
      : { yaw: -0.12, pitch: 0.28, zoom: 0.96, panX: 0, panY: 18 });
  }
});

test("repeated viewport and pause interruptions do not accumulate zoom or orbit-center drift", () => {
  const initial = { ...fitHomeCamera(1265, 720) };
  const h = harness({ initial });
  for (let index = 0; index < 30; index += 1) {
    h.tick(5000);
    const frozen = { ...h.camera };
    if (index % 2) h.animator.setEnabled(false);
    else h.setReady(false);
    h.tick(30000);
    assert.deepEqual(h.camera, frozen);
    if (index % 2) h.animator.setEnabled(true);
    else h.setReady(true);
    assertCameraClose(h.camera, frozen);
  }
  for (const camera of h.snapshots) {
    assert.ok(Math.abs(camera.yaw - initial.yaw) <= 0.200001);
    assert.ok(Math.abs(camera.pitch - initial.pitch) <= 0.055001);
    assert.ok(Math.abs(camera.zoom / initial.zoom - 1) <= 0.045001);
  }
});

test("first manual zoom-out from compact fitted views reduces magnification instead of jumping to the old minimum", () => {
  const start = source.indexOf('  canvas.addEventListener("wheel", (event) => {');
  const end = source.indexOf('\n  canvas.addEventListener("dblclick"', start);
  for (const width of [480, 520, 600, 640]) {
    const camera = { ...fitHomeCamera(width, 560) };
    const before = camera.zoom;
    let handler;
    vm.runInNewContext(source.slice(start, end), {
      canvas: { addEventListener: (name, listener) => { handler = listener; } },
      state: { view: "3d" }, camera, minCameraZoom: 0.20, cameraFitManaged: true,
      clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
      orbitAnimator: null, draw() {}
    });
    handler({ deltaY: 120, preventDefault() {} });
    assert.ok(camera.zoom < before, `${width} first wheel zoom-out ${before} -> ${camera.zoom}`);
    assert.ok(camera.zoom >= 0.20);
  }
});
