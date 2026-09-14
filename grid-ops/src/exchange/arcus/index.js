import { ArcusExchange } from './arcus.js';
import { ArcusPaperExchange } from './paper.js';

export function createExchange(config = {}) {
  if (config.mode !== 'live') return new ArcusPaperExchange(config);
  if (!config.address || !config.apiKey || (!config.apiPrivateKey && !config.apiPrivateKeyFile)) {
    throw new Error('Arcus LIVE 模式需要 ARCUS_ADDRESS、ARCUS_API_KEY，以及 ARCUS_API_PRIVATE_KEY 或 ARCUS_API_PRIVATE_KEY_FILE。不要填写 Ethereum 主钱包私钥。');
  }
  return new ArcusExchange(config);
}
