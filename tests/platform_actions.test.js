const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pages = ["index.html", "alphaops.html", "alpha-radar.html", "dashboard.html"];
const chatId = "v1.00.QzJDSWRDcnlwdEZpeGRJVoyW1RmbQWciia4jSYxam7s";

test("all main pages use the shared platform action styles", () => {
  pages.forEach((page) => {
    const html = fs.readFileSync(path.join(root, page), "utf8");
    assert.match(html, /href="platform-actions\.css"/);
    assert.match(html, /class="[^"]*global-tools[^"]*"/);
  });
});

test("Binance Chat appears immediately after Telegram on every main page", () => {
  pages.forEach((page) => {
    const html = fs.readFileSync(path.join(root, page), "utf8");
    const telegramIndex = html.indexOf("https://t.me/+lr6ZZscid4o0ZDhl");
    const chatIndex = html.indexOf(chatId);
    const supportIndex = html.indexOf("https://linktr.ee/welinkBTC");
    assert.ok(telegramIndex >= 0, `${page} is missing Telegram`);
    assert.ok(chatIndex > telegramIndex, `${page} must place Binance Chat after Telegram`);
    assert.ok(supportIndex > chatIndex, `${page} must place Support after Binance Chat`);
    assert.match(html, /global-tool--chat/);
    assert.match(html, /rel="noopener noreferrer"/);
  });
});

test("shared action labels are available in Chinese and English", () => {
  const homeScript = fs.readFileSync(path.join(root, "script.js"), "utf8");
  const dashboardScript = fs.readFileSync(path.join(root, "dashboard.js"), "utf8");
  const radarHtml = fs.readFileSync(path.join(root, "alpha-radar.html"), "utf8");
  [homeScript, dashboardScript].forEach((source) => {
    assert.match(source, /"tools\.binanceChat": "币安聊天室"/);
    assert.match(source, /"tools\.binanceChat": "Binance Chat"/);
  });
  assert.match(radarHtml, /data-platform-zh="币安聊天室"/);
  assert.match(radarHtml, /data-platform-en="Binance Chat"/);
});

test("Alpha Radar theme control is interactive and shares saved preferences", () => {
  const html = fs.readFileSync(path.join(root, "alpha-radar.html"), "utf8");
  const script = fs.readFileSync(path.join(root, "alpha-scanner.js"), "utf8");
  assert.match(html, /<button class="platform-theme global-tool" id="platform-theme"/);
  assert.match(script, /localStorage\.getItem\("welinkbtc-theme"\)/);
  assert.match(script, /localStorage\.getItem\("welinkbtc-language"\)/);
  assert.match(script, /platformTheme\.addEventListener\("click"/);
});

test("AlphaOps and Alpha Radar apply language preferences to their full workspaces", () => {
  const alphaOpsHtml = fs.readFileSync(path.join(root, "alphaops.html"), "utf8");
  const radarHtml = fs.readFileSync(path.join(root, "alpha-radar.html"), "utf8");
  const siteScript = fs.readFileSync(path.join(root, "script.js"), "utf8");
  const radarScript = fs.readFileSync(path.join(root, "alpha-scanner.js"), "utf8");
  const translator = fs.readFileSync(path.join(root, "ui-translations.js"), "utf8");

  assert.match(alphaOpsHtml, /<script src="ui-translations\.js"><\/script>\s*<script src="script\.js"><\/script>/);
  assert.match(radarHtml, /<script src="ui-translations\.js\?v=20260918-radar-v8"><\/script>\s*<script src="alpha-scanner\.js\?v=20260918-radar-v8"><\/script>/);
  assert.match(siteScript, /alphaOpsUiTranslator\?\.setLanguage\(currentLanguage\)/);
  assert.match(radarScript, /radarUiTranslator\?\.setLanguage\(platformLang\)/);
  assert.match(translator, /alphaops: \[/);
  assert.match(translator, /Wallet-powered Alpha Operations Platform/);
  assert.match(translator, /Risk Execution Layer/);
});

test("AlphaOps and Alpha Radar light themes cover workspace surfaces", () => {
  const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  const radarStyles = fs.readFileSync(path.join(root, "alpha-scanner.css"), "utf8");
  assert.match(styles, /body\[data-theme="light"\] \.alphaops-section/);
  assert.match(styles, /body\[data-theme="light"\] \.alphaops-page::before/);
  assert.match(radarStyles, /body\[data-theme="light"\] \.surf-pulse-panel/);
  assert.match(radarStyles, /body\[data-theme="light"\] :is\(\.panel, \.risk-pool-panel/);
});

test("AlphaOps project pool paginates at nine projects per page", () => {
  const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
  const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  assert.match(script, /const ALPHA_PROJECTS_PER_PAGE = 9;/);
  assert.match(script, /sortedProjects\.slice\(alphaProjectPageStart, alphaProjectPageStart \+ ALPHA_PROJECTS_PER_PAGE\)/);
  assert.match(script, /pagedProjects\.map\(\(project, index\) =>/);
  assert.match(script, /data-alpha-page=/);
  assert.match(script, /alphaProjectPage = 1;\s*renderAlphaProjectLibrary\(\);/);
  assert.match(styles, /\.alpha-library-pagination \{/);
  assert.match(styles, /\.alpha-library-pagination button\.is-active/);
});
