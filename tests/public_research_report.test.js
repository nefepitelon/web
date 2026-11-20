const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function load(file, dependencies = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, Response, URL, AbortSignal, Buffer,
    require: name => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name)
  });
  return module.exports;
}
const security = load('lib/trading-proxy-security.ts');
function fixture({ addresses = [{ address: '8.8.8.8', family: 4 }], status = 200, chunks = [Buffer.from('# 公开研究报告')], fail = false } = {}) {
  const events = { requests: 0, lookups: 0, dispatchers: [], bodyReads: 0, bodyDestroyed: false };
  class Agent {
    constructor(options) { this.options = options; events.dispatchers.push(this); }
    async destroy() { this.destroyed = true; }
  }
  const lookup = security.createPublicProxyLookup((hostname, options, callback) => {
    events.lookups++;
    assert.equal(options.all, true);
    callback(null, addresses);
  });
  const transport = async (url, options) => {
    events.requests++;
    assert.equal(options.maxRedirections, 0);
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.headersTimeout, 15_000);
    assert.equal(options.bodyTimeout, 15_000);
    assert.equal(options.headers['Accept-Encoding'], 'identity');
    assert.equal(options.dispatcher.options.maxResponseSize, 1024 * 1024);
    // Exercise the same lookup passed to the actual connector, not a separate preflight.
    await new Promise((resolve, reject) => options.dispatcher.options.connect.lookup(url.hostname, {}, (error, address) => error ? reject(error) : resolve(address)));
    if (fail) throw new Error('signed_url=PRIVATE_SENTINEL');
    const body = {
      async *[Symbol.asyncIterator]() { for (const chunk of chunks) { events.bodyReads++; yield chunk; } },
      destroy() { events.bodyDestroyed = true; }
    };
    return { statusCode: status, body };
  };
  const { createPublicResearchReportDownloader } = load('lib/public-research-report.ts', {
    'server-only': {}, undici: { Agent, request: transport }, '@/lib/trading-proxy-security': security
  });
  return { events, download: createPublicResearchReportDownloader({ lookup, transport }) };
}

test('research report download rejects unsafe protocols, credentials, ports and private address literals before transport', async () => {
  const { download, events } = fixture();
  for (const url of [
    'http://public.example/report.md', 'file:///etc/passwd', 'https://user:pass@public.example/report.md',
    'https://public.example:8443/report.md', 'https://localhost./report.md',
    'https://127.1/report.md', 'https://2130706433/report.md', 'https://169.254.169.254/report.md',
    'https://[::1]/report.md', 'https://[::ffff:127.0.0.1]/report.md', 'https://[fd00::1]/report.md',
    'https://service.internal/report.md'
  ]) await assert.rejects(download(url));
  assert.equal(events.requests, 0);
  assert.equal(events.dispatchers.length, 0);
});

test('research report connector rejects private DNS and mixed public/private answers without reading a body', async () => {
  for (const addresses of [
    [{ address: '127.0.0.1', family: 4 }],
    [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }],
    [{ address: '::ffff:169.254.169.254', family: 6 }]
  ]) {
    const { download, events } = fixture({ addresses });
    await assert.rejects(download('https://cdn.public.example/report.md'), /安全限制/);
    assert.equal(events.lookups, 1, 'actual connection uses a single checked DNS lookup');
    assert.equal(events.bodyReads, 0);
    assert.ok(events.dispatchers[0].destroyed);
  }
});

test('public HTTPS object storage remains supported while redirects cannot send a second request', async () => {
  const allowed = fixture();
  const response = await allowed.download('https://objects.public.example/report.md?signature=fixture');
  assert.equal(await response.text(), '# 公开研究报告');
  assert.ok(allowed.events.bodyDestroyed);
  assert.ok(allowed.events.dispatchers[0].destroyed);
  const redirect = fixture({ status: 302 });
  assert.equal((await redirect.download('https://objects.public.example/report.md')).status, 302);
  assert.equal(redirect.events.requests, 1);
  assert.equal(redirect.events.bodyReads, 0);
  assert.ok(redirect.events.bodyDestroyed);
});

test('research download is bounded while streaming and never echoes signed URLs or transport diagnostics', async () => {
  const large = fixture({ chunks: [Buffer.alloc(1024 * 1024), Buffer.alloc(1), Buffer.alloc(1)] });
  await assert.rejects(large.download('https://objects.public.example/report.md'), /安全限制/);
  assert.equal(large.events.bodyReads, 2, 'stop before reading the remaining payload');
  assert.ok(large.events.bodyDestroyed);
  assert.ok(large.events.dispatchers[0].destroyed);
  const failed = fixture({ fail: true });
  await assert.rejects(failed.download('https://objects.public.example/report.md?signature=PRIVATE_SENTINEL'), error => !error.message.includes('PRIVATE_SENTINEL'));
});

test('both report ingestion routes use the same bounded public downloader', () => {
  for (const file of ['app/api/bstock-alpha/research/job/route.ts', 'app/api/bstock-alpha/research/batch-ingest/route.ts']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(source, /await fetchPublicResearchReport\(resolvedDownloadUrl\)/);
    assert.doesNotMatch(source, /await fetch\(downloadUrl/);
    assert.equal((source.match(/redirect: "error"/g) || []).length, 2, 'job-token polling/resume must not forward the custom credential header across redirects');
  }
});
