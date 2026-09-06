import { OkxExchange } from './okx.js';
import { OkxPaperExchange } from './paper.js';
export function createExchange(cfg={}){return cfg.mode==='live'?new OkxExchange(cfg):new OkxPaperExchange(cfg);}
