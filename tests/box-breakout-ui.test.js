const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
require("tsx/cjs");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

// Exercise the real component tree without a browser or network. Styles have no
// behavior in SSR; the browser verification separately covers their appearance.
const previousCss = require.extensions[".css"];
require.extensions[".css"] = module => {
  module.exports = { __esModule: true, default: new Proxy({}, { get: (_target, name) => String(name) }) };
};
const { BoxBreakoutSurface } = require("../components/box-breakout-surface.tsx");
const { BoxBreakoutChart, priceLabel } = require("../components/box-breakout-chart.tsx");
if (previousCss) require.extensions[".css"] = previousCss;
else delete require.extensions[".css"];
const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const render = props => renderToStaticMarkup(React.createElement(BoxBreakoutSurface, props));

test("box dashboard is native UI, with all three A-share scan choices and crypto market", () => {
  const html = render({ signedIn: false, canOperate: false });
  assert.match(html, /A股<span[^>]*>&amp;<\/span>加密箱体突破看板/);
  assert.match(html, /value="market"/);
  assert.match(html, /value="quick"/);
  assert.match(html, /value="pool"/);
  assert.match(html, /USDT 永续/);
  assert.doesNotMatch(html, /<iframe|<embed|<object\b/);
});

test("guest view offers sign in and disables starting scans", () => {
  const html = render({ signedIn: false, canOperate: false });
  assert.match(html, /href="\/login\?next=%2Fbox-breakout"/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>[\s\S]*?开始扫描<\/button>/);
  assert.match(html, /页面不会在访问时自动启动全市场任务/);
  assert.match(html, /自动扫描 未开启/);
});

test("unverified account remains read only even if signed in", () => {
  const html = render({ signedIn: true, canOperate: false });
  assert.match(html, /请完成二次验证并确认账号处于正常状态后操作/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>[\s\S]*?开始扫描<\/button>/);
  assert.doesNotMatch(html, /href="\/login\?next=/);
});

test("verified account receives an enabled explicit scan control", () => {
  const html = render({ signedIn: true, canOperate: true });
  const start = html.match(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*开始扫描<\/button>/)?.[0];
  assert.ok(start, "start scan button is present");
  assert.doesNotMatch(start, /disabled=/);
  assert.match(html, /只读研究 · 不自动交易/);
});

test("results provide named search, score filtering, ordering, and export controls", () => {
  const html = render({ signedIn: true, canOperate: true });
  for (const label of ["搜索代码或名称", "信号筛选", "排序方式", "导出当前筛选结果"]) {
    assert.ok(html.includes(`aria-label="${label}"`), label);
  }
  assert.match(html, /value="qualified"/);
  assert.match(html, /value="watch"/);
  assert.match(html, /value="all"/);
});

test("chart SSR stays honest while data loads and preserves micro-price precision", () => {
  const html = renderToStaticMarkup(React.createElement(BoxBreakoutChart, { symbol: "BTCUSDT", market: "crypto", box: null }));
  assert.match(html, /正在读取日 K 数据/);
  assert.doesNotMatch(html, /<svg/);
  assert.equal(priceLabel(.00000123), "0.00000123");
  assert.equal(priceLabel(NaN), "—");
  assert.equal(priceLabel(123456.78), "123,456.78");
});

test("chart interactions are keyboard accessible and data loading is lazy and abortable", () => {
  const source = read("components/box-breakout-chart.tsx");
  assert.match(source, /IntersectionObserver/);
  assert.match(source, /AbortController/);
  assert.match(source, /observer\.disconnect\(\); abort\.abort\(\)/);
  assert.match(source, /tabIndex=\{0\}/);
  assert.match(source, /ArrowLeft/);
  assert.match(source, /ArrowRight/);
  assert.match(source, /box\?\.testDates\.includes/);
});

test("quote polling is bounded to visible cards and stops in a hidden tab", () => {
  const source = read("components/box-breakout-surface.tsx");
  assert.match(source, /visible\.map\(candidate => candidate\.symbol\)/);
  assert.match(source, /pending \|\| document\.hidden/);
  assert.match(source, /setInterval\(\(\) => void refresh\(\), 3000\)/);
  assert.match(source, /clearInterval\(timer\); abort\.abort\(\)/);
  assert.match(source, /type="password" autoComplete="new-password"/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|eval\(/);
});

test("dashboard polling retains results when snapshot versions are unchanged", () => {
  const source = read("components/box-breakout-surface.tsx");
  assert.match(source, /new URLSearchParams\(\{ stockVersion:/);
  assert.match(source, /next\.stockUnchanged \? previous\.stocks : next\.stocks/);
  assert.match(source, /next\.cryptoUnchanged \? previous\.crypto : next\.crypto/);
});

test("new product uses an internal navigation entry and adaptive theme styles", () => {
  assert.match(read("components/box-breakout-surface.tsx"), /data-native-i18n="react"/, "Legacy DOM translation must not restore stale dynamic prices, totals or labels");
  const header = read("components/platform-header.tsx");
  assert.match(header, /href:\s*"\/box-breakout"/);
  assert.match(header, /A股&加密箱体突破看板/);
  const css = read("components/box-breakout.module.css");
  assert.match(css, /html\[data-theme="light"\]/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /max-width:\s*780px/);
});

test("scan submission feedback follows the actual job lifecycle and failures are actionable", () => {
  const source = read("components/box-breakout-surface.tsx");
  assert.match(source, /submittedJobId === state\.job\?\.id && running/);
  assert.match(source, /state\.job\?\.status === "failed" && <div className=\{styles\.error\} role="alert"/);
  assert.match(source, /重试本次扫描/);
  assert.match(source, /action: "scan", mode: state\.job!\.mode/);
  assert.doesNotMatch(source, /setMessage\(value\.action === "scan"/);
});

test("crypto scan controls expose three explicit sources and retain completed-result provenance", () => {
  const source = read("components/box-breakout-surface.tsx");
  for (const mode of ["crypto-radar", "crypto-mainstream", "crypto"]) assert.ok(source.includes(`mode: "${mode}"`));
  for (const label of ["扫描α-RadarTP异动排行榜", "扫描α-RadarTP热门精选主流", "扫描涨幅 TOP 30"]) assert.ok(source.includes(label));
  assert.match(source, /aria-label="加密市场扫描来源"/);
  assert.match(source, /disabled=\{!canOperate \|\| busy \|\| running\}/);
  assert.match(source, /action: "scan", mode: scan\.mode/);
  assert.match(source, /state\.cryptoSourceMode \?\? "crypto"/);
  assert.match(source, /cryptoPoolNames\[cryptoSourceMode\]/);
  assert.match(source, /cryptoSourceDescriptions\[cryptoSourceMode\]/);
});

test("market selector uses an accessible pressed-button group and navy styling is scoped", () => {
  const html = render({ signedIn: true, canOperate: true });
  assert.match(html, /role="group" aria-label="选择市场"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /aria-pressed="false"/);
  const css = read("components/box-breakout.module.css");
  assert.match(css, /--box-bg:\s*#0a0e17/);
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) auto minmax\(0, 1fr\)/);
  assert.match(css, /\.marketTabs\s*\{[^}]*justify-self:\s*center/);
});

test("score cells have dividers and card-only moving borders do not intercept interactions", () => {
  const source = read("components/box-breakout-surface.tsx");
  const css = read("components/box-breakout.module.css");
  assert.match(source, /aria-label="评分项目"/);
  assert.match(css, /\.conditions > div:nth-child\(odd\)[^}]*border-right:\s*1px solid var\(--box-rule\)/);
  assert.match(css, /\.conditions > div:nth-child\(n \+ 3\)[^}]*border-top:\s*1px solid var\(--box-rule\)/);
  assert.match(css, /\.card::before\s*\{[^}]*pointer-events:\s*none/);
  assert.match(css, /\.card::before\s*\{[^}]*mask-composite:\s*exclude/);
  assert.match(css, /animation:\s*boxBorderFlow 7s linear infinite/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*\.surface \*::before/);
});
