// Real QuantDeviceManager component; all account/device API and clipboard calls
// are isolated fixtures. No real device is registered/revoked and no OS clipboard
// or external application is touched.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {build} = require('esbuild');
const {chromium} = require(process.env.QUANT_PLAYWRIGHT_PATH || 'playwright');
(async () => {
  const compiled = await build({stdin: {contents: `import {createRoot} from 'react-dom/client'; import {QuantDeviceManager} from './components/quant-device-manager'; import './app/globals.css'; createRoot(document.getElementById('root')).render(<QuantDeviceManager canOperate={!location.search.includes('guest')}/>);`, resolveDir: process.cwd(), loader: 'tsx'}, bundle: true, write: false, outfile: 'fixture.js', jsx: 'automatic', define: {'process.env.NODE_ENV': '"production"'}, plugins: [{name: 'device-fixture', setup(b) {b.onLoad({filter: /\.module\.css$/}, args => ({contents: fs.readFileSync(args.path, 'utf8'), loader: 'local-css'})); b.onResolve({filter: /^next\/link$/}, args => ({path: args.path, namespace: 'fixture'})); b.onLoad({filter: /.*/, namespace: 'fixture'}, () => ({contents: "import{createElement}from'react';export default function Link({prefetch,...props}){return createElement('a',props)}", loader: 'js', resolveDir: process.cwd()}));}}]});
  const js = compiled.outputFiles.find(file => file.path.endsWith('.js')).text, css = compiled.outputFiles.find(file => file.path.endsWith('.css')).text;
  const browser = await chromium.launch({headless: true, executablePath: process.env.QUANT_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  const context = await browser.newContext({viewport: {width: 1440, height: 1100}});
  await context.addInitScript(() => {window.__fixtureClipboard = ''; window.__fixtureClipboardDenied = false; Object.defineProperty(navigator, 'clipboard', {value: {writeText: async text => {if (window.__fixtureClipboardDenied) throw new Error('Fixture clipboard denied'); window.__fixtureClipboard = text;}}, configurable: true});});
  let devices = [], createCount = 0, getCount = 0, rejectGet = false, rejectPost = false, rejectDelete = false, holdPost = false, releasePost;
  const created = [], revoked = [], errors = [], external = [], expectedHttpErrors = [];
  const token = 'FIXTURE_DEVICE_TOKEN_NEVER_REAL_01234567890123456789';
  const artifactRoot = path.resolve('artifacts/quant-devices-ui-fixtures'); fs.mkdirSync(artifactRoot, {recursive: true});
  async function install(page) {
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== 'https://quant-device-fixture.invalid') {external.push(request.url()); return route.fulfill({status: 403, body: 'Isolated fixture'});}
      const json = (status, value) => route.fulfill({status, contentType: 'application/json', body: JSON.stringify(value)});
      if (url.pathname === '/fixture.js') return route.fulfill({contentType: 'text/javascript', body: js});
      if (url.pathname === '/fixture.css') return route.fulfill({contentType: 'text/css', body: css});
      if (url.pathname === '/api/quant-suite/devices') {
        if (request.method() === 'GET') {getCount++; if (rejectGet) {rejectGet = false; expectedHttpErrors.push('refresh'); return json(503, {message: 'FIXTURE: device refresh unavailable'});} return json(200, {ok: true, devices});}
        if (request.method() === 'POST') {
          const body = request.postDataJSON(); created.push(body); if (holdPost) await new Promise(resolve => {releasePost = resolve;});
          if (rejectPost) {rejectPost = false; expectedHttpErrors.push('pair'); return json(409, {message: 'FIXTURE: engine already assigned'});}
          createCount++; devices = [{id: `fixture-${createCount}`, name: body.name, engines: body.engines, createdAt: '2026-09-06T00:00:00Z', online: false}];
          return json(201, {ok: true, pairing: {schemaVersion: 1, baseUrl: 'https://ai.welinkbtc.xyz', workerId: devices[0].id, userId: 'fixture-only-user', token}});
        }
        if (request.method() === 'DELETE') {const body = request.postDataJSON(); revoked.push(body); if (rejectDelete) {rejectDelete = false; expectedHttpErrors.push('revoke'); return json(503, {message: 'FIXTURE: revoke unavailable'});} devices = devices.map(device => ({...device, revokedAt: '2026-09-06T01:00:00Z', online: false})); return json(200, {ok: true});}
      }
      if (url.pathname.startsWith('/api/')) {errors.push('Unexpected API'); return json(404, {});}
      return route.fulfill({contentType: 'text/html', body: '<!doctype html><html lang="en" data-language="en" data-theme="dark"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'});
    });
  }
  try {
    const page = await context.newPage(); await install(page);
    await page.goto('https://quant-device-fixture.invalid/quant-suite/devices'); await page.getByRole('heading', {name: 'Local trading worker'}).waitFor();
    assert.equal(await page.locator('main').getAttribute('data-native-i18n'), 'react');
    const checkboxes = page.getByRole('checkbox'); assert.equal(await checkboxes.count(), 6);
    for (let index = 0; index < 6; index++) await checkboxes.nth(index).uncheck();
    const generate = page.getByRole('button', {name: 'Generate pairing information', exact: true}); assert.equal(await generate.isDisabled(), true);
    await page.getByRole('checkbox', {name: 'Freqtrade', exact: true}).check(); await page.getByLabel('Device name', {exact: true}).fill('Fixture desktop');
    holdPost = true; await generate.click(); await page.getByRole('button', {name: 'Working…'}).waitFor(); assert.equal(await page.getByLabel('Device name', {exact: true}).isDisabled(), true);
    while (!releasePost) await page.waitForTimeout(10); holdPost = false; releasePost();
    const pairing = page.getByRole('textbox', {name: 'Device pairing information', exact: true}); await pairing.waitFor();
    assert.deepEqual(created[0], {name: 'Fixture desktop', engines: ['freqtrade']}); assert.equal(JSON.parse(await pairing.inputValue()).token, token);
    assert.deepEqual(await page.evaluate(() => ({local: Object.keys(localStorage), session: Object.keys(sessionStorage)})), {local: [], session: []});
    await page.getByRole('button', {name: 'Copy pairing', exact: true}).click(); await page.getByRole('button', {name: 'Copied', exact: true}).waitFor(); assert.equal(JSON.parse(await page.evaluate(() => window.__fixtureClipboard)).token, token);
    await page.getByRole('button', {name: 'Done, hide', exact: true}).click(); assert.equal(await pairing.count(), 0); assert.equal((await page.locator('body').innerText()).includes(token), false);
    await page.reload(); await page.getByRole('heading', {name: 'Local trading worker'}).waitFor(); assert.equal(await pairing.count(), 0);
    page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', {name: 'Revoke pairing', exact: true}).click(); assert.equal(revoked.length, 0);
    rejectDelete = true; page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', {name: 'Revoke pairing', exact: true}).click(); await page.getByRole('alert').filter({hasText: 'FIXTURE: revoke unavailable'}).waitFor(); assert.equal(await page.getByRole('button', {name: 'Revoke pairing', exact: true}).count(), 1);
    page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', {name: 'Revoke pairing', exact: true}).click(); await page.getByText('Revoked', {exact: true}).waitFor(); assert.deepEqual(revoked.at(-1), {deviceId: 'fixture-1'});
    rejectGet = true; await page.getByRole('button', {name: 'Refresh devices', exact: true}).click(); await page.getByRole('alert').filter({hasText: 'FIXTURE: device refresh unavailable'}).waitFor();
    devices.push({id: 'fixture-reconnected', name: 'Fixture heartbeat', engines: ['lean'], createdAt: '2026-09-06T00:00:00Z', lastSeenAt: '2026-09-06T01:01:00Z', online: true});
    await page.getByRole('button', {name: 'Refresh devices', exact: true}).click(); await page.getByText('Fixture heartbeat', {exact: true}).waitFor(); await page.getByText('Online', {exact: true}).waitFor();
    rejectPost = true; await generate.click(); await page.getByRole('alert').filter({hasText: 'FIXTURE: engine already assigned'}).waitFor(); assert.equal(await pairing.count(), 0);
    await generate.click(); await pairing.waitFor(); await page.evaluate(() => {window.__fixtureClipboardDenied = true;}); await page.getByRole('button', {name: 'Copy pairing', exact: true}).click(); await page.getByRole('alert').filter({hasText: 'Copy the pairing information from the text field.'}).waitFor();
    await page.getByRole('button', {name: 'Done, hide', exact: true}).click();
    for (const language of ['en', 'zh']) {await page.evaluate(language => {document.documentElement.dataset.language = language;}, language); await page.screenshot({path: path.join(artifactRoot, `devices-desktop-${language}.png`), fullPage: true}); await page.setViewportSize({width: 390, height: 844}); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false); await page.screenshot({path: path.join(artifactRoot, `devices-mobile-${language}.png`), fullPage: true}); await page.setViewportSize({width: 1440, height: 1100});}
    const getsBeforeGuest = getCount; await page.goto('https://quant-device-fixture.invalid/quant-suite/devices?guest'); await page.getByRole('link', {name: 'Sign in', exact: true}).waitFor(); assert.equal(getCount, getsBeforeGuest); assert.equal(await page.getByRole('button', {name: 'Refresh devices', exact: true}).isDisabled(), true); assert.equal(await page.getByRole('checkbox').count(), 0);
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    console.log(JSON.stringify({ok: true, fixtureOnly: true, component: 'QuantDeviceManager', realDeviceMutations: 0, scopedPairing: true, pendingProtected: true, noCredentialPersistence: true, clipboardFixtureOnly: true, dismissAndReloadHideCredential: true, revokeCancelAndConfirm: true, refreshAndFailureFeedback: true, pairAndClipboardErrors: true, guestNoApi: true, responsiveLanguages: ['en', 'zh'], expectedFixtureFailures: expectedHttpErrors, artifactRoot}, null, 2));
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
