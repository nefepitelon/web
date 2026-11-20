const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../product-dashboard.js'), 'utf8');
const helpers = source.slice(source.indexOf('  function createHomeOrbitAnimator('), source.indexOf('\n  const DAY_MS'));
const { createOrbitLakeRain, drawOrbitFloorRipples, projectOrbitPoint, createHomeCamera } = vm.runInNewContext(`${helpers}\n({createOrbitLakeRain, drawOrbitFloorRipples, projectOrbitPoint, createHomeCamera});`);

test('lake rain drops accelerate to a fixed impact point, then produce delayed expanding and fading rings', () => {
  const first = createOrbitLakeRain(0).drops[0];
  const falling = createOrbitLakeRain(300).drops[0];
  assert.equal(first.x, falling.x);
  assert.equal(first.z, falling.z);
  assert.ok(first.y > falling.y && falling.y > 0);
  assert.equal(createOrbitLakeRain(450).drops.length, 0);
  assert.equal(createOrbitLakeRain(450).impacts.length, 1);
  assert.equal(createOrbitLakeRain(600).ripples.length, 2, 'secondary wave follows the first impact');
  const early = createOrbitLakeRain(700).ripples[0];
  const late = createOrbitLakeRain(1700).ripples.find(ripple => ripple.x === early.x && ripple.z === early.z);
  assert.ok(late.radius > early.radius);
  assert.ok(late.opacity < early.opacity);
  assert.equal(createOrbitLakeRain(3200).ripples.some(ripple => ripple.x === early.x && ripple.z === early.z), false, 'spent waves disappear');
});

test('lake rain is deterministic, scattered across the plane and bounded independently of elapsed time', () => {
  for (const time of [0, 4300, 60000, 86400000, Number.NaN, -100]) {
    const weather = createOrbitLakeRain(time);
    assert.deepEqual(weather, createOrbitLakeRain(time));
    assert.ok(weather.drops.length <= 1);
    assert.ok(weather.ripples.length <= 9);
    for (const ripple of weather.ripples) {
      assert.ok(ripple.opacity >= 0 && ripple.opacity <= 1);
      assert.ok(ripple.points.length <= 41);
      assert.ok(ripple.points.every(point => point.y === 0 && Number.isFinite(point.x) && Number.isFinite(point.z)));
    }
  }
  const locations = createOrbitLakeRain(4300).ripples.map(ripple => `${ripple.x}:${ripple.z}`);
  assert.ok(new Set(locations).size >= 2, 'separate raindrops never share a moving central origin');
});

test('rain waves and splash light are clipped to the projected floor while falling streaks remain above it', () => {
  const camera = createHomeCamera(1920, 720);
  let current = [], clipping = false, clipPath, waveCount = 0, streakCount = 0, saves = 0;
  const context = {
    save() { saves += 1; }, restore() { saves -= 1; }, beginPath() { current = []; }, closePath() {},
    moveTo(x, y) { current.push([x, y]); }, lineTo(x, y) { current.push([x, y]); },
    createLinearGradient() { return { addColorStop() {} }; }, clip() { clipPath = current; clipping = true; },
    stroke() {
      assert.ok(current.flat().every(Number.isFinite));
      if (current.length === 2) { assert.equal(clipping, false); streakCount += 1; }
      else { assert.equal(current.length, 41); assert.equal(clipping, true); waveCount += 1; }
    }, arc() { assert.equal(clipping, true); }, fill() {}
  };
  drawOrbitFloorRipples(context, 1920, 720, camera, 3750, false, true, true);
  assert.equal(streakCount, 1);
  assert.ok(waveCount > 0 && waveCount <= 9);
  assert.equal(saves, 0);
  const expected = [[-5, -1.7], [5, -1.7], [5, 1.7], [-5, 1.7]].map(([x, z]) => {
    const point = projectOrbitPoint({ x, y: 0, z }, 1920, 720, camera);
    return [point.x, point.y];
  });
  assert.deepEqual(clipPath, expected);
});

test('brand seal uses unique SVG paths, preserves legible branding and compositor animations pause without chart redraws', () => {
  const animations = Array.from({ length: 3 }, () => ({ plays: 0, pauses: 0, play() { this.plays += 1; }, pause() { this.pauses += 1; } }));
  const paths = [{ id: 'address-flow-brand-copy-top' }, { id: 'address-flow-brand-copy-bottom' }];
  const lettering = paths.map(path => ({ href: `#${path.id}`, textContent: 'ai.WELINKBTC.xyz', getAttribute() { return this.href; }, setAttribute(name, value) { this.href = value; } }));
  const seal = { style: {}, dataset: {}, classList: { add() {} }, setAttribute() {},
    querySelectorAll(selector) { return selector === 'path[id]' ? paths : lettering; }, getAnimations() { return animations; } };
  const createSeal = vm.runInNewContext(`${helpers}\ncreateDashboardBrandSeal;`, {
    isHomePage: false, hasTrendExperience: true,
    document: { querySelector() { return { cloneNode() { return seal; } }; } },
    section: { querySelector() { return { appendChild(node) { assert.equal(node, seal); } }; } }
  });
  const controller = createSeal();
  assert.equal(paths[0].id, 'trend-address-flow-brand-copy-top');
  assert.equal(lettering[0].href, '#trend-address-flow-brand-copy-top');
  assert.equal(lettering[1].textContent, 'welinkBTC');
  assert.match(seal.style.cssText, /pointer-events:none/);
  controller.sync(false); controller.sync(false); controller.sync(true); controller.sync(true); controller.sync(false);
  assert.equal(seal.dataset.motion, 'paused');
  for (const animation of animations) { assert.equal(animation.plays, 1); assert.equal(animation.pauses, 2); }
});

test('dashboard plain wheel scrolls the page while Ctrl or Command wheel deliberately zooms the 3D chart', () => {
  const start = source.indexOf('  canvas.addEventListener("wheel", (event) => {');
  const end = source.indexOf('\n  canvas.addEventListener("dblclick"', start);
  let handler, prevented = 0, interactions = 0, draws = 0;
  const camera = { zoom: 1 };
  vm.runInNewContext(source.slice(start, end), {
    canvas: { addEventListener(name, listener) { handler = listener; } },
    state: { view: '3d' }, isHomePage: false, hasTrendExperience: true,
    camera, cameraFitManaged: true, minCameraZoom: 0.2,
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    orbitAnimator: { interaction() { interactions += 1; } }, draw() { draws += 1; }
  });
  handler({ deltaY: 120, preventDefault() { prevented += 1; } });
  assert.equal(camera.zoom, 1);
  assert.equal(prevented, 0);
  assert.equal(draws, 0);
  for (const modifier of ['ctrlKey', 'metaKey']) {
    const before = camera.zoom;
    handler({ deltaY: 120, [modifier]: true, preventDefault() { prevented += 1; } });
    assert.ok(camera.zoom < before);
  }
  assert.equal(prevented, 2);
  assert.equal(draws, 2);
  assert.equal(interactions, 2);
});
