// Tests the actual, self-hosted upstream production modules. API responses are
// intentionally isolated fixtures; no exchange, user account or real BFF is used.
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.QUANT_PLAYWRIGHT_PATH || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = path.join(root, 'public/quant-native/freqtrade');
const screenshotRoot = path.join(root, 'artifacts/quant-native-freqtrade');
await mkdir(screenshotRoot, { recursive: true });
const requests = [], mutations = [], missingAssets = [];
let authenticatedFixture = true;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  requests.push(url.pathname);
  if (url.pathname === '/api/quant-suite') {
    res.writeHead(authenticatedFixture ? 200 : 401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: authenticatedFixture, canOperate: authenticatedFixture, configured: false, instances: [], audits: [] }));
  }
  if (url.pathname.startsWith('/api/quant-suite/native/freqtrade/')) {
    if (req.method !== 'GET') mutations.push({ method: req.method, path: url.pathname, requestId: req.headers['x-quant-request-id'], confirmation: req.headers['x-quant-confirmation'] });
    res.writeHead(503, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: 'FIXTURE: native runtime is intentionally disconnected', detail: 'FIXTURE: native runtime is intentionally disconnected' }));
  }
  if (!url.pathname.startsWith('/quant-native/freqtrade/')) { res.writeHead(404); return res.end('Not found'); }
  const relative = decodeURIComponent(url.pathname.slice('/quant-native/freqtrade/'.length));
  const candidate = path.resolve(publicRoot, relative || 'index.html');
  if (!candidate.startsWith(publicRoot + path.sep) && candidate !== publicRoot) { res.writeHead(403); return res.end(); }
  let target = candidate;
  try { const info = await stat(target); if (info.isDirectory()) target = path.join(target, 'index.html'); }
  catch {
    if (path.extname(relative)) { missingAssets.push(relative); res.writeHead(404); return res.end('Missing asset'); }
    target = path.join(publicRoot, 'index.html');
  }
  try {
    const data = await readFile(target);
    const types = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.zip': 'application/zip', '.txt': 'text/plain' };
    res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' }); res.end(data);
  } catch { res.writeHead(500); res.end('Static fixture server error'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.QUANT_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [], cspViolations = [], externalRequests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (!request.url().startsWith(origin) && !request.url().startsWith('data:')) externalRequests.push(request.url()); });
await page.addInitScript(() => {
  localStorage.setItem('welinkbtc-language', 'en');
  document.addEventListener('securitypolicyviolation', event => { (window.__cspViolations ||= []).push({ uri: event.blockedURI, directive: event.violatedDirective }); });
});
try {
  await page.goto(`${origin}/quant-native/freqtrade/index.html`, { waitUntil: 'networkidle' });
  await page.locator('#welink-frequi-status').filter({ hasText: 'native API is not connected' }).waitFor();
  await page.waitForTimeout(600);
  assert.match(await page.title(), /freqUI|FreqUI/, 'The upstream dynamic document title was not applied.');
  assert.ok(await page.locator('header').count(), 'Original FreqUI header did not mount.');
  const text = await page.locator('body').innerText();
  assert.match(text, /FreqUI|Freqtrade/);
  assert.equal(page.url(), `${origin}/quant-native/freqtrade/`);
  await page.screenshot({ path: path.join(screenshotRoot, 'original-frequi-3.1.2-desktop-offline.png'), fullPage: true });
  const links = await page.locator('#app a').evaluateAll(nodes => nodes.map(node => ({ text: node.textContent?.trim(), href: node.getAttribute('href') })));
  const settings = page.locator('#app a[href="/quant-native/freqtrade/settings"]').first();
  if (await settings.count()) await settings.click();
  else await page.goto(`${origin}/quant-native/freqtrade/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(screenshotRoot, 'original-frequi-3.1.2-settings.png'), fullPage: true });
  assert.equal(await page.locator('input[type="password"]:visible').count(), 0, 'Native credential prompts must not be exposed in the managed host.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/quant-native/freqtrade/`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(screenshotRoot, 'original-frequi-3.1.2-mobile-offline.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, 'Native UI overflowed its mobile viewport.');
  // Exercise the actual request adapter without sending any real command.
  page.once('dialog', dialog => dialog.dismiss());
  const canceled = await page.evaluate(async () => {
    try { await window.welinkFreqUiRequest({ baseURL: `${location.origin}/api/quant-suite/native/freqtrade/api/v1`, url: '/start', method: 'post', headers: new Headers() }); return false; }
    catch { return true; }
  });
  assert.equal(canceled, true);
  const rejectedExternal = await page.evaluate(async () => {
    try { await window.welinkFreqUiRequest({ baseURL: 'https://example.com/api/v1', url: '/ping', method: 'get', headers: new Headers() }); return false; }
    catch { return true; }
  });
  assert.equal(rejectedExternal, true);
  const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('welink.frequi.auth')));
  assert.equal(auth['welink.freqtrade'].accessToken, '');
  assert.equal(auth['welink.freqtrade'].refreshToken, '');
  authenticatedFixture = false;
  const guestRequestStart = requests.length;
  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.goto(`${origin}/quant-native/freqtrade/`, { waitUntil: 'networkidle' });
  await page.locator('#app header').waitFor();
  assert.match(await page.locator('#app').first().innerText(), /Welcome to the Freqtrade/);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('welink.frequi.auth'))), {});
  assert.deepEqual(requests.slice(guestRequestStart).filter(item => item.startsWith('/api/quant-suite/native/')), []);
  await page.screenshot({ path: path.join(screenshotRoot, 'original-frequi-3.1.2-guest.png'), fullPage: true });
  assert.deepEqual(mutations, [], 'The native UI test must not submit trading mutations.');
  cspViolations.push(...await page.evaluate(() => window.__cspViolations || []));
  assert.deepEqual(missingAssets, []);
  assert.deepEqual(externalRequests, []);
  assert.deepEqual(cspViolations, []);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, originalUi: 'FreqUI 3.1.2', fixtureOnly: true, apiDisconnected: true, staticAssetsLoaded: [...new Set(requests.filter(item => item.includes('/assets/')))].length, noExternalRequests: true, noNativeCredentials: true, noTradingMutations: true, noMissingAssets: true, noPageErrors: true, links, screenshotRoot }, null, 2));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
