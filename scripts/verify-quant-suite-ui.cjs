// Browser interaction tests for the real Quant Suite components. All requests are
// fulfilled locally against fixtures; no server, account or exchange is accessed.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { build } = require("esbuild");
const { chromium } = require(process.env.QUANT_PLAYWRIGHT_PATH || "playwright");

(async () => {
  const compiled = await build({
    stdin: { contents: `import {createRoot} from 'react-dom/client';
      import {PlatformHeader} from './components/platform-header';
      import {QuantSuiteSurface} from './components/quant-suite-surface';
      import './app/globals.css';
      const params = new URLSearchParams(location.search);
      const engine = location.pathname.split('/')[2];
      createRoot(document.getElementById('root')).render(<div className="app-shell"><PlatformHeader viewer={null}/><QuantSuiteSurface selectedEngine={engine} signedIn={!params.has('guest')} canOperate={!params.has('readonly')} canLive={!params.has('readonly')} operatorLabel="LOCAL FIXTURE"/></div>);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, outfile: "fixture.js", jsx: "automatic", loader: { ".css": "css" }, define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{ name: "fixture", setup(b) {
      b.onLoad({ filter: /\.module\.css$/ }, args => ({ contents: fs.readFileSync(args.path, "utf8"), loader: "local-css" }));
      b.onResolve({ filter: /^next\/(link|navigation)$/ }, args => ({ path: args.path, namespace: "fixture" }));
      b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path.endsWith("navigation") ? "export function usePathname(){return location.pathname;}" : "import {createElement} from 'react'; export default function Link({prefetch,...props}){return createElement('a',props);}", loader: "js", resolveDir: process.cwd() }));
    } }],
  });
  const js = compiled.outputFiles.find(file => file.path.endsWith(".js")).text;
  const css = compiled.outputFiles.find(file => file.path.endsWith(".css")).text;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.QUANT_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => { localStorage.setItem("welinkbtc-language", "en"); localStorage.setItem("welinkbtc-theme", "dark"); });
  const errors = [], mutations = [], matrix = [];
  let getCount = 0, holdSave = false, releaseSave, rejectNext = false;
  const state = { config: { name: "Fixture workspace", mode: "paper", exchange: "binance", symbols: ["BTC/USDT"], timeframe: "1h", strategy: "default", stakeAmount: 100, maxOpenTrades: 2, stopLossPct: 2 }, revision: 0, pendingCommand: null, runtime: { state: "ready", version: "FIXTURE-ONLY", capabilities: ["paper", "live", "stop", "backtest"], positions: [], orders: [] }, audits: [] };
  const screenshotDir = path.resolve("artifacts/quant-suite-ui-fixtures");
  fs.mkdirSync(screenshotDir, { recursive: true });
  async function install(page) {
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", event => { if (event.type() === "error") errors.push(event.text()); });
    await page.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.hostname !== "quant-fixture.invalid") { errors.push("Unexpected external request: " + url.hostname); return route.fulfill({ status: 403, body: "Fixture network isolation" }); }
      if (url.pathname === "/fixture.js") return route.fulfill({ contentType: "application/javascript", body: js });
      if (url.pathname === "/fixture.css") return route.fulfill({ contentType: "text/css", body: css });
      if (url.pathname === "/api/quant-suite") {
        if (request.method() === "GET") {
          getCount++;
          const readonly = new URL(page.url()).searchParams.has("readonly");
          return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, configured: true, canOperate: !readonly, canLive: !readonly, engines: [], instances: ["freqtrade", "nautilus", "hummingbot", "lean", "jesse", "octobot"].map(engine => ({ engine, config: state.config, revision: state.revision, updatedAt: state.revision ? "2026-09-06T08:00:00.000Z" : null, pendingCommand: state.pendingCommand, runtime: state.runtime })), audits: state.audits }) });
        }
        const command = request.postDataJSON(); mutations.push(command);
        assert.match(command.requestId, /^[0-9a-f-]{36}$/);
        if (holdSave && command.action === "save-config") await new Promise(resolve => { releaseSave = resolve; });
        if (rejectNext) { rejectNext = false; return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: false, message: "Fixture preflight rejection", blockers: ["Historical data unavailable"] }) }); }
        if (command.action === "save-config") { state.config = command.config; state.revision++; }
        if (command.action === "start") state.runtime.state = "running";
        if (command.action === "stop") { state.runtime.state = "ready"; state.pendingCommand = null; }
        state.audits.unshift({ id: command.requestId, engine: command.engine, action: command.action, createdAt: "2026-09-06T08:00:00.000Z", status: "SUCCEEDED", message: "Local fixture action" });
        return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, message: `Fixture ${command.action} completed`, ...(command.action === "backtest" ? { result: { fixtureOnly: true, report: "BACKTEST_FIXTURE_REPORT", dataSource: "local fixture" } } : {}) }) });
      }
      if (url.pathname.startsWith("/api/")) { errors.push("Unexpected API: " + url.pathname); return route.fulfill({ status: 404, body: "" }); }
      if (url.pathname.endsWith(".webp")) return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"/>' });
      return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="en" data-theme="dark" data-language="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>' });
    });
  }
  try {
    const page = await context.newPage(); await install(page);
    await page.goto("https://quant-fixture.invalid/quant-suite/freqtrade", { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: "Runtime", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "Run preflight", exact: true }).isDisabled(), true, "An unsaved default configuration must not enable execution.");
    assert.equal(await page.getByRole("button", { name: "Start paper trading", exact: true }).isDisabled(), true);
    await page.getByRole("tab", { name: "Configuration", exact: true }).click();
    await page.getByLabel("Configuration name", { exact: true }).fill("Saved fixture strategy");
    await page.getByLabel(/^Installed strategy \/ trading mode/).fill("FixtureTrend");
    await page.getByLabel(/^Trading symbols/).fill("btc/usdt, eth/usdt");
    await page.getByLabel("Backtest start date", { exact: true }).fill("2026-01-01");
    await page.getByLabel("Backtest end date", { exact: true }).fill("2026-04-01");
    await page.getByRole("button", { name: "Refresh runtime status", exact: true }).click();
    await page.waitForTimeout(100);
    assert.equal(await page.getByLabel("Configuration name", { exact: true }).inputValue(), "Saved fixture strategy", "Polling must preserve unsaved edits.");
    holdSave = true;
    await page.getByRole("button", { name: "Save configuration", exact: true }).click();
    await page.getByRole("button", { name: "Saving…", exact: true }).waitFor();
    assert.equal(await page.getByLabel("Configuration name", { exact: true }).isDisabled(), true);
    while (!releaseSave) await page.waitForTimeout(10);
    holdSave = false; releaseSave();
    await page.getByText("Fixture save-config completed", { exact: true }).waitFor();
    assert.equal(mutations[0].action, "save-config");
    assert.deepEqual(mutations[0].config.symbols, ["BTC/USDT", "ETH/USDT"]);
    assert.equal(mutations[0].config.startDate, "2026-01-01");
    assert.equal(mutations[0].config.endDate, "2026-04-01");
    assert.equal(await page.locator("main").getAttribute("data-native-i18n"), "react", "Native DOM translation must not mutate React-owned localized content.");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export saved configuration", exact: true }).click();
    const exported = await downloadPromise;
    assert.equal(exported.suggestedFilename(), "freqtrade-saved-config.json");
    const exportConfig = JSON.parse(fs.readFileSync(await exported.path(), "utf8"));
    assert.deepEqual(exportConfig, mutations[0].config, "Configuration export must match the persisted non-sensitive strategy fields.");
    assert.equal(await page.getByRole("link", { name: "Download runtime source", exact: true }).getAttribute("href"), "/downloads/welinkbtc-quant-runtime.zip");
    await page.getByRole("tab", { name: "Research", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "Optimize", exact: true }).isDisabled(), true, "Missing capability must disable the action.");
    await page.getByRole("button", { name: "Run backtest", exact: true }).click();
    await page.getByText(/BACKTEST_FIXTURE_REPORT/).waitFor();
    assert.equal(mutations.at(-1).config, undefined, "Execution actions must use persisted server configuration.");
    await page.getByRole("tab", { name: "Runtime", exact: true }).click();
    rejectNext = true;
    await page.getByRole("button", { name: "Run preflight", exact: true }).click();
    await page.getByText("Historical data unavailable", { exact: true }).waitFor();
    await page.getByRole("tab", { name: "Configuration", exact: true }).click();
    await page.getByRole("button", { name: "LIVE Real capital", exact: true }).click();
    await page.getByRole("button", { name: "Save configuration", exact: true }).click();
    await page.getByText("Fixture save-config completed", { exact: true }).waitFor();
    await page.getByRole("tab", { name: "Runtime", exact: true }).click();
    await page.getByRole("button", { name: "Authorize live startup", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const confirm = dialog.getByRole("button", { name: "Confirm and start live", exact: true });
    assert.equal(await confirm.isDisabled(), true);
    await dialog.getByRole("textbox").fill("LIVE wrong"); assert.equal(await confirm.isDisabled(), true);
    await dialog.getByRole("textbox").fill("LIVE freqtrade"); assert.equal(await confirm.isEnabled(), true);
    await confirm.click(); await dialog.waitFor({ state: "hidden" });
    assert.equal(mutations.at(-1).confirmation, "LIVE freqtrade");
    state.runtime.state = "ready"; state.pendingCommand = "fixture-unconfirmed-command";
    await page.getByRole("button", { name: "Refresh runtime status", exact: true }).click();
    await page.getByText(/The previous execution is unconfirmed/).waitFor();
    assert.equal(await page.getByRole("button", { name: "Authorize live startup", exact: true }).isDisabled(), true, "An unconfirmed command must block duplicate startup.");
    assert.equal(await page.getByRole("button", { name: "Stop strategy", exact: true }).isEnabled(), true);
    state.runtime.state = "offline";
    await page.getByRole("button", { name: "Refresh runtime status", exact: true }).click();
    await page.getByText("Offline", { exact: true }).first().waitFor();
    assert.equal(await page.getByRole("button", { name: "Stop strategy", exact: true }).isEnabled(), true, "Stop remains available after lost acknowledgement.");
    await page.getByRole("button", { name: "Stop strategy", exact: true }).click();
    await page.getByText("Fixture stop completed", { exact: true }).waitFor();
    await page.getByRole("tab", { name: "Audit trail", exact: true }).click();
    assert.ok(await page.getByRole("cell", { name: "Local fixture action", exact: true }).count());
    await page.getByRole("tab", { name: "Configuration", exact: true }).click();
    await page.getByRole("tab", { name: "Configuration", exact: true }).press("ArrowRight");
    assert.equal(await page.getByRole("tab", { name: "Research", exact: true }).getAttribute("aria-selected"), "true");

    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const language of ["en", "zh"]) for (const theme of ["dark", "light"]) {
        // Site preferences are stored on the document. Desktop controls are also
        // exercised below; mobile uses the same document preference mechanism.
        await page.evaluate(({ language, theme }) => { document.documentElement.dataset.language = language; document.documentElement.dataset.theme = theme; }, { language, theme });
        for (const name of language === "en" ? ["Configuration", "Research", "Runtime", "Audit trail"] : ["策略配置", "研究与回测", "运行与执行", "操作审计"]) {
          await page.getByRole("tab", { name, exact: true }).click();
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
          assert.equal(overflow, false, `Page overflow: ${width}/${language}/${theme}/${name}`);
          matrix.push({ width, language, theme, tab: name });
        }
        if (language === "en") {
          const untranslated = await page.locator("main h1,main h2,main h3,main p,main label").allTextContents();
          assert.deepEqual(untranslated.filter(text => /[\u4e00-\u9fff]/.test(text)), []);
        }
        await page.getByRole("tab", { name: language === "en" ? "Configuration" : "策略配置", exact: true }).click();
        await page.screenshot({ path: path.join(screenshotDir, `workspace-${width}-${language}-${theme}.png`), fullPage: true });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "Switch to English", exact: true }).click();
    await page.getByRole("tab", { name: "Configuration", exact: true }).waitFor();
    await page.locator(".platform-tools--desktop button").first().click();
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");

    await page.goto("https://quant-fixture.invalid/quant-suite", { waitUntil: "networkidle" });
    assert.equal(await page.locator("main a").filter({ hasText: "Open workspace" }).count(), 6);
    await page.locator(".platform-product-menu summary").click();
    assert.equal(await page.locator(".platform-quant-group .platform-more-links > a").count(), 6);
    await page.screenshot({ path: path.join(screenshotDir, "products-menu.png"), fullPage: false });
    await page.goto("https://quant-fixture.invalid/quant-suite/freqtrade?readonly", { waitUntil: "networkidle" });
    assert.equal(await page.getByRole("button", { name: "Save configuration", exact: true }).isDisabled(), true);
    const countBeforeGuest = getCount;
    await page.goto("https://quant-fixture.invalid/quant-suite?guest", { waitUntil: "networkidle" });
    assert.equal(getCount, countBeforeGuest, "Guest view must not request authenticated runtime data.");
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, fixtureOnly: true, externalRequests: 0, matrixChecks: matrix.length, actionChecks: mutations.map(({ action }) => action), savedDateRange: true, pendingSaveProtected: true, unsavedEditsPreserved: true, runtimeCapabilityGates: true, typedLiveConfirmation: true, stopAfterLostAcknowledgement: true, readOnlyEnforced: true, guestDoesNotPoll: true, noConsoleErrors: true, screenshotDir }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
