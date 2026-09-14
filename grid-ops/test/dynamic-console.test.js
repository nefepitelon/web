import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const dashboardPath = path.resolve(testDirectory, '..', 'public', 'index.html');

test('manifest-cloned consoles preserve the shared mode-btn class', async () => {
  const html = await readFile(dashboardPath, 'utf8');
  assert.match(html, /function cloneExchangeTemplate\(/);
  assert.match(html, /if \(attribute\.name === 'class'\) continue/);
  assert.doesNotMatch(html, /let html = source\.outerHTML\s*\.replaceAll\('tab-de'/);
});

test('primary navigation stays focused while exchange consoles live in the responsive sidebar', async () => {
  const html = await readFile(dashboardPath, 'utf8');
  const primaryNav = html.slice(html.indexOf('<nav class="main-tabs"'), html.indexOf('</nav>', html.indexOf('<nav class="main-tabs"')));
  const exchangeSidebar = html.slice(html.indexOf('<aside class="exchange-sidebar"'), html.indexOf('</aside>', html.indexOf('<aside class="exchange-sidebar"')));

  for (const label of ['总览', 'AI助手', '环境设置', 'IP配置']) assert.match(primaryNav, new RegExp(label));
  for (const label of ['Decibel', 'Extended', 'RISEx']) assert.doesNotMatch(primaryNav, new RegExp(label));
  assert.ok(primaryNav.indexOf('IP配置') < primaryNav.indexOf('overview-filter-mode'));
  assert.ok(primaryNav.indexOf('overview-filter-mode') < primaryNav.indexOf('guide-trigger'));
  assert.ok(primaryNav.indexOf('guide-trigger') < primaryNav.indexOf('startup-trigger'));
  assert.match(exchangeSidebar, /id="exchange-tabs"/);
  assert.match(exchangeSidebar, /交易所控制台/);
  assert.match(exchangeSidebar, /Decibel/);
  assert.match(exchangeSidebar, /Extended/);
  assert.match(exchangeSidebar, /RISEx/);
  assert.match(html, /\.workspace-shell\s*\{[\s\S]*?grid-template-columns:var\(--ops-sidebar-width\) minmax\(0,1fr\)/);
  assert.match(html, /@media \(max-width:1180px\)\s*\{[\s\S]*?\.exchange-sidebar\s*\{[\s\S]*?overflow-x:auto/);
  assert.match(html, /const exchangeTabs = \$\('exchange-tabs'\)/);
  assert.match(html, /exchangeTabs\.appendChild\(button\)/);
  assert.match(html, /exchangeTabs\.appendChild\(tab\)/);
});

test('smart sizing prefers equity and honors minimum notional at the venue size increment', async () => {
  const html = await readFile(dashboardPath, 'utf8');
  assert.match(html, /const equity = Number\(lastState\?\.equity\)/);
  assert.match(html, /Number\.isFinite\(equity\) && equity > 0[\s\S]*?Number\.isFinite\(balance\) && balance > 0/);
  assert.match(html, /mkt\.sizeIncrement \|\| mkt\.stepSize/);
  assert.match(html, /Math\.ceil\(\(minNotional \/ price\) \/ step - 1e-10\) \* step/);
  assert.match(html, /Math\.max\(Number\(mkt\.minOrderSize\) \|\| step, notionalFloorSize\)/);
});

test('switching markets clears the previous range and rebuilds it from the new live quote', async () => {
  const html = await readFile(dashboardPath, 'utf8');
  assert.match(html, /P\('market'\)\.onchange = async \(\) =>/);
  assert.match(html, /P\('lower'\)\.value = ''[\s\S]*?P\('upper'\)\.value = ''[\s\S]*?await refreshTrend\(\)/);
  assert.match(html, /await refreshTrend\(\)[\s\S]*?if \(curTrend\?\.price\) autoSizePerGrid/);
});

test('market trend refreshes discard stale responses and clear failed analysis', async () => {
  const html = await readFile(dashboardPath, 'utf8');
  assert.match(html, /let trendRequestSeq = 0/);
  assert.match(html, /trendAbortController\?\.abort\(\)/);
  assert.match(html, /signal:controller\.signal/);
  assert.match(html, /requestSeq !== trendRequestSeq \|\| String\(P\('market'\)\.value\) !== String\(marketId\)/);
  assert.match(html, /catch \(e\) \{[\s\S]*?curTrend = null;[\s\S]*?curTrendMarketId = null/);
});

test('sizing and chart overlays never reuse state from another market', async () => {
  const html = await readFile(dashboardPath, 'utf8');
  assert.match(html, /String\(lastState\.config\.marketId\) === selectedMarketId/);
  assert.match(html, /trendMatchesSelection = curTrendMarketId === selectedMarketId/);
  assert.match(html, /String\(s\.config\.marketId\) !== String\(P\('market'\)\.value\)/);
});

test('a running bot pins and locks its configured market selector', async () => {
  const html = await readFile(dashboardPath, 'utf8');
  assert.match(html, /if \(run && s\.config\?\.marketId != null\)/);
  assert.match(html, /P\('market'\)\.value = runningMarketId/);
  assert.match(html, /P\('market'\)\.disabled = run/);
});

test('manifest consoles expose Arcus and keep unsupported Entropy live mode disabled', async () => {
  const html = await readFile(dashboardPath, 'utf8');
  assert.match(html, /key:'ar'[\s\S]*?name:'Arcus'/);
  assert.match(html, /key:'en'[\s\S]*?name:'Entropy'[\s\S]*?liveAvailable:false/);
  assert.match(html, /definition\.liveAvailable === false[\s\S]*?live 暂未开放/);
  assert.match(html, /LIVE 不可用/);
});
