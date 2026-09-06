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
