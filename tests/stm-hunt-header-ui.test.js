const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const cheerio = require('cheerio');

function loadSurface(react = React, browser = undefined) {
  const filename = path.join(__dirname, '..', 'components/stm-hunt-surface.tsx');
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const imports = (id) => id === 'react' ? react
    : id === 'next/link' ? ({ children, ...props }) => React.createElement('a', props, children)
    : id === './stm-hunt-terminal' ? { StmHuntTerminal: () => null }
      : id === './stm-hunt-radar' ? { StmHuntRadar: () => null } : require(id);
  vm.runInNewContext(code, { module, exports: module.exports, require: imports, Date, Intl, window: browser }, { filename });
  return module.exports;
}
const { StmHuntHeader, StmSourceMarquee } = loadSurface();
const sourceAt = '2026-11-19T02:10:00.000Z';
const checkedAt = '2026-11-25T09:00:00.000Z';
const sources = ['ok', 'stale', 'unavailable', 'restricted'].map((status, index) => ({
  id: `source-${index}`, name: `Source ${index}`, url: 'https://example.com/', status,
  fetchedAt: checkedAt, checkedAt, updatedAt: index === 3 ? null : sourceAt,
  count: 10, latencyMs: 5, message: `Actual ${status} response`, semantics: 'snapshot',
}));
const dashboard = { asOf: checkedAt, sources, metrics: { traders: 884, candidates: 50, ready: 0, paperPnlUsd: -12.5 },
  state: { paper: [{ status: 'closed' }, { status: 'open' }] } };
const markup = (element) => cheerio.load(renderToStaticMarkup(element));

test('header places all four real metrics beside scan and removes the full-width strip and Alpha link', () => {
  const $ = markup(React.createElement(StmHuntHeader, { data: dashboard, scanning: false, disabled: false, onScan() {} }));
  assert.equal($('.stm-hero-toolbar .stm-toolbar-metrics > div').length, 4);
  assert.deepEqual($('.stm-toolbar-metrics dt').map((_, el) => $(el).text()).get(), ['追踪交易员', '候选资产', '就绪信号', '模拟已实现盈亏']);
  assert.deepEqual($('.stm-toolbar-metrics dd').map((_, el) => $(el).text()).get(), ['884', '50', '0', '-$12.50']);
  assert.equal($('.stm-toolbar-metrics dd.stm-pink').length, 1);
  assert.match($('.stm-toolbar-metrics > div').last().attr('title'), /1 笔模拟平仓.*不计入实盘/);
  assert.equal($('.stm-hero-toolbar .stm-scan-button').text(), '扫描市场');
  assert.equal($('.stm-metrics, a[href="/alpha-radar"]').length, 0);
  assert.equal($('.stm-version').text(), 'STM / v1.6.0');
  assert.match($('.stm-hero-meta').text(), /1\/4 来源状态正常/);
  assert.match($('.stm-hero-meta').text(), /快照 11\/25 17:00/);
});

test('initial loading retains unknown metric values and does not invent healthy sources', () => {
  const $ = markup(React.createElement(StmHuntHeader, { data: null, scanning: false, disabled: true, onScan() {} }));
  assert.deepEqual($('.stm-toolbar-metrics dd').map((_, el) => $(el).text()).get(), ['—', '—', '—', '—']);
  assert.match($('.stm-source-ticker-empty').text(), /状态尚未读取/);
  assert.equal($('.stm-source-ticker-track, .stm-hero-meta .stm-dot-ok').length, 0);
  assert.equal($('.stm-source-ticker-toggle[disabled], .stm-scan-button[disabled]').length, 2);
});

test('marquee keeps source freshness separate from current checks and announces each source once', () => {
  const $ = markup(React.createElement(StmSourceMarquee, { sources }));
  const primary = $('.stm-source-ticker-group[role="list"]');
  assert.equal(primary.find('[role="listitem"]').length, 4);
  assert.deepEqual(primary.find('.stm-source-ticker-status').map((_, el) => $(el).text()).get(), ['可访问', '数据陈旧', '暂不可用', '需要授权']);
  assert.match(primary.find('.stm-source-ticker-item').eq(1).text(), /源 11\/19 10:10查 11\/25 17:00/);
  assert.match(primary.find('.stm-source-ticker-item').eq(3).text(), /源 未提供查 11\/25 17:00/);
  assert.equal($('.stm-source-ticker-group[aria-hidden="true"]').length, 1);
  assert.equal($('.stm-source-ticker-group[aria-hidden="true"] [role="listitem"]').length, 0);
  assert.equal($('.stm-source-ticker-viewport[tabindex="0"]').length, 1);
  assert.equal($('.stm-source-ticker-toggle').attr('aria-controls'), $('.stm-source-ticker-viewport').attr('id'));
});

test('manual pause toggles the real animation state and can resume without refreshing data', () => {
  const states = [];
  let cursor = 0;
  const hooks = { ...React, useId: () => 'source-viewport', useEffect() {}, useState(initial) {
    const index = cursor++;
    if (!(index in states)) states[index] = initial;
    return [states[index], (next) => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
  } };
  const { StmSourceMarquee: Marquee } = loadSurface(hooks);
  const render = () => { cursor = 0; return Marquee({ sources }); };
  let tree = render();
  assert.equal(tree.props['data-paused'], false);
  tree.props.children[2].props.onClick();
  tree = render();
  assert.equal(tree.props['data-paused'], true);
  assert.equal(tree.props.children[2].props['aria-pressed'], true);
  assert.equal(tree.props.children[2].props['aria-label'], '继续来源状态滚动');
  tree.props.children[2].props.onClick();
  assert.equal(render().props['data-paused'], false);
});

test('reduced-motion preference and later changes synchronize pause control and clean up listener', () => {
  const states = [];
  const effects = [];
  let cursor = 0;
  let change;
  let removed = false;
  const media = { matches: true, addEventListener(name, handler) { assert.equal(name, 'change'); change = handler; },
    removeEventListener(name, handler) { removed = name === 'change' && handler === change; } };
  const hooks = { ...React, useId: () => 'source-viewport', useEffect(effect) { effects.push(effect); }, useState(initial) {
    const index = cursor++;
    if (!(index in states)) states[index] = initial;
    return [states[index], (next) => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
  } };
  const { StmSourceMarquee: Marquee } = loadSurface(hooks, { matchMedia: () => media });
  const render = () => { cursor = 0; return Marquee({ sources }); };
  render();
  const cleanup = effects[0]();
  let tree = render();
  assert.equal(tree.props['data-paused'], true);
  assert.equal(tree.props.children[2].props.disabled, true);
  assert.match(tree.props.children[2].props['aria-label'], /系统已减少动态效果/);
  media.matches = false;
  change();
  tree = render();
  assert.equal(tree.props['data-paused'], false);
  assert.equal(tree.props.children[2].props.disabled, false);
  cleanup();
  assert.equal(removed, true);
});

test('ticker styles move left with transform and pause for hover, focus and reduced motion', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'app/stm-hunt/stm-hunt.css'), 'utf8');
  assert.match(css, /@keyframes stm-source-travel[^}]*\}[^}]*translateX\(-50%\)/);
  assert.match(css, /stm-source-ticker-viewport:hover[^}]*animation-play-state: paused/);
  assert.match(css, /stm-source-ticker-viewport:focus-within[^}]*animation-play-state: paused/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?stm-source-ticker-track \{ animation: none; transform: none;/);
});
