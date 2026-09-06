import { BinanceExchange } from './binance.js';
import { BinancePaperExchange } from './paper.js';

export function createExchange(config) {
  if (config.mode === 'live') {
    if (!config.apiKey || !config.apiSecret) {
      throw new Error('Binance live 模式需要 BINANCE_API_KEY 和 BINANCE_API_SECRET。');
    }
    return new BinanceExchange(config);
  }
  return new BinancePaperExchange(config);
}

