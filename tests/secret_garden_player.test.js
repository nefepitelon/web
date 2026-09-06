const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("Secret Garden player is mounted once from the root layout across the platform", () => {
  const layout = fs.readFileSync(path.join(root, "app", "layout.tsx"), "utf8");
  assert.match(layout, /SecretGardenPlayer/);
  assert.equal((layout.match(/<SecretGardenPlayer\s*\/>/g) || []).length, 1);
});

test("Secret Garden player uses seven public WeChat album sources without rehosting or downloading them", () => {
  const source = fs.readFileSync(path.join(root, "components", "secret-garden-player.tsx"), "utf8");
  for (const articleId of [
    "NffDzUnFuBE4P8GBzjE7BQ", "rpV91zdHNNeaMqibNgqciw", "xbwRK8w5MdhPQ-kQRGNYew",
    "wOQC3NYXcvFcH7qO5MNvhQ", "EbNaTmto3TZOsl-bIjmhXw", "tThGK-TPq27E32U_SHdG3Q",
    "b2_wqC_E5KEHtm1vTA8n1A"
  ]) assert.match(source, new RegExp(`mp\\.weixin\\.qq\\.com/s/${articleId.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}`));
  for (const mediaId of ["MjYy", "MjYz", "MjY0", "MjY1", "MjY2", "MjY3", "MjY4"]) {
    assert.match(source, new RegExp(`MzAwNDk3ODgxOV8yMjQ3NDg0${mediaId}`));
  }
  assert.match(source, /选择播放源/);
  assert.match(source, /selectSource/);
  assert.match(source, /preload="none"/);
  assert.doesNotMatch(source, /download\s*=/);
  assert.doesNotMatch(source, /\/audio\/|\/music\//);
});

test("Secret Garden player exposes the requested album names in its selectable source list", () => {
  const source = fs.readFileSync(path.join(root, "components", "secret-garden-player.tsx"), "utf8");
  for (const title of [
    "Songs From A Secret Garden", "White Stones", "Dawn Of A New Century", "Dreamcatcher",
    "Once In A Red Moon", "The Ultimate Secret Garden", "The Ultimate Secret Garden CD2"
  ]) assert.match(source, new RegExp(title));
  assert.match(source, /welinkbtc-secret-garden-source:v1/);
});

test("Secret Garden albums two through seven expose calibrated official-order chapters", () => {
  const source = fs.readFileSync(path.join(root, "components", "secret-garden-player.tsx"), "utf8");
  const expectedCounts = [
    ["WHITE_STONES_CHAPTERS", 14],
    ["DAWN_CHAPTERS", 13],
    ["DREAMCATCHER_CHAPTERS", 13],
    ["RED_MOON_CHAPTERS", 12],
    ["ULTIMATE_CHAPTERS", 14],
    ["ULTIMATE_LIVE_CHAPTERS", 10]
  ];
  for (const [name, count] of expectedCounts) {
    const match = source.match(new RegExp(`const ${name} = chaptersFromStarts\\(\\[(.*?)\\] as const`, "s"));
    assert.ok(match, `${name} is declared`);
    assert.equal((match[1].match(/^\s*\["/gm) || []).length, count, `${name} has ${count} selectable chapters`);
    assert.match(source, new RegExp(`chapters: ${name}`));
  }
  for (const title of [
    "Steps 步伐", "Moongate 月亮门", "Dreamcatcher 追梦人", "Awakening 梦醒时分",
    "Swan 天鹅", "Poeme 诗篇（Live）", "Dawn Of A New Century 新世纪的曙光（Live）"
  ]) assert.match(source, new RegExp(title));
  assert.doesNotMatch(source, /singleChapter/);
});

test("Secret Garden volume control is rendered after the transport controls", () => {
  const source = fs.readFileSync(path.join(root, "components", "secret-garden-player.tsx"), "utf8");
  const transportIndex = source.indexOf('<div className={styles.transport}>');
  const volumeIndex = source.indexOf('<div className={styles.volumeControl}>');
  assert.ok(transportIndex >= 0 && volumeIndex > transportIndex);
  assert.match(source, /savedVolumeValue === null \? Number\.NaN/);
});

test("Secret Garden player exposes the full album as thirteen navigable chapters", () => {
  const source = fs.readFileSync(path.join(root, "components", "secret-garden-player.tsx"), "utf8");
  for (const title of [
    "Nocturne", "Pastorale", "Song From A Secret Garden", "Sigma", "Papillon", "Serenade To Spring",
    "Atlantia", "Heartstrings", "Adagio", "The Rap", "Chaconne", "Cantoluna", "Ode To Simplicity"
  ]) assert.match(source, new RegExp(title));
  assert.match(source, /moveChapter/);
  assert.match(source, /selectChapter/);
  assert.match(source, /后退十秒/);
  assert.match(source, /前进十秒/);
});

test("Secret Garden player supports compact, expanded, draggable and accessible states", () => {
  const source = fs.readFileSync(path.join(root, "components", "secret-garden-player.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(root, "components", "secret-garden-player.module.css"), "utf8");
  assert.match(source, /打开神秘园音乐播放器/);
  assert.match(source, /神秘园播放器控制台/);
  assert.match(source, /onPointerDown={startDrag}/);
  assert.match(source, /welinkbtc-secret-garden-top:v1/);
  assert.match(styles, /position:\s*fixed/);
  assert.match(styles, /right:\s*max\(16px/);
  assert.match(styles, /\.expanded/);
  assert.match(styles, /@media \(max-width: 660px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});
