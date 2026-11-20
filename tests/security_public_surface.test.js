const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
function load(file, dependencies = {}, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, Response, Request, URL, Headers, AbortSignal, Buffer, console,
    process: { cwd: () => root }, ...globals,
    require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      throw new Error(`Unmocked dependency: ${name}`);
    }
  });
  return module.exports;
}

test('legacy downloads cannot bypass toolbox field privacy or publish new data files implicitly', async () => {
  const reads = [];
  const { serveLegacy } = load('lib/legacy-route.ts', {
    'node:path': path,
    'node:fs/promises': { readFile: async file => { reads.push(file); return Buffer.from('PUBLIC_SOURCE_SENTINEL'); } }
  });
  const request = new Request('https://site.example/legacy/data/file.json');
  for (const parts of [
    ['data', 'toolbox-enriched-data.json'], ['data', 'toolbox-sheet-data.json'],
    ['data', 'toolbox-web-research.json'], ['data', 'new-private-profile.json'],
    ['data', '.env.json'], ['data', 'subdir', 'bstock-localization.json'],
    ['assets', '..', 'data', 'toolbox-enriched-data.json'],
    ['assets', '.', 'private.json'], ['assets', '.hidden', 'private.json']
  ]) {
    assert.equal((await serveLegacy(request, parts)).status, 404, parts.join('/'));
  }
  assert.equal(reads.length, 0, 'private/unknown paths must be rejected before touching disk');
  for (const parts of [['data', 'bitcoin-cycle-weekly.js'], ['assets', 'welinkbtc-onchain-brand.png'], ['dashboard.js']]) {
    const response = await serveLegacy(request, parts);
    assert.equal(response.status, 200, parts.join('/'));
    assert.equal(await response.text(), 'PUBLIC_SOURCE_SENTINEL');
  }
  assert.equal(reads.length, 3);
});

test('recursive public source packaging rejects live profiles but retains templates and source modules', async () => {
  const { isPrivatePackagePath } = await import(pathToFileURL(path.join(root, 'scripts/package-source-policy.mjs')).href);
  for (const name of [
    'src/.env', 'src/.env.production', 'src/Data/cache.json', 'src/.runtime/checkpoint.json',
    'src/state/state.json', 'src/accounts.json', 'src/device.json', 'src/credentials.live.json',
    'src/private-key.json', 'src/keypair.json', 'src/trace.har', 'src/hedge.db-wal',
    'src/hedge.sqlite3', 'src/debug.log.1', 'src/key.pem', 'src/.npmrc', '../private.json',
    'src\\.env.local', 'src/secrets/value.txt'
  ]) assert.equal(isPrivatePackagePath(name), true, name);
  for (const name of [
    'engines/entropy/env.example', '.env.example', 'src/parallax_hedge/accounts.py',
    'src/credentials.ts', 'src/config.js', 'package-lock.json', 'public/index.html'
  ]) assert.equal(isPrivatePackagePath(name), false, name);
  for (const file of ['scripts/package-hedge-ops.mjs', 'scripts/package-grid-ops-engine.mjs', 'scripts/package-quant-runtime.mjs']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(source, /import \{ isPrivatePackagePath \} from '\.\/package-source-policy\.mjs'/, file);
    assert.match(source, /if \([^\n]*isPrivatePackagePath\([^\n]*\)\) continue;/, file);
  }
  assert.match(fs.readFileSync(path.join(root, 'scripts/package-hedge-ops.mjs'), 'utf8'), /'secret_redaction\.py'/, 'the downloadable engine includes its shared redaction module');
});

test('third-party contract proxies cannot follow redirects to another server or an internal address', async () => {
  const CSP = load('lib/external-embed-security.ts');
  for (const [file, paths, expectedCalls] of [
    ['app/contract-trading-assistant/api/[[...path]]/route.ts', ['api', 'quotes'], 1],
    ['app/contract-trading-assistant/embed/[[...path]]/route.ts', [], 4]
  ]) {
    let calls = 0;
    const { GET } = load(file, { '@/lib/external-embed-security': CSP }, { fetch: async (url, init) => {
      calls++;
      assert.equal(new URL(url).protocol, 'https:');
      assert.equal(init.redirect, 'error', 'the runtime must reject redirects before a second network request');
      assert.ok(init.signal instanceof AbortSignal, 'upstream requests must have a bounded lifetime');
      return new Response('<html><head></head><body></body></html>', { headers: { 'Content-Type': 'text/html' } });
    } });
    const request = new Request('https://site.example/contract-trading-assistant/embed/');
    request.nextUrl = new URL(request.url);
    const response = await GET(request, { params: Promise.resolve({ path: paths }) });
    assert.equal(response.status, 200);
    assert.equal(calls, expectedCalls);
    assert.ok(!response.headers.get('content-security-policy').split(';')[0].includes('allow-same-origin'));
  }
});

test('shared AlphaOps project fields remain text and cannot create script URLs or injected HTML', () => {
  const source = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
  const ast = ts.createSourceFile('script.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const names = new Set(['escapeHtml', 'alphaXHandle', 'alphaProjectInitials', 'alphaProjectHue', 'alphaProjectIcon', 'alphaSafeExternalUrl', 'renderAlphaProjectLibrary']);
  const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text)).map(node => node.getText(ast)).join('\n');
  const markup = '<img src=x onerror="SURFACE_SENTINEL">';
  const project = { id: 'fixture', name: markup, note: markup, status: markup, site: 'javascript:SURFACE_SENTINEL', x: 'data:text/html,SURFACE_SENTINEL', icon: 'data:text/html,SURFACE_SENTINEL' };
  const library = { innerHTML: '' }, ranking = { innerHTML: '' };
  const noop = () => {};
  const context = vm.createContext({
    URL, alphaProjectLibrary: library, alphaWalletInput: null,
    alphaTrackedProjects: [project], alphaManualMainProjects: [], alphaRemovedProjects: [],
    alphaRemovedItems: [project], alphaManualPendingProjects: [project], alphaBasePendingProjects: [],
    alphaHiddenPendingProjects: [], alphaProjectSearchQuery: '', alphaProjectSortMode: 'score', alphaProjectPage: 1,
    ALPHA_PROJECTS_PER_PAGE: 9, alphaCanManageProjects: true, alphaServerSyncStatus: 'idle', alphaServerSyncLabel: '',
    alphaFeedMode: 'x', alphaTutorials: [], alphaComments: [], alphaContentFeedSearch: '', alphaContentFeedSort: 'newest',
    alphaLatestXFeedItems: [{}], alphaFeedIntervalId: null, ALPHA_FEED_REFRESH_MS: 60_000,
    alphaProjectScore: () => ({ score: 50, priority: '观察跟进', components: { P: 50, G: 50, S: 50, C: 50, W: 50, K: 50, R: 5 }, reasons: [], missingTasks: [], riskTips: [] }),
    renderAlphaQuadrant: noop, sortAlphaProjects: projects => projects, alphaHeatFlames: () => 1, alphaContentCount: () => 0, renderActiveAlphaFeed: noop,
    document: { querySelector: selector => selector === '.rank-list' ? ranking : null, querySelectorAll: () => [] },
    window: { setInterval: () => 1, clearInterval: noop }
  });
  vm.runInContext(`${functions}\nrenderAlphaProjectLibrary();`, context);
  for (const html of [library.innerHTML, ranking.innerHTML]) {
    assert.ok(html.includes('&lt;img src=x onerror=&quot;SURFACE_SENTINEL&quot;&gt;'));
    assert.ok(!html.includes(markup), 'persisted text must not become a real HTML element');
    assert.doesNotMatch(html, /(?:href|src)="(?:javascript:|data:text\/html)/i);
  }
  assert.equal(vm.runInContext('alphaProjectIcon({ icon: "javascript:alert(1)" })', context), '');
  assert.equal(vm.runInContext('alphaProjectIcon({ icon: "data:image/png;base64,AAAA" })', context), 'data:image/png;base64,AAAA');
  assert.equal(vm.runInContext('alphaProjectIcon({ icon: "/assets/logo.png" })', context), '/assets/logo.png');
});
