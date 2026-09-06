import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const launcherPath = path.resolve(testDirectory, '..', 'scripts', 'windows-launcher.ps1');
const downloadLauncherPath = path.resolve(
  testDirectory,
  '..',
  '..',
  'public',
  'downloads',
  '启动AI网格交易Ops.bat',
);

test('Windows launcher keeps its UTF-8 BOM for Windows PowerShell 5.1', async () => {
  const launcher = await readFile(launcherPath);
  assert.deepEqual([...launcher.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
});

test('Windows launcher runs the packaged preflight entry point', async () => {
  const launcher = (await readFile(launcherPath)).toString('utf8');
  assert.match(launcher, /src\\preflight\.js/);
  assert.doesNotMatch(launcher, /scripts\\preflight\.js/);
});

test('download launcher always refreshes the managed engine package', async () => {
  const launcher = await readFile(downloadLauncherPath, 'utf8');

  assert.match(launcher, /ai-grid-ops-engine\.zip/);
  assert.match(launcher, /%LOCALAPPDATA%\\welinkBTC\\AI-Grid-Ops/);
  assert.match(launcher, /scripts\\windows-launcher\.ps1/);
  assert.doesNotMatch(launcher, /%USERPROFILE%\\Documents/i);
  assert.doesNotMatch(launcher, /\bwinget\b/i);
});
