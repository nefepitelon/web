import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, cp, access } from 'node:fs/promises';
import { validateConfig, ENGINES, approvedConfigHash } from '../lib/validation.mjs';
import { paths, readJson, writeJson } from '../lib/storage.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, item, index, list) => index % 2 === 0 ? [...pairs, [item, list[index + 1]]] : pairs, []));
if (!args['--user-id'] || !ENGINES.includes(args['--engine']) || !args['--config']) {
  console.error('Usage: node bin/init-profile.mjs --user-id <database-user-id> --engine <engine> --config <saved-config.json> [--root /srv/welink-quant]');
  process.exit(1);
}
const root = args['--root'] ?? process.env.QUANT_RUNTIME_ROOT ?? '/srv/welink-quant';
const engine = args['--engine'];
const config = validateConfig(await readJson(path.resolve(args['--config'])));
const p = paths(root, args['--user-id'], engine);
if (await readJson(p.deployment)) throw new Error('Existing profile will not be overwritten. Review native files and update the existing deployment explicitly.');
await mkdir(p.project, { recursive: true, mode: 0o700 });
const recipe = fileURLToPath(new URL(`../recipes/${engine}/`, import.meta.url));
const seeds = {
  freqtrade: [['config.example.json', 'config.json'], ['strategies', 'strategies']],
  nautilus: [['paper.example.json', 'paper.json'], ['backtest.example.json', 'backtest.json']],
  hummingbot: [],
  lean: [['algorithm.py', 'algorithm.py'], ['backtest.example.json', 'backtest.json']],
  jesse: [['strategies', 'strategies'], ['backtest.example.json', 'backtest.json']],
  octobot: [],
};
for (const [from, to] of seeds[engine]) {
  try { await access(path.join(recipe, from)); await cp(path.join(recipe, from), path.join(p.project, to), { recursive: true, errorOnExist: true, force: false }); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const images = { freqtrade: 'freqtradeorg/freqtrade:2026.8', nautilus: 'welink/nautilus:1.231.0', hummingbot: 'hummingbot/hummingbot:version-2.16.0', lean: 'quantconnect/lean:18057', jesse: 'welink/jesse:3.1.1', octobot: 'drakkarsoftware/octobot:2.1.1' };
const versions = { freqtrade: '2026.8', nautilus: '1.231.0', hummingbot: '2.16.0 / API 1.0.1', lean: '18057', jesse: '3.1.1', octobot: '2.1.1' };
await writeJson(p.deployment, { schemaVersion: 1, engine, enabled: false, image: images[engine], upstreamVersion: versions[engine], approvedConfigHash: approvedConfigHash(config), verifiedActions: [], paperVerified: false, liveVerified: false, accountConfigured: false, withdrawalsDisabled: false, ipAllowlistVerified: false, envFile: false, strategyClass: engine === 'freqtrade' || engine === 'jesse' ? 'WelinkTrend' : undefined, memory: '2g', cpus: 2 });
console.log(JSON.stringify({ tenant: p.tenant, deployment: p.deployment, approvedConfigHash: approvedConfigHash(config), enabled: false }, null, 2));
