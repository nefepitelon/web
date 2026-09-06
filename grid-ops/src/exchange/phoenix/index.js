import { PhoenixExchange } from './phoenix.js';
import { PhoenixPaperExchange } from './paper.js';

export function createExchange(config) {
  if (config.mode === 'live') {
    if (!config.privateKey && !config.keypairPath) {
      throw new Error('Phoenix live 模式需要 PHOENIX_PRIVATE_KEY 或 PHOENIX_KEYPAIR_PATH（二选一）。');
    }
    return new PhoenixExchange(config);
  }
  return new PhoenixPaperExchange(config);
}
