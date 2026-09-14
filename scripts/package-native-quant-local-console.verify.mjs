// Browser fixtures only. No external device registration, Docker installation,
// native engine or trading command is invoked by this verification.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createLocalConsole } from '../quant-runtime/bin/local-console.mjs';
import { approvedConfigHash, ENGINES } from '../quant-runtime/lib/validation.mjs';
import { paths, writeJson } from '../quant-runtime/lib/storage.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.QUANT_PLAYWRIGHT_PATH || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'welink-console-browser-fixture-'));
const artifactRoot = path.join(root, 'artifacts/quant-local-console'); await mkdir(artifactRoot, {recursive: true});
const pairing = {schemaVersion: 1, baseUrl: 'https://ai.welinkbtc.xyz', workerId: 'fixture-browser-worker', userId: 'fixture_browser_user_001', token: 'fixture_only_never_use_real_device_token_1234567890'};
const calls = [];
const config = {name: '浏览器验证配置', mode: 'paper', exchange: 'binance', symbols: ['BTC/USDT'], timeframe: '1h', strategy: 'default', stakeAmount: 100, maxOpenTrades: 2, stopLossPct: 2};
const freqBase = paths(stateRoot, pairing.userId, 'freqtrade').base;
await writeJson(path.join(freqBase, 'local-install.json'), {status: 'ui-ready', uiUrl: 'http://127.0.0.1:8791/', message: 'FIXTURE ONLY'});
await writeJson(path.join(freqBase, 'native', 'credentials.json'), {username: 'welink', password: 'fixture-local-login-only', jwtSecret: 'fixture-secret-never-exposed'});
const app = createLocalConsole({root: stateRoot, port: 0, commandRunner: async (_binary, args) => args[0] === 'info' ? '{"OSType":"linux"}' : 'Fixture Docker — no process started', installer: async args => { calls.push(args); return {ok: true, engine: args[1], status: 'installed', message: 'FIXTURE: 安装流程验证，未调用 Docker。'}; }, workerFactory: options => ({gateway: options.gateway, allowLive: options.allowLive, assignments: [], stopped: false, api: async () => ({ok: true}), async tick() { await this.api(); this.assignments = ENGINES.map(engine => ({engine, userId: pairing.userId, revision: 1, configHash: approvedConfigHash(config), config})); }, async run() { await this.tick(); while (!this.stopped) await new Promise(resolve => setTimeout(resolve, 10)); }, stop() {this.stopped = true;}})});
const address = await app.listen(), origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({headless: true, executablePath: process.env.QUANT_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
const page = await browser.newPage({viewport: {width: 1440, height: 1100}}), errors = [], external = [];
page.on('pageerror', error => errors.push(error.message)); page.on('request', request => {if (!request.url().startsWith(origin)) external.push(request.url());});
try {
  // A user-clicked website link must reach the real loopback HTTP server even
  // though Chromium marks that new top-level document as cross-site.
  const navigations = [];
  const captureNavigation = request => {if (request.headers['sec-fetch-site'] === 'cross-site') navigations.push({url: request.url, mode: request.headers['sec-fetch-mode'], dest: request.headers['sec-fetch-dest'], user: request.headers['sec-fetch-user']});};
  app.server.on('request', captureNavigation);
  const website = await browser.newPage();
  await website.route('https://quant-website-fixture.invalid/', route => route.fulfill({contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="UTF-8"></head><body><a href="${origin}/" target="_blank" rel="noopener noreferrer">打开本地控制台</a></body></html>`}));
  await website.goto('https://quant-website-fixture.invalid/');
  const popupReady = website.context().waitForEvent('page'); await website.getByRole('link', {name: '打开本地控制台'}).click(); const popup = await popupReady;
  await popup.locator('.engine-card').nth(5).waitFor();
  assert.equal(popup.url(), `${origin}/`);
  assert.ok(navigations.some(item => item.url === '/' && item.mode === 'navigate' && item.dest === 'document' && item.user === '?1'));
  await popup.close(); await website.close(); app.server.off('request', captureNavigation);
  await page.goto(origin); await page.locator('.engine-card').nth(5).waitFor();
  assert.equal(await page.locator('.engine-card').count(), 6);
  assert.equal(await page.locator('#connect').isDisabled(), true);
  await page.fill('#pairing', JSON.stringify(pairing)); await page.locator('#pair-form button').click();
  await page.getByText('设备配对已保存。点击「连接网站」开始同步。').waitFor();
  assert.equal(await page.locator('#pairing').inputValue(), ''); assert.equal(await page.locator('#pairing').isVisible(), false);
  assert.equal(await page.evaluate(() => Object.keys(localStorage).length), 0);
  await page.locator('#connect').click(); await page.getByText('已连接网站', {exact: true}).waitFor();
  await page.locator('#diagnostics').click(); await page.getByText('Linux 引擎可用', {exact: true}).waitFor();
  await page.locator('.freqtrade button').first().click(); await page.getByText('FIXTURE: 安装流程验证，未调用 Docker。', {exact: true}).waitFor();
  assert.equal(calls.length, 1);
  await page.getByRole('button', {name: '查看本机登录', exact: true}).click(); await page.locator('#credentials-dialog').waitFor();
  assert.match(await page.locator('#credentials-value').innerText(), /fixture-local-login-only/); assert.equal((await page.locator('body').innerText()).includes('fixture-secret-never-exposed'), false);
  await page.locator('#credentials-close').click(); assert.equal(await page.locator('#credentials-value').textContent(), '');
  page.once('dialog', dialog => dialog.dismiss()); await page.locator('#live-toggle').click(); assert.equal(await page.locator('#live-status').textContent(), '实盘执行已锁定');
  page.once('dialog', dialog => dialog.accept('ENABLE LOCAL LIVE')); await page.locator('#live-toggle').click(); await page.getByText('本次会话实盘执行已解锁', {exact: true}).waitFor();
  await page.locator('#live-toggle').click(); await page.getByText('实盘执行已锁定', {exact: true}).waitFor();
  assert.equal((await page.locator('body').innerText()).includes(pairing.token), false);
  await page.screenshot({path: path.join(artifactRoot, 'local-console-desktop-fixture.png'), fullPage: true});
  await page.setViewportSize({width: 390, height: 844}); await page.screenshot({path: path.join(artifactRoot, 'local-console-mobile-fixture.png'), fullPage: true});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
  await page.locator('#disconnect').click(); await page.getByText('尚未连接', {exact: true}).waitFor();
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log(JSON.stringify({ok: true, fixtureOnly: true, originalEngineCommands: 0, websiteLinkToLoopback: true, sixEngines: true, pairingHidden: true, nativeInstallFixture: true, liveConfirmCancelAndUnlock: true, responsive: true, noExternalRequests: true, noPageErrors: true, artifactRoot}, null, 2));
} finally {
  await browser.close(); await app.close();
  assert.equal(path.dirname(stateRoot), os.tmpdir()); assert.ok(path.basename(stateRoot).startsWith('welink-console-browser-fixture-')); await rm(stateRoot, {recursive: true, force: true});
}
