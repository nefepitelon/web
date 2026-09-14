export const QUANT_ENGINE_IDS = ["freqtrade", "nautilus", "hummingbot", "lean", "jesse", "octobot"] as const;
export type QuantEngineId = (typeof QUANT_ENGINE_IDS)[number];
export type QuantEngine = {
  id: QuantEngineId; name: string; tagline: string; description: string;
  category: string; capabilities: string[]; license: string; sourceUrl: string;
  docsUrl: string; color: string; version: string;
};

export const QUANT_ENGINES: QuantEngine[] = [
  { id: "freqtrade", name: "Freqtrade", tagline: "趋势与波段策略", description: "数字资产策略开发、历史回测、Hyperopt 与 FreqAI。", category: "趋势交易", capabilities: ["backtest", "optimize", "paper", "live"], license: "GPL-3.0", sourceUrl: "https://github.com/freqtrade/freqtrade", docsUrl: "https://www.freqtrade.io/en/stable/", color: "#74dccb", version: "2026.8" },
  { id: "nautilus", name: "NautilusTrader", tagline: "事件驱动的交易系统", description: "Rust 核心与 Python 策略，共享研究和执行架构。", category: "事件驱动", capabilities: ["backtest", "paper", "live"], license: "LGPL-3.0", sourceUrl: "https://github.com/nautechsystems/nautilus_trader", docsUrl: "https://nautilustrader.io/docs/latest/", color: "#9da9fc", version: "1.231.0" },
  { id: "hummingbot", name: "Hummingbot", tagline: "做市与跨市场套利", description: "多交易所连接器与 Strategy V2 做市、套利执行。", category: "做市套利", capabilities: ["backtest", "paper", "live"], license: "Apache-2.0", sourceUrl: "https://github.com/hummingbot/hummingbot", docsUrl: "https://hummingbot.org/", color: "#edd27a", version: "2.16.0" },
  { id: "lean", name: "QuantConnect LEAN", tagline: "多资产组合引擎", description: "Python / C# 算法，覆盖加密资产、股票与期货。", category: "多资产组合", capabilities: ["backtest", "optimize", "paper", "live"], license: "Apache-2.0", sourceUrl: "https://github.com/QuantConnect/Lean", docsUrl: "https://www.quantconnect.com/docs/v2/lean-engine", color: "#8bbdf7", version: "镜像 build 18057" },
  { id: "jesse", name: "Jesse", tagline: "策略研究与参数优化", description: "研究、回测与优化；实盘插件需单独核实许可证及部署权利。", category: "策略研究", capabilities: ["backtest", "optimize"], license: "MIT 核心 / 商业实盘插件", sourceUrl: "https://github.com/jesse-ai/jesse", docsUrl: "https://docs.jesse.trade/", color: "#edaa94", version: "3.1.1" },
  { id: "octobot", name: "OctoBot", tagline: "低代码交易自动化", description: "基于交易模式和评估器的网格、DCA 与信号自动化。", category: "低代码策略", capabilities: ["backtest", "paper", "live"], license: "GPL-3.0", sourceUrl: "https://github.com/Drakkar-Software/OctoBot", docsUrl: "https://www.octobot.cloud/en/guides", color: "#b5d89b", version: "2.1.1" },
];

export function isQuantEngineId(value: unknown): value is QuantEngineId {
  return typeof value === "string" && QUANT_ENGINE_IDS.includes(value as QuantEngineId);
}
export function getQuantEngine(id: string) { return QUANT_ENGINES.find(engine => engine.id === id); }
