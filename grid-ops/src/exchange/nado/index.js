import { NadoExchange } from './nado.js';
import { NadoPaperExchange } from './paper.js';

export function createExchange(config) {
  if (config.mode === 'live') {
    if (!config.privateKey && !config.keyPath) {
      throw new Error('Nado live 模式需要 NADO_PRIVATE_KEY 或 NADO_KEY_PATH（二选一）。');
    }
    return new NadoExchange(config);
  }
  return new NadoPaperExchange(config);
}
