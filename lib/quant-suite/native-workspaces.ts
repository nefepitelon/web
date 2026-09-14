import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { QuantEngineId } from "./catalog";

export const NATIVE_WORKSPACES = {
  freqtrade: {title: "FreqUI", kind: "原版 Web UI", license: "GPL-3.0", source: "https://github.com/freqtrade/frequi", entry: "/quant-native/freqtrade/", description: "官方 Vue 交易终端：机器人、交易记录、图表、回测与数据管理。", requirements: "Freqtrade REST API", files: "quant-runtime/recipes/freqtrade"},
  nautilus: {title: "NautilusTrader SDK", kind: "官方 SDK 工程", license: "LGPL-3.0", source: "https://github.com/nautechsystems/nautilus_trader", entry: null, description: "官方开源核心使用 Python / Rust SDK。这里呈现真实工程文件与节点运行流程；商业 Pro Dashboard 不属于开源核心。", requirements: "TradingNode / BacktestNode + 常驻 Python 执行节点", files: "third-party/quant-source/nautilus"},
  hummingbot: {title: "Hummingbot Dashboard", kind: "原版 Streamlit UI", license: "Apache-2.0", source: "https://github.com/hummingbot/dashboard", entry: null, description: "原版 Dashboard 的策略控制器、回测与机器人部署界面由 Streamlit 服务提供。", requirements: "Dashboard + Hummingbot API + MQTT + 原生机器人", files: "quant-runtime/recipes/hummingbot"},
  lean: {title: "LEAN Engine", kind: "官方 SDK 工程", license: "Apache-2.0", source: "https://github.com/QuantConnect/Lean", entry: null, description: "开源 LEAN 使用 Python / C# 算法与 CLI 工程。QuantConnect 云端 IDE 不包含在开源引擎中。", requirements: ".NET LEAN + 行情数据 + 经纪商连接", files: "third-party/quant-source/lean"},
  jesse: {title: "Jesse Dashboard", kind: "原版 Web UI", license: "MIT 核心", source: "https://github.com/jesse-ai/jesse/tree/v3.1.1", entry: "/quant-native/jesse/", description: "Jesse 3.1.1 官方发布包内的 Nuxt 界面。研究后端、实时 WebSocket 与商业实盘插件分别连接。", requirements: "Jesse FastAPI + Redis + 原生研究进程；实盘另需已授权插件", files: "quant-runtime/recipes/jesse"},
  octobot: {title: "OctoBot Web Interface", kind: "原版 Flask UI", license: "GPL-3.0", source: "https://github.com/Drakkar-Software/OctoBot-Tentacles", entry: null, description: "原版 Web Interface 来自 OctoBot Tentacles，由 Flask / Socket.IO 提供配置、交易模式、组合与回测页面。", requirements: "OctoBot + WebInterface Tentacle + Socket.IO", files: "quant-runtime/recipes/octobot"},
} as const;
export type NativeSourceFile = {name: string; content: string};

export async function readNativeSources(engine: QuantEngineId): Promise<NativeSourceFile[]> {
  // Keep both roots static so Turbopack traces only the published source samples.
  const directory = engine === "nautilus" || engine === "lean"
    ? path.join(process.cwd(), "third-party", "quant-source", engine)
    : path.join(process.cwd(), "quant-runtime", "recipes", engine);
  const files: NativeSourceFile[] = [];
  async function visit(dir: string, prefix = "") {
    let entries;
    try {entries = await readdir(dir, {withFileTypes: true});} catch (error) {if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error;}
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (files.length >= 16 || entry.isSymbolicLink() || entry.name.startsWith(".") || entry.name === "__pycache__") continue;
      const name = `${prefix}${entry.name}`;
      if (entry.isDirectory()) {if (!prefix) await visit(path.join(dir, entry.name), `${name}/`); continue;}
      if (!/\.(?:py|cs|json|md|txt)$/.test(name) && name !== "LICENSE" && name !== "Dockerfile") continue;
      const content = await readFile(path.join(dir, entry.name), "utf8");
      if (Buffer.byteLength(content) <= 128 * 1024) files.push({name, content});
    }
  }
  await visit(directory);
  return files;
}
