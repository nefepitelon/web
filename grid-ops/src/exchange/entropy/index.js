import { EntropyLiveUnavailableExchange, EntropyPaperExchange } from './entropy.js';

export function createExchange(config = {}) {
  return config.mode === 'live'
    ? new EntropyLiveUnavailableExchange(config)
    : new EntropyPaperExchange(config);
}
