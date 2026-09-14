import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Verify the pinned upstream UI and the documented hosting changes offline.
const root = fileURLToPath(new URL('../', import.meta.url));
const vendor = path.join(root, 'third-party/quant-ui/jesse');
const directory = path.join(root, 'public/quant-native/jesse');
const upstream = JSON.parse(await readFile(path.join(vendor, 'UPSTREAM.json'), 'utf8'));
const patches = JSON.parse(await readFile(path.join(vendor, 'PATCHES.json'), 'utf8')).patches;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const expected = new Map(upstream.files.map(file => [file.path, file.sha256]));
for (const patch of patches) {
  assert.equal(expected.get(patch.path), patch.upstreamSha256, `Unrecognized upstream patch: ${patch.path}`);
  expected.set(patch.path, patch.hostedSha256);
}
for (const name of ['LICENSE', 'welink-bootstrap.mjs']) {
  expected.set(name, sha256(await readFile(path.join(vendor, name))));
}
// Vercel omits node_modules in uploads, including this upstream static folder.
// Restore its two original Monaco metadata files from verified vendor copies.
for (const extension of ['js', 'd.ts']) {
  const relative = `_nuxt/nuxt-monaco-editor/node_modules/monaco-editor/esm/metadata.${extension}`;
  const source = path.join(vendor, `monaco-metadata.${extension}`);
  assert.equal(sha256(await readFile(source)), expected.get(relative), `Upstream Monaco metadata mismatch: ${relative}`);
  await mkdir(path.dirname(path.join(directory, relative)), {recursive: true});
  await copyFile(source, path.join(directory, relative));
}
const found = [];
async function inspect(base, prefix = '') {
  for (const entry of await readdir(base, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    assert.equal(entry.isSymbolicLink(), false, `Unexpected symlink: ${relative}`);
    if (entry.isDirectory()) await inspect(path.join(base, entry.name), relative + '/');
    else {
      assert.ok(expected.has(relative), `Undocumented public asset: ${relative}`);
      assert.equal(sha256(await readFile(path.join(base, entry.name))), expected.get(relative), `Native asset integrity mismatch: ${relative}`);
      found.push(relative);
    }
  }
}
await inspect(directory);
assert.equal(found.length, expected.size, `Pinned assets missing: ${[...expected.keys()].filter(name => !found.includes(name)).join(', ')}`);
console.log(JSON.stringify({ ok: true, ui: `Jesse ${upstream.version}`, commit: upstream.commit, assets: found.length, hostingPatches: patches.length }));
