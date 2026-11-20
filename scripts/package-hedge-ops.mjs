import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import archiver from 'archiver';
import { isPrivatePackagePath } from './package-source-policy.mjs';
const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'hedge-ops');
const release = JSON.parse(await fs.readFile(path.join(source, 'release.json'), 'utf8')).version;
if (!/^\d+\.\d+\.\d+$/.test(release)) throw new Error('Invalid Hedge Ops release version');
const downloads = path.join(root, 'public', 'downloads');
await fs.mkdir(downloads, { recursive: true });
const launcherName = `一键启动文件(${release}).bat`;
const launcher = (await fs.readFile(path.join(downloads, '启动套利对冲Ops.bat'), 'utf8'))
  .replace(/^title .*$/m, `title WeLinkBTC Hedge Ops ${release} - Local Engine`)
  .replace(/^set "HEDGE_REQUESTED_RELEASE=.*"\r?\n/gm, '')
  .replace(/^setlocal EnableExtensions\r?\n/m, `setlocal EnableExtensions\r\nset "HEDGE_REQUESTED_RELEASE=${release}"\r\n`);
await fs.writeFile(path.join(downloads, launcherName), launcher.replace(/\r?\n/g, '\r\n'));
const target = path.join(downloads, 'hedge-ops-engine.zip');
const output = createWriteStream(target);
const archive = archiver('zip', { zlib: { level: 9 } });
const complete = new Promise((resolve, reject) => { output.on('close', resolve); archive.on('error', reject); output.on('error', reject); });
const ignoredPythonDirectories = new Set(['__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.venv']);
const appendTree = async (directory, prefix) => {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (ignoredPythonDirectories.has(entry.name) || entry.name.endsWith('.pyc')) continue;
    const absolutePath = path.join(directory, entry.name);
    const archivePath = path.posix.join(prefix, entry.name);
    if (entry.isSymbolicLink() || isPrivatePackagePath(archivePath)) continue;
    if (entry.isDirectory()) await appendTree(absolutePath, archivePath);
    else if (entry.isFile()) archive.file(absolutePath, { name: archivePath });
  }
};
archive.pipe(output);
await appendTree(path.join(source, 'paired_hedge'), 'paired_hedge');
await appendTree(path.join(source, 'binance_lighter'), 'binance_lighter');
for (const name of ['release.json', 'local.py', 'local.html', 'run.py', 'gateway.py', 'account_views.py', 'emergency.py', 'network.py', 'secret_redaction.py', 'bootstrap.ps1', 'constraints.txt', 'local-requirements.txt', 'UPSTREAM.md']) archive.file(path.join(source, name), { name });
for (const engine of ['lighter', 'entropy']) {
  await appendTree(path.join(source, 'engines', engine, 'src'), `engines/${engine}/src`);
  for (const name of ['env.example', 'LICENSE', 'pyproject.toml']) archive.file(path.join(source, 'engines', engine, name), { name: `engines/${engine}/${name}` });
}
await archive.finalize(); await complete;
const bytes = await fs.readFile(target);
await fs.writeFile(path.join(downloads, 'hedge-ops-manifest.json'), JSON.stringify({ version: 1, release, launcher: launcherName, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }, null, 2) + '\n');
console.log(`Hedge Ops local package: ${bytes.length} bytes`);
