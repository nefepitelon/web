import { EXCHANGE_ADAPTER_CONTRACT, EXCHANGE_MANIFEST, HEDGE_ADAPTER_CONTRACT, publicExchangeManifest } from './manifest.js';
import { createExchange as createDecibel } from './de/index.js';
import { createExchange as createExtended } from './ex/index.js';
import { createExchange as createRisex } from './rs/index.js';
import { createExchange as createBinance } from './binance/index.js';
import { createExchange as createOndoPerps } from './ondo/index.js';
import { createExchange as createPhoenix } from './phoenix/index.js';
import { createExchange as createNado } from './nado/index.js';
import { createExchange as createOkx } from './okx/index.js';
import { createExchange as createGrvt } from './grvt/index.js';
import { createExchange as createLighter } from './lr/index.js';

const FACTORIES = {
  de: createDecibel,
  ex: createExtended,
  rs: createRisex,
  bn: createBinance,
  op: createOndoPerps,
  ph: createPhoenix,
  nd: createNado,
  ok: createOkx,
  gv: createGrvt,
  lr: createLighter,
};

export function validateExchangeAdapter(exchange, definition) {
  const missing = EXCHANGE_ADAPTER_CONTRACT.filter((method) => typeof exchange?.[method] !== 'function');
  if (typeof exchange?.on !== 'function' || typeof exchange?.off !== 'function') missing.push('on/off events');
  if (missing.length) throw new Error(`交易所 ${definition.name} 适配器缺少契约能力：${missing.join('、')}`);
  return exchange;
}

export function validateHedgeAdapter(exchange, definition) {
  const missing = HEDGE_ADAPTER_CONTRACT.filter((method) => typeof exchange?.[method] !== 'function');
  return {
    ok: missing.length === 0,
    missing,
    key: definition?.key || '',
    name: definition?.name || definition?.key || 'unknown',
  };
}

export function createRegisteredExchanges(config) {
  const definitions = config.instanceManifest || EXCHANGE_MANIFEST;
  return Object.fromEntries(definitions.map((definition) => {
    const factory = FACTORIES[definition.baseKey || definition.key];
    if (!factory) throw new Error(`交易所 ${definition.key} 尚未注册适配器工厂。`);
    return [definition.key, {
      definition,
      config: config.exchanges?.[definition.key] || config[definition.key],
      exchange: validateExchangeAdapter(factory(config.exchanges?.[definition.key] || config[definition.key]), definition),
    }];
  }));
}

export { EXCHANGE_MANIFEST, publicExchangeManifest };
