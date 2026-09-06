import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceDir = path.resolve(scriptDir, '..');
const engineDir = path.resolve(workspaceDir, 'grid-ops');
const downloadDir = path.resolve(workspaceDir, 'public', 'downloads');
const targetPath = path.resolve(downloadDir, 'ai-grid-ops-engine.zip');
const stagingPath = path.resolve(downloadDir, 'ai-grid-ops-engine.next.zip');

const sourceDirectories = ['public', 'src', 'test', 'scripts'];
const sourceFiles = [
  '.env.example',
  'env.example',
  '.gitignore',
  'package-lock.json',
  'package.json',
  'README.md',
  'UPSTREAM.md',
  'requirements-lighter.txt',
];
const requiredEntries = [
  'engine-build.json',
  'env.example',
  'public/index.html',
  'public/complete-manual.md',
  'public/complete-manual-content.html',
  'src/server.js',
  'scripts/windows-launcher.ps1',
  'requirements-lighter.txt',
  'package.json',
];

function assertInsideWorkspace(candidatePath) {
  const relative = path.relative(workspaceDir, candidatePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Packaging path escaped the workspace: ${candidatePath}`);
  }
}

async function collectFiles(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolutePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(absolutePath));
    else if (entry.isFile()) files.push(absolutePath);
  }
  return files;
}

for (const candidatePath of [engineDir, downloadDir, targetPath, stagingPath]) assertInsideWorkspace(candidatePath);

const engineStat = await stat(engineDir).catch(() => null);
if (!engineStat?.isDirectory()) throw new Error(`Grid engine source directory is missing: ${engineDir}`);

const launcherPath = path.join(engineDir, 'scripts', 'windows-launcher.ps1');
const launcherBytes = await readFile(launcherPath);
if (!(launcherBytes[0] === 0xef && launcherBytes[1] === 0xbb && launcherBytes[2] === 0xbf)) {
  throw new Error('windows-launcher.ps1 must use UTF-8 with BOM so Windows PowerShell 5.1 can parse localized text safely.');
}

const absoluteFiles = [];
for (const directoryName of sourceDirectories) {
  const directoryPath = path.join(engineDir, directoryName);
  const directoryStat = await stat(directoryPath).catch(() => null);
  if (directoryStat?.isDirectory()) absoluteFiles.push(...await collectFiles(directoryPath));
}
for (const fileName of sourceFiles) {
  const filePath = path.join(engineDir, fileName);
  const fileStat = await stat(filePath).catch(() => null);
  if (fileStat?.isFile()) absoluteFiles.push(filePath);
}

const files = [...new Set(absoluteFiles)]
  .map((absolutePath) => ({
    absolutePath,
    entryName: path.relative(engineDir, absolutePath).split(path.sep).join('/'),
  }))
  .sort((a, b) => a.entryName.localeCompare(b.entryName));

const contentHash = createHash('sha256');
for (const file of files) {
  contentHash.update(file.entryName);
  contentHash.update('\0');
  contentHash.update(await readFile(file.absolutePath));
  contentHash.update('\0');
}

const packageMetadata = JSON.parse(await readFile(path.join(engineDir, 'package.json'), 'utf8'));
const manifest = {
  schemaVersion: 1,
  service: 'ai-grid-ops-local-engine',
  version: packageMetadata.version,
  buildId: contentHash.digest('hex').slice(0, 16),
  builtAt: new Date().toISOString(),
};
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
const entryNames = new Set(files.map((file) => file.entryName));
entryNames.add('engine-build.json');
for (const requiredEntry of requiredEntries) {
  if (!entryNames.has(requiredEntry)) throw new Error(`Required engine package entry is missing: ${requiredEntry}`);
}

await mkdir(downloadDir, { recursive: true });
await rm(stagingPath, { force: true });

const output = createWriteStream(stagingPath);
const archive = archiver('zip', { zlib: { level: 9 } });
const completed = new Promise((resolve, reject) => {
  output.once('close', resolve);
  output.once('error', reject);
  archive.once('error', reject);
  archive.on('warning', (error) => {
    if (error.code === 'ENOENT') process.stderr.write(`[grid:package] warning: ${error.message}\n`);
    else reject(error);
  });
});
archive.pipe(output);
for (const file of files) archive.file(file.absolutePath, { name: file.entryName });
archive.append(manifestText, { name: 'engine-build.json' });
await archive.finalize();
await completed;

await rm(targetPath, { force: true });
await rename(stagingPath, targetPath);
const resultStat = await stat(targetPath);
process.stdout.write(`[grid:package] ${targetPath}\n`);
process.stdout.write(`[grid:package] version=${manifest.version} build=${manifest.buildId} entries=${entryNames.size} bytes=${resultStat.size}\n`);
