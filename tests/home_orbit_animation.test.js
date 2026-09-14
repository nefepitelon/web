const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../product-dashboard.js"), "utf8");
const controllerStart = source.indexOf("  function createHomeOrbitAnimator(");
const controllerEnd = source.indexOf("\n  const DAY_MS", controllerStart);
const createAnimator = vm.runInNewContext(`${source.slice(controllerStart, controllerEnd)}\ncreateHomeOrbitAnimator;`);
const { fitHomeCamera, createHomeCamera, projectOrbitPoint, drawOrbitGlow, createOrbitFloorRipples, drawOrbitFloorRipples } = vm.runInNewContext(`${source.slice(controllerStart, controllerEnd)}\n({ fitHomeCamera, createHomeCamera, projectOrbitPoint, drawOrbitGlow, createOrbitFloorRipples, drawOrbitFloorRipples });`);

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

test("home auto camera has a wider orbit and zoom within bounds at about 30 frames per second", () => {
  const h = harness();
  h.tick(60000);
  assert.ok(h.snapshots.length >= 1799 && h.snapshots.length <= 1802);
  assert.ok(h.snapshots.some((frame) => frame.yaw > 0.07));
  assert.ok(h.snapshots.some((frame) => frame.yaw < -0.31));
  assert.ok(h.snapshots.some((frame) => frame.zoom > 0.99));
  assert.ok(h.snapshots.some((frame) => frame.zoom < 0.93));
  for (const frame of h.snapshots) {
    assert.ok(Math.abs(frame.yaw + 0.12) <= 0.360001);
    assert.ok(Math.abs(frame.pitch - 0.28) <= 0.100001);
    assert.ok(Math.abs(frame.zoom / 0.96 - 1) <= 0.080001);
    assert.equal(frame.panX, 0);
    assert.equal(frame.panY, 18);
  }
});

test("home automatic movement reaches larger peaks sooner than the previous camera", () => {
  const h = harness();
  h.tick(2000);
  assert.ok(Math.abs(h.camera.zoom - 0.96 * 1.08) < 0.00008, "zoom reaches its wider peak in 2 s");
  h.tick(1500);
  assert.ok(Math.abs(h.camera.yaw - 0.24) < 0.00008, "yaw reaches its wider peak in 3.5 s");
  h.tick(1000);
  assert.ok(Math.abs(h.camera.pitch - 0.38) < 0.00008, "pitch reaches its wider peak in 4.5 s");
  h.tick(1500);
  assert.ok(Math.abs(h.camera.zoom - 0.96 * 0.92) < 0.00008, "zoom reaches its trough in 6 s");
  h.tick(4500);
  assert.ok(Math.abs(h.camera.yaw + 0.48) < 0.00008, "yaw reaches its trough in 10.5 s");
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
  assert.ok(h.camera.yaw > manual.yaw && h.camera.yaw - manual.yaw < 0.09);
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

test("home and shared dashboard expose auto motion while unbound charts keep the button hidden", () => {
  const start = source.indexOf("  const updateViewUi = () => {");
  const end = source.indexOf("\n  const updateUi =", start);
  const updateSource = `${source.slice(start, end)}\nupdateViewUi();`;
  for (const [hasTrendExperience, view, expectedHidden] of [[false, "3d", true], [true, "3d", false], [true, "2d", true]]) {
    const orbitAuto = { hidden: false };
    vm.runInNewContext(updateSource, {
      state: { view }, hasTrendExperience, orbitAuto, orbitControls: {}, orbitHint: null, orbitReset: null,
      viewButtons: [], section: { classList: { toggle() {} } }, canvas: { setAttribute() {} },
      orbitAnimator: null, updateOrbitAutoUi() {}, copy: (zh) => zh
    });
    assert.equal(orbitAuto.hidden, expectedHidden, `shared experience=${hasTrendExperience}, view=${view}`);
  }
});

test("default framing keeps the floor and full world box visible throughout the combined 504-second orbit", () => {
  for (const [width, height] of [[1920, 720], [1920, 1000], [1265, 720], [640, 560], [600, 560], [520, 560], [480, 560], [375, 560], [320, 560]]) {
    const initial = createHomeCamera(width, height);
    const h = harness({ initial, minZoom: 0.20 });
    h.tick(504000); // LCM of the 14 s yaw, 18 s pitch and 8 s zoom cycles.
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
    assert.ok(bounds.top >= (width < 720 ? 104 : 64), `${width} top ${bounds.top}`);
    assert.ok(bounds.bottom <= height - (width < 720 ? 250 : 56), `${width} bottom ${bounds.bottom}`);
  }
});

test("homepage default uses the full fitted volume and rotates around its middle height", () => {
  for (const [width, height] of [[1905, 720], [1265, 720], [640, 560], [600, 560], [520, 560], [480, 560], [375, 560], [320, 560]]) {
    const fitted = fitHomeCamera(width, height);
    const initial = createHomeCamera(width, height);
    assert.deepEqual(initial, fitted, `${width} removes the extra magnification that clipped the floor`);
    assert.equal(initial.pivotY, 2.75);
    const center = { x: 0, y: initial.pivotY, z: 0 };
    const before = projectOrbitPoint(center, width, height, initial);
    for (const yaw of [-0.48, -0.12, 0.24]) for (const pitch of [0.18, 0.28, 0.38]) {
      const after = projectOrbitPoint(center, width, height, { ...initial, yaw, pitch });
      assert.equal(after.x, before.x);
      assert.equal(after.y, before.y);
    }
  }
});

test("programmatic viewport refitting rebases the animation without undoing the fitted camera", () => {
  const h = harness({ initial: createHomeCamera(1265, 720) });
  h.tick(18000);
  const mobile = { ...createHomeCamera(375, 560) };
  Object.assign(h.camera, mobile);
  h.animator.reframe();
  assert.deepEqual(h.camera, mobile);
  assert.equal(h.pending.size, 1);
  h.tick(1000);
  assert.ok(Math.abs(h.camera.yaw - mobile.yaw) < 0.09);
  assert.equal(h.camera.panX, mobile.panX);
  assert.equal(h.camera.panY, mobile.panY);
});

test("the shared trend experience initializes fitted framing while unbound charts retain their original camera", () => {
  const start = source.indexOf("  const defaultCamera = Object.freeze(");
  const end = source.indexOf("\n  const activePointers", start);
  for (const hasTrendExperience of [true, false]) {
    const result = vm.runInNewContext(`${source.slice(start, end)}\n({ camera, cameraFitManaged });`, {
      hasTrendExperience, createHomeCamera, canvas: { getBoundingClientRect: () => ({ width: 375, height: 560 }) }
    });
    assert.equal(result.cameraFitManaged, hasTrendExperience);
    assert.deepEqual({ ...result.camera }, hasTrendExperience
      ? { ...createHomeCamera(375, 560) }
      : { yaw: -0.12, pitch: 0.28, zoom: 0.96, panX: 0, panY: 18 });
  }
});

test("the real reset handler restores shared fitted framing and preserves the idle pause", () => {
  const start = source.indexOf("  const resetCamera = () => {");
  const end = source.indexOf("\n  const beginPointerGesture =", start);
  for (const hasTrendExperience of [true, false]) {
    const camera = { yaw: 1, pitch: -0.6, zoom: 0.3, panX: 900, panY: -700 };
    const defaultCamera = { yaw: -0.12, pitch: 0.28, zoom: 0.96, panX: 0, panY: 18 };
    let interactions = 0, draws = 0;
    const result = vm.runInNewContext(`${source.slice(start, end)}\nresetCamera();\n({ cameraFitManaged, fittedSize });`, {
      hasTrendExperience, camera, defaultCamera, createHomeCamera, cameraFitManaged: false, fittedSize: "old",
      canvas: { getBoundingClientRect: () => ({ width: 1265, height: 720 }) },
      orbitAnimator: { interaction: () => { interactions += 1; } }, draw: () => { draws += 1; }
    });
    assert.deepEqual(camera, hasTrendExperience ? { ...createHomeCamera(1265, 720) } : defaultCamera);
    assert.equal(result.cameraFitManaged, hasTrendExperience);
    assert.equal(result.fittedSize, "1265:720");
    assert.equal(interactions, 1);
    assert.equal(draws, 1);
  }
});

test("the real resize handler refits the homepage and never overwrites a manually positioned view", () => {
  const start = source.indexOf("  const resizeObserver = new ResizeObserver(");
  const end = source.indexOf("\n  resizeObserver.observe(canvas);", start);
  for (const cameraFitManaged of [true, false]) {
    const camera = { ...createHomeCamera(1265, 720) };
    const before = { ...camera };
    let reframes = 0;
    vm.runInNewContext(source.slice(start, end), {
      camera, cameraFitManaged, fittedSize: "1265:720", createHomeCamera,
      canvas: { getBoundingClientRect: () => ({ width: 375, height: 560 }) },
      ResizeObserver: class { constructor(callback) { callback(); } },
      orbitAnimator: { reframe: () => { reframes += 1; } }, draw() {}
    });
    assert.deepEqual(camera, cameraFitManaged ? { ...createHomeCamera(375, 560) } : before);
    assert.equal(reframes, cameraFitManaged ? 1 : 0);
  }
});

test("repeated viewport and pause interruptions do not accumulate zoom or orbit-center drift", () => {
  const initial = { ...createHomeCamera(1265, 720) };
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
    assert.ok(Math.abs(camera.yaw - initial.yaw) <= 0.360001);
    assert.ok(Math.abs(camera.pitch - initial.pitch) <= 0.100001);
    assert.ok(Math.abs(camera.zoom / initial.zoom - 1) <= 0.080001);
  }
});

test("first manual zoom-out from compact fitted views reduces magnification instead of jumping to the old minimum", () => {
  const start = source.indexOf('  canvas.addEventListener("wheel", (event) => {');
  const end = source.indexOf('\n  canvas.addEventListener("dblclick"', start);
  for (const width of [480, 520, 600, 640]) {
    const camera = { ...createHomeCamera(width, 560) };
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

test("moving light follows the paused animation clock without jumping when the page becomes visible", () => {
  const h = harness();
  h.tick(5000);
  const phase = h.animator.elapsed();
  h.setReady(false);
  h.tick(60000);
  assert.equal(h.animator.elapsed(), phase);
  h.setReady(true);
  assert.ok(Math.abs(h.animator.elapsed() - phase) < 1e-9);
  h.tick(1000);
  assert.ok(h.animator.elapsed() > phase + 900);
  h.animator.setEnabled(false);
  const paused = h.animator.elapsed();
  h.tick(60000);
  assert.equal(h.animator.elapsed(), paused);
});

test("moving light stays on the observed curve and never bridges a missing-data gap", () => {
  const paths = [], dots = [];
  let current = [];
  const context = {
    save() {}, restore() {}, beginPath() { current = []; },
    createLinearGradient() { return { addColorStop() {} }; },
    moveTo(x, y) { current.push([x, y]); }, lineTo(x, y) { current.push([x, y]); },
    stroke() { paths.push(current); }, arc(x, y) { dots.push([x, y]); }, fill() {}
  };
  const points = Array.from({ length: 101 }, (_, x) => ({ x, y: x * x }));
  points[75] = null;
  drawOrbitGlow(context, points, "#75f39a", 0.8);
  assert.deepEqual(paths[0][0], [76, 76 * 76]);
  assert.deepEqual(paths[0].at(-1), [80, 80 * 80]);
  assert.deepEqual(dots, [[80, 80 * 80]]);
  drawOrbitGlow(context, points, "#75f39a", 0.75);
  assert.equal(paths.length, 1, "a gap has no fabricated pulse");
  drawOrbitGlow(context, points, "#75f39a", 0.95, true);
  assert.deepEqual(dots.at(-1), [95, 95 * 95]);
});

test("1920-wide default framing fills about 80–90 percent horizontally without changing data heights or depth", () => {
  for (const height of [720, 1000]) {
    const width = 1920;
    const view = createHomeCamera(width, height);
    const points = [];
    for (const x of [-5, 5]) for (const y of [0, 5.75]) for (const z of [-1.7, 1.7]) {
      const point = { x, y, z };
      const expanded = projectOrbitPoint(point, width, height, view);
      const standard = projectOrbitPoint(point, width, height, { ...view, horizontalScale: 1 });
      assert.equal(expanded.y, standard.y);
      assert.equal(expanded.depth, standard.depth);
      assert.equal(expanded.perspective, standard.perspective);
      points.push(expanded);
    }
    const occupied = (Math.max(...points.map(point => point.x)) - Math.min(...points.map(point => point.x))) / width;
    assert.ok(occupied >= 0.80 && occupied <= 0.90, `${width}×${height} occupies ${occupied}`);
    assert.ok(view.horizontalScale <= 2);
  }
  assert.equal(createHomeCamera(375, 560).horizontalScale, 1);
});

test("water ripples move exclusively in the grid plane and freeze with the paused animation clock", () => {
  const h = harness();
  h.tick(3000);
  const first = createOrbitFloorRipples(h.animator.elapsed());
  h.tick(1000);
  const second = createOrbitFloorRipples(h.animator.elapsed());
  assert.notDeepEqual(first, second);
  for (const ripple of second) {
    assert.ok(ripple.opacity >= 0 && ripple.opacity <= 1);
    for (const point of ripple.points) {
      assert.equal(point.y, 0);
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.z));
    }
  }
  h.setReady(false);
  h.tick(60000);
  assert.deepEqual(createOrbitFloorRipples(h.animator.elapsed()), second);
});

test("projected water light and blur are clipped to the real floor after manual camera movement", () => {
  for (const camera of [createHomeCamera(1920, 720), { yaw: 0.8, pitch: -0.3, zoom: 1.6, panX: 85, panY: -75, pivotY: 2.75 }]) {
    let current = [], clipPath, clipped = false, strokes = 0, saves = 0;
    const context = {
      save() { saves += 1; }, restore() { saves -= 1; }, beginPath() { current = []; }, closePath() {},
      moveTo(x, y) { current.push([x, y]); }, lineTo(x, y) { current.push([x, y]); },
      clip() { clipPath = current; clipped = true; }, createLinearGradient() { return { addColorStop() {} }; },
      stroke() {
        assert.equal(clipped, true);
        assert.equal(current.length, 73);
        assert.ok(current.flat().every(Number.isFinite));
        strokes += 1;
      },
    };
    drawOrbitFloorRipples(context, 1920, 720, camera, 4300);
    const expected = [[-5, -1.7], [5, -1.7], [5, 1.7], [-5, 1.7]].map(([x, z]) => {
      const point = projectOrbitPoint({ x, y: 0, z }, 1920, 720, camera);
      return [point.x, point.y];
    });
    assert.deepEqual(clipPath, expected);
    assert.equal(strokes, 4);
    assert.equal(saves, 0);
  }
});

test("the actual 3D renderer disables moving effects with reduced motion or pause and supports the shared dashboard", () => {
  const start = source.indexOf('  const draw3d = (');
  const end = source.indexOf('\n  const draw = () => {', start);
  for (const enabled of [false, true]) {
    let ripples = 0, curveLights = 0;
    const camera = createHomeCamera(1920, 720);
    const context = { save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fillText() {}, arc() {}, fill() {} };
    const rows = [{ date: new Date('2024-01-01'), value: 2 }, { date: new Date('2025-01-01'), value: 8 }];
    vm.runInNewContext(`${source.slice(start, end)}\ndraw3d(context,1920,720,rows,{lines:[{key:'value',color:'#75f39a'}]},{min:0,max:10},{min:0,max:10});`, {
      document: { body: { dataset: { theme: 'dark' } } }, camera, context, rows, state: { glow: false, range: 'all' },
      orbitAnimator: { isEnabled: () => enabled, elapsed: () => 4300 },
      drawWorldLine() {}, project3d: (point, width, height) => projectOrbitPoint(point, width, height, camera),
      drawOrbitFloorRipples(ctx, width, height, view, elapsed) { assert.equal(elapsed, 4300); ripples += 1; },
      drawOrbitGlow() { curveLights += 1; }, number: Number, formatAxis: String, thresholdsFor: () => [], isEnglish: () => false,
    });
    assert.equal(ripples, enabled ? 1 : 0);
    assert.equal(curveLights, enabled ? 1 : 0);
  }
});
