import { OndoPerpsExchange } from './ondo.js';
import { OndoPerpsPaperExchange } from './paper.js';

export function createExchange(config) {
  if (config.mode === 'live') {
    if (!config.keyId || !config.apiSecret) throw new Error('Ondo Perps live 模式需要 ONDO_KEY_ID 和 ONDO_API_SECRET。');
    return new OndoPerpsExchange(config);
  }
  return new OndoPerpsPaperExchange(config);
}
