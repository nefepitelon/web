import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceUrl = "https://raw.githubusercontent.com/ZAIJIN88/WGALL-ZJ005/main/%E5%AE%8C%E6%95%B4%E4%BD%BF%E7%94%A8%E6%89%8B%E5%86%8C.md";
const outputDir = path.join(root, "grid-ops", "public");
const markdownPath = path.join(outputDir, "complete-manual.md");
const htmlPath = path.join(outputDir, "complete-manual-content.html");

const sourceResponse = await fetch(sourceUrl, {
  headers: { "User-Agent": "welinkbtc-grid-ops-manual-sync" },
});
if (!sourceResponse.ok) {
  throw new Error(`Unable to download complete manual: HTTP ${sourceResponse.status}`);
}
const sourceMarkdown = (await sourceResponse.text()).replace(/^\uFEFF/, "");
const markdown = sourceMarkdown
  .replace(/^五合一交易所网格交易机器人/m, "AI 网格交易 Ops 完整使用手册")
  .replace(
    /同时支持五家去中心化交易所：Decibel（Aptos 链）、Extended（Starknet 链）、RISEx、Arcus、RHC Lighter/m,
    "支持 Decibel（Aptos 链）、Extended（Starknet 链）、RISEx、Arcus、RHC Lighter、Binance、Ondo Perps、Phoenix、Nado 等多家交易所",
  )
  .replace(/五个交易所/g, "多个交易所")
  .replace(/五倍资金/g, "多倍资金")
  .replace(/五个不同代理/g, "多个不同代理")
  .replace(/五份程序/g, "多份程序")
  .replace(/五所摘要/g, "全部交易所摘要")
  .replace(/五所完整 SSE 状态/g, "全部交易所完整 SSE 状态")
  .replace(/`8283`/g, "`8080`")
  .replace(/`8284`/g, "`8081`")
  .replace(/127\.0\.0\.1:8283/g, "127.0.0.1:8080")
  .replace(/端口 8283/g, "端口 8080")
  .replace(/https:\/\/app\.decibel\.trade\/r\/Y4GPC5/g, "https://app.decibel.trade/r/C5WV3H")
  .replace(/https:\/\/app\.extended\.exchange\/join\/ZAIJIN/g, "https://app.extended.exchange/join/WELINKBTC")
  .replace(/https:\/\/app\.arcus\.xyz\/ref\/ZAIJIN/g, "https://app.arcus.xyz/ref/WELINKBTC")
  .replace(/https:\/\/robinhoodchain\.lighter\.xyz\/\?referral=ZAIJIN/g, "https://robinhoodchain.lighter.xyz/?referral=WELINKBTC")
  .replace(
    /实际优先级为全局代理，其次依次取第一个有值的交易所代理。Node\.js 的全局 `fetch` 使用同一个 dispatcher，因此一个进程无法保证多个交易所分别走多个不同代理。严格隔离时应复制多份程序、使用不同 `PORT`，每份只启用一个交易所和一个代理。/,
    "当前版本会按 **本机直连 → 交易所独立代理 → 全局代理** 的顺序逐个探测，并自动使用第一个能访问目标接口的通道。不同交易所可以保存各自的独立代理；只有全部通道都不可用时，该交易所才会离线运行。",
  );

const renderResponse = await fetch("https://api.github.com/markdown", {
  method: "POST",
  headers: {
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "welinkbtc-grid-ops-manual-sync",
    "X-GitHub-Api-Version": "2022-11-28",
  },
  body: JSON.stringify({
    text: markdown,
    mode: "gfm",
    context: "ZAIJIN88/WGALL-ZJ005",
  }),
});
if (!renderResponse.ok) {
  throw new Error(`Unable to render complete manual: HTTP ${renderResponse.status}`);
}

let rendered = await renderResponse.text();
rendered = rendered
  .replace(/<h1[^>]*>\s*<a[^>]*><\/a>完整使用手册<\/h1>/i, "")
  .replace(/<a href="(?!#)/g, '<a target="_blank" rel="noopener noreferrer" href="');

const sourceHash = createHash("sha256").update(sourceMarkdown).digest("hex").toUpperCase();
const hash = createHash("sha256").update(markdown).digest("hex").toUpperCase();
const fragment = [
  `<!-- Complete manual copied from the controlled source. SOURCE_SHA256: ${sourceHash}; ADAPTED_SHA256: ${hash} -->`,
  '<article class="guide-manual-article" data-source-sha256="' + sourceHash + '" data-manual-sha256="' + hash + '">',
  rendered.trim(),
  "</article>",
  "",
].join("\n");

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(markdownPath, markdown, "utf8"),
  writeFile(htmlPath, fragment, "utf8"),
]);

console.log(`Manual copied: ${markdown.split(/\r?\n/).length} lines`);
console.log(`Manual SHA256: ${hash}`);
console.log(`Rendered fragment: ${path.relative(root, htmlPath)}`);
