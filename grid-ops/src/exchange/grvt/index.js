import { GrvtExchange } from './grvt.js'; import { GrvtPaperExchange } from './paper.js';
export function createExchange(cfg={}){return cfg.mode==='live'?new GrvtExchange(cfg):new GrvtPaperExchange(cfg);}
