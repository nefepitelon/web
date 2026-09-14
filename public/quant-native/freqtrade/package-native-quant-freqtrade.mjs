import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// This installer consumes the pinned official archives already present in the
// repository. Builds need no network and never read account or exchange secrets.
const root = fileURLToPath(new URL('../', import.meta.url));
const vendor = path.join(root, 'third-party/quant-ui/freqtrade');
const manifest = JSON.parse(await readFile(path.join(vendor, 'manifest.json'), 'utf8'));
const output = path.resolve(root, 'public/quant-native/freqtrade');
const allowedOutput = path.join(root, 'public', 'quant-native') + path.sep;
if (!output.startsWith(allowedOutput)) throw new Error('Native UI output is outside the allowed directory.');

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
async function verifiedArchive(name, hash) {
  const data = await readFile(path.join(vendor, name));
  if (sha256(data) !== hash) throw new Error(`Official archive integrity mismatch: ${name}`);
  return data;
}

// Small ZIP reader for two fixed, SHA-256-verified upstream archives. It does not
// follow symlinks or permit traversal, ZIP64, encrypted entries or other codecs.
function readZip(bytes) {
  let eocd = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) {
    if (bytes.readUInt32LE(at) === 0x06054b50) { eocd = at; break; }
  }
  if (eocd < 0 || bytes.readUInt16LE(eocd + 4) !== 0 || bytes.readUInt16LE(eocd + 6) !== 0) throw new Error('Unsupported ZIP archive.');
  const count = bytes.readUInt16LE(eocd + 10);
  let offset = bytes.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let index = 0; index < count; index++) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid ZIP central directory.');
    const flags = bytes.readUInt16LE(offset + 8), method = bytes.readUInt16LE(offset + 10);
    const packed = bytes.readUInt32LE(offset + 20), unpacked = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28), extraLength = bytes.readUInt16LE(offset + 30), commentLength = bytes.readUInt16LE(offset + 32);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    const attributes = bytes.readUInt32LE(offset + 38), local = bytes.readUInt32LE(offset + 42);
    offset += 46 + nameLength + extraLength + commentLength;
    if (flags & 1 || ![0, 8].includes(method) || unpacked > 16_000_000 || ((attributes >>> 16) & 0xf000) === 0xa000) throw new Error(`Unsupported ZIP entry: ${name}`);
    if (name.startsWith('/') || name.includes('\\') || name.includes(':') || name.split('/').includes('..')) throw new Error(`Unsafe ZIP entry: ${name}`);
    if (name.endsWith('/')) continue;
    if (bytes.readUInt32LE(local) !== 0x04034b50) throw new Error('Invalid ZIP local header.');
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const compressed = bytes.subarray(start, start + packed);
    const data = method === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: 16_000_000 });
    if (data.length !== unpacked || files.has(name)) throw new Error(`Invalid or duplicate ZIP content: ${name}`);
    files.set(name, data);
  }
  return files;
}
function replaceOnce(text, expected, replacement, description) {
  if (text.split(expected).length !== 2) throw new Error(`Pinned upstream ${description} does not match. Review the new release before packaging.`);
  return text.replace(expected, replacement);
}

const releaseBytes = await verifiedArchive(manifest.releaseArchive, manifest.releaseSha256);
const sourceBytes = await verifiedArchive(manifest.sourceArchive, manifest.sourceSha256);
const iconBytes = await verifiedArchive(manifest.icons.json, manifest.icons.jsonSha256);
const iconArchive = await verifiedArchive(manifest.icons.archive, manifest.icons.archiveSha256);
const lucideBytes = await verifiedArchive(manifest.lucide.json, manifest.lucide.jsonSha256);
const lucideArchive = await verifiedArchive(manifest.lucide.archive, manifest.lucide.archiveSha256);
const release = readZip(releaseBytes), source = readZip(sourceBytes);
const apiStart = 'function E(e,t){let n=c.create({baseURL:e.baseUrl.value,timeout:2e4,withCredentials:!0});';
const apiEnd = 'function ne(e,t){';
const files = [];
await mkdir(output, { recursive: true });
for (const [name, original] of release) {
  if (name === '_redirects') continue; // Next.js owns SPA fallback routing.
  let data = original;
  if (name === 'index.html') {
    let html = data.toString('utf8').replaceAll('"/assets/', `"${manifest.publicBase}assets/`).replace('href="/favicon.ico"', `href="${manifest.publicBase}favicon.ico"`);
    html = replaceOnce(html, `<script type="module" crossorigin src="${manifest.publicBase}${manifest.entryAsset}"></script>`, `<script type="module" src="${manifest.publicBase}host-integration.mjs"></script>`, 'entry script');
    html = html.replace('<title>FreqUI</title>', '<title>FreqUI 3.1.2 · WELINKBTC</title>');
    html = html.replace('<head>', `<head>\n  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'">\n  <link rel="stylesheet" href="${manifest.publicBase}host-integration.css">`);
    html = html.replace('<body >', `<body>\n  <aside class="welink-frequi-session-bar" aria-label="WelinkBTC native UI connection"><span id="welink-frequi-status" role="status">FreqUI 3.1.2 · 正在验证本站会话 / Verifying site session</span><nav><a href="/quant-suite/freqtrade/control" target="_top">控制台 / Controls</a><a href="${manifest.publicBase}NOTICE.txt" target="_blank" rel="noreferrer">License &amp; source</a></nav></aside>`);
    data = Buffer.from(html);
  } else if (name === manifest.entryAsset) {
    let script = data.toString('utf8');
    script = replaceOnce(script, 'history:at(`/`)', `history:at(\`${manifest.publicBase}\`)`, 'Vue Router base');
    script = replaceOnce(script, 'yE=function(e){return`/`+e}', `yE=function(e){return\`${manifest.publicBase}\`+e}`, 'Vite preload base');
    data = Buffer.from(script);
  } else if (name === manifest.apiAsset) {
    let script = data.toString('utf8').replaceAll('`ftAuthLoginInfo`', '`welink.frequi.auth`').replaceAll('`ftSelectedBot`', '`welink.frequi.selected`');
    const start = script.indexOf(apiStart), end = script.indexOf(apiEnd, start);
    if (start < 0 || end < 0 || script.indexOf(apiStart, start + 1) >= 0) throw new Error('Pinned upstream Axios auth adapter does not match.');
    // Keep FreqUI's native API callers and payloads, but use the authenticated
    // tenant BFF instead of storing passwords/JWTs or refreshing native tokens.
    const bridge = `${apiStart}return n.interceptors.request.use(async t=>{await window.welinkFreqUiRequest(t);return t},e=>Promise.reject(e)),n.interceptors.response.use(e=>{window.welinkFreqUiResponse(e);return e},e=>{window.welinkFreqUiError(e);if(e.response?.status===401||e.response?.status===403){let n=M();n.botStores[t]&&(n.botStores[t].setIsBotOnline(!1),n.botStores[t].isBotLoggedIn=!1)}else if(e.response?.status>=500||!e.response)M().botStores[t]?.setIsBotOnline(!1);return Promise.reject(e)}),{api:n}}`;
    script = script.slice(0, start) + bridge + script.slice(end);
    data = Buffer.from(script);
  } else if (name.endsWith('.css')) {
    data = Buffer.from(data.toString('utf8').replaceAll('url(/assets/', `url(${manifest.publicBase}assets/`));
  }
  const destination = path.resolve(output, name);
  if (!destination.startsWith(output + path.sep)) throw new Error('Output entry escaped its public root.');
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, data);
  files.push({ path: name, originalSha256: sha256(original), deployedSha256: sha256(data), adapted: !original.equals(data) });
}
const license = source.get(`frequi-${manifest.commit}/LICENSE`);
if (!license) throw new Error('The corresponding source LICENSE is missing.');
await writeFile(path.join(output, 'LICENSE'), license);
await writeFile(path.join(vendor, 'LICENSE'), license);
await writeFile(path.join(output, 'frequi-3.1.2-upstream-source.zip'), sourceBytes);
await mkdir(path.join(output, 'iconify'), { recursive: true });
await writeFile(path.join(output, 'iconify', 'mdi.json'), iconBytes);
await writeFile(path.join(output, manifest.icons.archive), iconArchive);
await writeFile(path.join(output, 'iconify', 'lucide.json'), lucideBytes);
await writeFile(path.join(output, manifest.lucide.archive), lucideArchive);
for (const name of ['MDI-LICENSE', 'MDI-APACHE-2.0.txt', 'mdi-info.json', 'LUCIDE-LICENSE', 'lucide-info.json']) {
  await copyFile(path.join(vendor, name), path.join(output, name));
}
await copyFile(path.join(vendor, 'host-integration.mjs'), path.join(output, 'host-integration.mjs'));
await copyFile(path.join(vendor, 'host-integration.css'), path.join(output, 'host-integration.css'));
await copyFile(path.join(vendor, 'NOTICE.txt'), path.join(output, 'NOTICE.txt'));
await copyFile(fileURLToPath(import.meta.url), path.join(output, 'package-native-quant-freqtrade.mjs'));
await writeFile(path.join(output, 'provenance.json'), JSON.stringify({ ...manifest, files }, null, 2) + '\n');
console.log(JSON.stringify({ ok: true, originalUi: 'FreqUI 3.1.2', assets: files.length, adaptedAssets: files.filter(file => file.adapted).map(file => file.path), output, sourcePublished: true }, null, 2));
