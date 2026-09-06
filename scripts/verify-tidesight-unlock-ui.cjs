const assert = require("node:assert/strict");
const path = require("node:path");
const { build } = require("esbuild");
const { chromium } = require(process.env.TIDESIGHT_PLAYWRIGHT_PATH || "playwright");

// Bundle the real component with a fixture admin. All browser traffic is intercepted;
// this harness cannot change a real account or send a live unlock request.
(async () => {
  const compiled = await build({
    stdin: { contents: `import { createRoot } from 'react-dom/client'; import { TideSightQuantSurface } from './components/tidesight-quant-surface'; createRoot(document.getElementById('root')).render(<TideSightQuantSurface signedIn canOperate canUnlockLive operatorLabel="FIXTURE · NO REAL ACCOUNT" initialTab="execution" />);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, outfile: "fixture.js", jsx: "automatic", loader: { ".css": "local-css" },
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{ name: "fixture-link", setup(build) {
      build.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "fixture" }));
      build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "import { createElement } from 'react'; export default function Link({ prefetch, ...props }) { return createElement('a', props); }", loader: "js", resolveDir: process.cwd() }));
    } }],
  });
  const js = compiled.outputFiles.find(file => file.path.endsWith(".js")).text;
  const css = compiled.outputFiles.find(file => file.path.endsWith(".css")).text;
  const browser = await chromium.launch({ headless: true, executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [], requests = [];
    let verified = false;
    const permissionSummary = { accountMode: "portfolio", accountType: "PORTFOLIO_MARGIN_UM", portfolioMargin: { uniMMR: 5, minUniMMR: 1.5, collateralEquity: 2000, actualEquity: 2200, initialMargin: 100, maintenanceMargin: 400 } };
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/fixture.js") return route.fulfill({ contentType: "application/javascript", body: js });
      if (url.pathname === "/fixture.css") return route.fulfill({ contentType: "text/css", body: css });
      if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: '<!doctype html><html data-language="zh"><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"><style>body{margin:0;font-family:Arial,sans-serif}*{box-sizing:border-box}button,input,select{font:inherit}</style><div id="root"></div><script src="/fixture.js"></script></html>' });
      if (url.pathname === "/api/tidesight/execution/status") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, config: { activeMode: "paper", defaultMarket: "futures", liveEnabled: false, autoExecuteEnabled: false, requireProtectionOrders: true, reconciliationHealthy: false, killSwitchActive: false, liveUnlocked: false }, credentials: [{ id: "fixture", environment: "LIVE", market: "FUTURES", apiKeyHint: "FIXTURE", enabled: true, verifiedAt: verified ? new Date().toISOString() : null, permissionSummary: verified ? permissionSummary : null }], portfolioStats: [], positions: [], plans: [], orders: [], audits: [] }) });
      if (url.pathname === "/api/tidesight/execution/preflight") {
        assert.deepEqual(route.request().postDataJSON(), { environment: "live", market: "futures" }); verified = true;
        return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, result: { ...permissionSummary, canTrade: true } }) });
      }
      if (url.pathname === "/api/tidesight/execution/live-unlock") {
        requests.push(route.request().postDataJSON());
        return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
      }
      return route.abort();
    });
    await page.goto("http://tidesight-fixture.invalid/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "连接与权限预检" }).click();
    await page.getByLabel("Verified account routing").waitFor();
    assert.match(await page.getByLabel("Verified account routing").innerText(), /PAPI.*统一保证金/);
    assert.match(await page.getByLabel("Verified account routing").innerText(), /uniMMR 5/);
    const group = page.getByRole("group", { name: "生产实盘协议确认" });
    const button = group.getByRole("button", { name: "显式解锁生产实盘" });
    const checks = group.getByRole("checkbox");
    assert.equal(await group.getByRole("textbox").count(), 0);
    assert.equal(await checks.count(), 2);
    assert.equal(await button.isDisabled(), true);
    await checks.nth(0).check(); assert.equal(await button.isDisabled(), true);
    await checks.nth(1).check(); assert.equal(await button.isEnabled(), true);
    await checks.nth(0).uncheck(); assert.equal(await button.isDisabled(), true);
    await checks.nth(0).check();
    await page.screenshot({ path: path.resolve("artifacts/tidesight-unlock-desktop.png"), fullPage: true });
    await button.click();
    await page.getByText("生产实盘已解锁。每个计划仍需通过风控与人工确认。", { exact: true }).waitFor();
    assert.deepEqual(requests, [{ acknowledgeRealFunds: true, acknowledgeNoWithdrawPermission: true }]);
    assert.equal(await checks.nth(0).isChecked(), false);
    assert.equal(await checks.nth(1).isChecked(), false);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2), false);
    await group.screenshot({ path: path.resolve("artifacts/tidesight-unlock-mobile.png") });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, fixtureOnly: true, agreementCheckboxes: 2, phraseInputs: 0, uncheckedSubmissionBlocked: true, requestBodies: requests, mobileOverflow: false, errors }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
