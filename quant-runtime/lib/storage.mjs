import { mkdir, readFile, rename, open, realpath, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { tenantId } from './validation.mjs';

export async function readJson(file, fallback = null) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
export async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomUUID()}.tmp`;
  const handle = await open(temp, 'wx', 0o600);
  try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`); await handle.sync(); } finally { await handle.close(); }
  await rename(temp, file);
}
export function paths(root, userId, engine) {
  const tenant = tenantId(userId);
  const base = path.join(path.resolve(root), 'tenants', tenant, engine);
  return { tenant, base, project: path.join(base, 'project'), state: path.join(base, 'state'), deployment: path.join(base, 'deployment.json'), ledger: path.join(base, 'ledger') };
}
export async function assertContained(root, target) {
  const [resolvedRoot, resolvedTarget] = await Promise.all([realpath(root), realpath(target)]);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Runtime path must be inside configured root without escaping symlinks.');
}
export async function audit(p, event) {
  await mkdir(p.base, { recursive: true, mode: 0o700 });
  await appendFile(path.join(p.base, 'audit.ndjson'), `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, { mode: 0o600 });
}
