// 多交易所整合配置加载器
// 支持直连优先、各交易所独立代理降级、GLOBAL_PROXY 最终兜底。
//
// IMPORTANT: HTTP_PROXY / HTTPS_PROXY are intentionally NOT inherited here.
// Windows launchers, npm and enterprise shells commonly inject those variables
// into the Node process. Treating them as a trading proxy made the dashboard
// show an empty GLOBAL_PROXY while every exchange still travelled through a
// stale, invisible proxy. Only settings explicitly saved by Grid Ops may affect
// exchange and AI traffic.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXCHANGE_MANIFEST } from './exchange/manifest.js';
import { buildExchangeInstanceManifest, isAccountScopedField } from './exchange/instances.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadEnv() {
  const file = path.join(root, '.env');
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && process.env[m[1]] === undefined) {
        let v = m[2].trim();
        const q = v.match(/^"([^"]*)"|^'([^']*)'/); // quoted: take the quoted content
        if (q) v = q[1] ?? q[2];
        else v = v.replace(/\s+#.*$/, '').trim();   // unquoted: strip inline comments
        process.env[m[1]] = v;
      }
    }
  }
}

export function getConfig() {
  loadEnv();

  return getConfigFromEnvironment(process.env);
}

// Pure configuration builder used by the authenticated hosted runner. Keeping
// the source object explicit avoids mutating process.env (which would leak one
// user's credentials into another concurrent server execution).
export function getConfigFromEnvironment(source = {}) {

  // 全局代理：只接受本项目显式配置，避免继承 npm/系统注入的隐形代理。
  const globalProxy = String(source.GLOBAL_PROXY || '').trim();
  const instanceManifest = buildExchangeInstanceManifest(source.EXCHANGE_INSTANCES || '');

  const exchanges = Object.fromEntries(instanceManifest.map((definition) => {
    const base = EXCHANGE_MANIFEST.find((item) => item.key === definition.baseKey) || definition;
    const inheritedNetwork = definition.instanceIndex > 1 ? source[base.networkEnv] : '';
    const configuredNetwork = source[definition.networkEnv] || inheritedNetwork || '';
    const network = /^(mainnet|testnet)$/i.test(configuredNetwork)
      ? String(configuredNetwork).toLowerCase()
      : (definition.defaultNetwork || 'mainnet');
    const defaults = definition.defaults[network] || definition.defaults.mainnet || {};
    const dedicatedProxy = String(source[definition.proxyEnv]
      || (definition.instanceIndex > 1 ? source[base.proxyEnv] : '') || '').trim();
    const exchange = {
      mode: String(source[definition.modeEnv] || 'paper').toLowerCase() === 'live' ? 'live' : 'paper',
      network,
      startBalance: Number(source.PAPER_BALANCE || 10000),
      // Preserve every candidate. Startup probes the real target in this fixed
      // order: direct -> dedicated -> global, then writes the selected route
      // back to `proxy` for adapters that keep their own dispatcher.
      dedicatedProxy,
      globalProxy,
      proxy: 'direct',
      proxySource: 'direct',
    };
    for (const field of definition.fields) {
      let value = source[field.env];
      if (value == null || value === '') {
        const baseField = base.fields.find((item) => item.prop === field.prop);
        const inherited = definition.instanceIndex > 1 && !isAccountScopedField(baseField)
          ? source[baseField?.env] : '';
        value = inherited || field.default || defaults[field.prop] || '';
      }
      if ((field.type === 'number' || field.type === 'integer') && !field.preserveString) value = Number(value);
      if ((field.type === 'url' || field.type === 'wsurl') && value) value = String(value).replace(/\/$/, '');
      exchange[field.prop] = value;
    }
    // Defaults that are not editable fields (for example RISEx wsUrl) still
    // flow into the adapter configuration.
    for (const [key, value] of Object.entries(defaults)) {
      if (exchange[key] == null || exchange[key] === '') exchange[key] = value;
    }
    return [definition.key, exchange];
  }));

  return {
    port: Number(source.PORT || 8080),
    // SECURITY: bind to loopback by default so the dashboard (which can start/stop
    // LIVE trading and edit .env) is NOT exposed to the local network. Set
    // HOST=0.0.0.0 explicitly only if you understand the risk and add your own auth.
    host: source.HOST || '127.0.0.1',
    globalProxy,
    instanceManifest,
    exchanges,
    ...exchanges,
  };
}

export const ROOT = root;
