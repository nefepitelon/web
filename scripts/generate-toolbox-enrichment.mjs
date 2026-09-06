import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const source = JSON.parse(await fs.readFile(path.join(root, "data", "toolbox-sheet-data.json"), "utf8"));
const research = JSON.parse(await fs.readFile(path.join(root, "data", "toolbox-web-research.json"), "utf8"));
const researchById = new Map(research.items.map((item) => [item.id, item]));

// Hand-checked official accounts take precedence over automatically extracted links.
// Rows without sufficient official evidence intentionally stay explicit instead of
// being populated with a similarly named personal or partner account.
const officialXByRow = new Map(Object.entries({
  2: "@thefireflyapp", 3: "@TakoProtocol", 4: "@farcaster_xyz", 6: "@Reddit", 10: "@RiverdotInc",
  11: "@wallchain_xyz", 13: "@X", 14: "@BinanceSquare", 17: "@rodeo_club", 18: "@X", 19: "@KaitoAI",
  20: "@polarise_xyz", 21: "@base", 26: "@CoinMarketCap", 27: "@coingecko", 28: "@LiveCoinWatch",
  29: "@arkham", 30: "@Dune", 31: "@nansen_ai", 34: "@Tree_of_Alpha", 36: "@ChainAlertMe",
  37: "@Foresight_News", 40: "@Checkonchain", 42: "@Polymarket", 43: "@Kalshi", 44: "@opinionlabsxyz",
  47: "@KloutDotGG", 48: "@fireplacefyi", 49: "@UpshotHQ", 53: "@GeminiApp", 55: "@yupp_ai",
  56: "@minaraai", 57: "@gonka_ai", 58: "@MyShell_AI", 59: "@Alibaba_Qwen", 60: "@OpenAI",
  61: "@bananaimg_ai", 62: "@imagineartcom", 63: "@NousResearch", 64: "@AIWayfinder", 65: "@AgentLisaAI",
  68: "@UniversalXapp", 69: "@Backpack", 70: "@grvt_io", 71: "@Aster_DEX", 73: "@edgeX_exchange",
  74: "@paradex", 75: "@extendedapp", 77: "@HyperliquidX", 80: "@defidotapp", 82: "@Lighter_xyz",
  83: "@arkham", 84: "@variational_io", 85: "@vanish_trade", 86: "@basedotone", 88: "@flipster_io",
  89: "@OstiumLabs", 92: "@trycoinpilot", 95: "@xhunt_ai", 98: "@DeBankDeFi", 99: "@arkham",
  100: "@zapper_fi", 101: "@Rabby_io", 102: "@RootDataLabs", 106: "@deBridgeFinance", 110: "@gmail",
  111: "@ProtonPrivacy", 112: "@Outlook", 116: "@Linktree_", 117: "@iSafePal", 118: "@web3serve",
  120: "@privy_io", 121: "@ProxyLine_net", 122: "@smsactivate", 123: "@crazysmm", 125: "@nxonearth",
  126: "@HeroSMS_com", 130: "@billions_ntwk", 131: "@brevis_zk", 132: "@NebulaiHQ", 133: "@NexusLabs",
  135: "@AstraNovaWorld", 136: "@dawninternet", 139: "@ferraProtocol", 141: "@rails_xyz", 147: "@senpi_ai",
  148: "@unitas_so", 149: "@katana", 151: "@pip_world", 153: "@OpenMind_AGI", 155: "@PerleLabs",
  156: "@gensynai", 158: "@AskJuneAI", 163: "@hylo_so", 164: "@sign", 165: "@humafinance",
  167: "@Lava__xyz", 169: "@USDai_Official", 173: "@Legiondotcc", 177: "@alphdotai", 178: "@TradeGeniusHQ",
  180: "@AxiomExchange", 181: "@UniversalXapp"
}).map(([row, handle]) => [Number(row), handle]));

const rejectedCandidates = new Set(["@Bybit_Official"]);
const issuedTokenRows = new Set([
  7, 10, 14, 19, 29, 58, 64, 65, 69, 71, 76, 77, 78, 80, 82, 83,
  97, 99, 106, 117, 131, 134, 135, 164, 165, 166, 168
]);

const globalInfluenceRows = new Set([6, 13, 14, 21, 26, 27, 42, 53, 59, 60, 77, 110]);
const highInfluenceRows = new Set([
  4, 7, 19, 29, 30, 31, 35, 38, 43, 58, 63, 69, 71, 74, 78, 82, 83,
  97, 98, 99, 100, 101, 102, 111, 112, 116, 117, 131, 133, 156, 164, 165, 166
]);
const mediumInfluenceRows = new Set([
  2, 3, 5, 9, 10, 11, 12, 16, 23, 28, 32, 33, 34, 37, 39, 45, 46, 49,
  52, 54, 55, 56, 57, 62, 64, 65, 68, 70, 72, 73, 75, 76, 79, 80, 81,
  84, 88, 89, 90, 91, 95, 96, 103, 104, 105, 106, 108, 120, 130, 134,
  135, 140, 143, 144, 145, 146, 147, 150, 153, 154, 157, 161, 162, 168,
  170, 171, 173, 179, 180, 181, 182
]);

const descriptionsByRow = new Map(Object.entries({
  2: "聚合 X、Farcaster 等社交信息流，支持跨平台浏览与内容发布。",
  3: "面向 Web3 社区的社交内容与互动平台，支持账号登录和内容发布。",
  4: "去中心化社交协议入口，可浏览频道、使用 Frames 并参与链上社交。",
  5: "基于社交影响力与互动数据的 Web3 声誉和任务平台。",
  7: "面向 AI Agent 的创建、发行与交易平台，连接智能体与链上经济。",
  10: "跨链稳定币与收益协议，提供资产铸造、质押及生态任务入口。",
  19: "加密行业注意力与内容影响力分析平台，提供 Yaps 等社区积分产品。",
  21: "Base 生态的一体化钱包与社交入口，用于资产、应用和链上身份管理。",
  26: "综合加密资产行情、排名、市值、交易所与项目基础资料平台。",
  27: "加密市场行情、分类数据、研究内容与币种追踪平台。",
  28: "实时加密行情、自选组合和市场概览工具。",
  29: "链上实体标签、地址追踪、资金流向和情报分析平台。",
  30: "社区驱动的链上 SQL 数据分析与可视化看板平台。",
  31: "面向投资研究的链上标签、地址画像与资金流分析平台。",
  32: "聚焦数字资产市场、监管与机构动态的加密行业新闻媒体。",
  33: "提供比特币及多链地址、供需和市场周期指标的链上数据平台。",
  35: "Web3 与前沿科技中文资讯、深度分析及财经日历平台。",
  37: "加密行业快讯、研究、融资信息与重要事件日历平台。",
  38: "提供合约持仓、爆仓、资金费率与多维市场统计的衍生品数据平台。",
  39: "面向 Crypto 行业的中文快讯、深度研究与数据资讯平台。",
  40: "专注比特币链上周期、估值和持币结构分析的研究工具。",
  42: "基于真实事件结果结算的链上预测市场与概率交易平台。",
  43: "受监管的事件合约与预测交易平台，覆盖经济、政治和体育等主题。",
  44: "面向宏观与加密事件的观点交易和预测市场平台。",
  52: "面向加密研究的 AI 助手，可聚合资料并生成分析结论。",
  53: "Google 的多模态 AI 助手，用于检索、写作、分析与内容生成。",
  54: "面向股票和加密市场的 AI 研究助手，提供标的分析与交易要点。",
  58: "AI 角色与智能体创作、发现和互动平台。",
  59: "通义千问 AI 助手，支持问答、写作、分析、代码和多模态任务。",
  60: "OpenAI 的通用 AI 助手，用于研究、写作、分析、代码与自动化。",
  68: "聚合多链资产与交易机会的一站式链上交易平台。",
  69: "加密交易所与多链钱包，提供现货、永续和资产管理服务。",
  71: "多链去中心化交易平台，提供永续合约、现货及活动入口。",
  74: "高性能链上永续合约交易平台，提供统一保证金和积分体系。",
  77: "高性能链上订单簿交易平台，提供永续、现货和原生金融应用。",
  78: "简化多链资产管理与交易流程的非托管加密入口。",
  80: "支持跨链兑换、衍生品和收益操作的一站式 DeFi 应用。",
  82: "高性能去中心化订单簿与永续合约交易平台。",
  95: "面向 X 账号和加密 KOL 的影响力排名与社交数据分析工具。",
  96: "以气泡图展示加密资产涨跌和市值分布的市场可视化工具。",
  97: "通过地址关系图分析代币持仓集中度与链上资金关联。",
  98: "多链钱包资产、协议仓位、地址画像和社交关系数据平台。",
  100: "多链钱包资产与 DeFi 仓位跟踪、探索和交易工具。",
  101: "面向多链 DeFi 用户的浏览器钱包与桌面资产管理工具。",
  102: "Web3 项目、团队、融资、投资机构、代币与 X 影响力数据库。",
  106: "用于跨链转移资产和消息的去中心化互操作协议。",
  110: "Google 邮箱入口，用于日常邮件收发、账号登录与通知管理。",
  111: "强调隐私与端到端加密的电子邮箱服务。",
  112: "Microsoft 邮箱入口，用于邮件、联系人和账号通知管理。",
  117: "SafePal 营销联盟后台，用于推广链接、转化和佣金管理。",
  120: "面向应用的嵌入式钱包与身份认证管理平台。",
  130: "面向 Web3 应用和社区的隐私身份验证与真人证明网络。",
  131: "零知识证明基础设施与 Proving Grounds 任务入口。",
  133: "面向可验证计算的分布式网络节点与贡献任务平台。",
  134: "结合链上意图、AI Agent 与跨链账户能力的模块化协议。",
  140: "面向比特币等资产的链上跨链兑换与流动性工具。",
  146: "面向以太坊 Gas 市场的基础设施、交易和社区激励平台。",
  153: "面向机器人与智能设备的开放协作、数据和 AI 基础设施平台。",
  156: "去中心化机器学习算力网络与模型训练任务平台。",
  157: "分布式 AI 算力、模型训练和智能体运行平台。",
  161: "Solana 生态收益与质押平台，提供资产存入和奖励任务。",
  162: "Abstract 消费级区块链的账号、奖励与生态任务门户。",
  164: "Sign 协议代币质押与奖励管理入口。",
  165: "链上应收账款与 PayFi 协议的流动性和质押入口。",
  166: "Sky 生态的借贷、稳定币储蓄与代币质押平台。",
  168: "稳定币收益与质押协议，提供资产组合和奖励管理。",
  171: "链上交易与资本配置项目的公开销售及分配入口。",
  173: "面向合规早期项目的加密资产发行、认购与积分平台。",
  180: "面向 Solana 新资产的发现、交易、钱包追踪与积分平台。"
}).map(([row, description]) => [Number(row), description]));

const categoryTemplates = new Map([
  ["toolbox-cat-socialfi", (name) => `${name} 是用于 Web3 社交、内容分发或社区互动的工具入口。`],
  ["toolbox-cat-identity", (name) => `${name} 用于钱包身份、社区成员和链上账号验证。`],
  ["toolbox-cat-analytics", (name) => `${name} 提供加密市场、链上数据、资讯或研究分析服务。`],
  ["toolbox-cat-sheet-04", (name) => `${name} 是用于事件观点、概率发现或结果交易的预测平台。`],
  ["toolbox-cat-sheet-05", (name) => `${name} 是用于问答、研究、生成或智能体任务的 AI 产品。`],
  ["toolbox-cat-sheet-06", (name) => `${name} 是提供永续合约、链上交易或衍生品服务的交易平台。`],
  ["toolbox-cat-sheet-07", (name) => `${name} 是面向加密数据观察、钱包、跨链或运营效率的实用工具。`],
  ["toolbox-cat-sheet-08", (name) => `${name} 是账号、邮箱、代理或日常运营场景的常用服务入口。`],
  ["toolbox-cat-sheet-09", (name) => `${name} 是用于 Web3 任务、支付、跨链、挖矿或新项目参与的工具。`],
  ["toolbox-cat-sheet-10", (name) => `${name} 面向机器人、分布式算力或 AI 基础设施任务。`],
  ["toolbox-cat-sheet-11", (name) => `${name} 提供链上质押、稳定币收益或挖矿奖励管理。`],
  ["toolbox-cat-sheet-12", (name) => `${name} 是用于新项目发现、认购、发行或早期参与的平台。`],
  ["toolbox-cat-sheet-13", (name) => `${name} 是用于链上新资产发现、交易或策略跟踪的平台。`]
]);

function verifiedHandle(item) {
  const manual = officialXByRow.get(item.sourceRow);
  if (manual) return manual;
  const result = researchById.get(item.id);
  const candidate = result?.suggestedX;
  // A link extracted from the project's own site is stronger evidence than a
  // name-only search match. The score only measures textual similarity.
  if (candidate && !rejectedCandidates.has(candidate)) return candidate;
  return "未发现官方 X";
}

function briefDescription(item) {
  const manual = descriptionsByRow.get(item.sourceRow);
  if (manual) return manual;
  const meta = researchById.get(item.id)?.metaDescription?.replace(/\s+/g, " ").trim() ?? "";
  if (/[\u3400-\u9fff]/.test(meta) && meta.length >= 18 && !/所在地区无法访问/.test(meta)) {
    return meta.length > 96 ? `${meta.slice(0, 95)}…` : meta;
  }
  return categoryTemplates.get(item.categoryId)?.(item.name) ?? `${item.name} 的常用工具与服务入口。`;
}

function xRating(item, officialTwitter) {
  if (globalInfluenceRows.has(item.sourceRow)) return 10;
  if (highInfluenceRows.has(item.sourceRow)) return 9;
  if (mediumInfluenceRows.has(item.sourceRow)) return 8;
  if (officialTwitter !== "未发现官方 X") return 7;
  return 5;
}

const enrichedItems = source.items.map((item) => {
  const officialTwitter = verifiedHandle(item);
  return {
    ...item,
    description: briefDescription(item),
    officialTwitter,
    tokenStatus: issuedTokenRows.has(item.sourceRow) ? "已发币" : "未发币",
    rating: xRating(item, officialTwitter)
  };
});

const enriched = {
  ...source,
  source: {
    ...source.source,
    enrichedAt: "2026-08-11T11:00:00.000Z",
    enrichment: {
      officialX: "官网站内 X 链接优先，并结合项目名称与官网域名人工核对；无法确认的账号明确标记为未发现",
      rating: "按官方 X 可确认性与账号/项目公开影响力分为 5、7、8、9、10 分",
      tokenStatus: "按 RootData 的 TGE/发行时间/流通代币口径核对；无可靠 TGE 记录按未发币处理"
    }
  },
  items: enrichedItems
};

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const migrationDir = path.join(root, "prisma", "migrations", "20260811190000_enrich_toolbox_metadata");
await fs.mkdir(migrationDir, { recursive: true });

const updates = enrichedItems.map((item) =>
  `UPDATE "toolbox_items" SET "description" = ${sqlString(item.description)}, "rating" = ${item.rating}, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${sqlString(item.id)};`
).join("\n");

const cells = enrichedItems.flatMap((item) => [
  `(${sqlString(`toolbox-twitter-r${item.sourceRow}`)}, ${sqlString(item.id)}, 'toolbox-col-official-twitter', ${sqlString(JSON.stringify(item.officialTwitter))}::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
  `(${sqlString(`toolbox-token-r${item.sourceRow}`)}, ${sqlString(item.id)}, 'toolbox-col-token-status', ${sqlString(JSON.stringify(item.tokenStatus))}::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
]).join(",\n  ");

const migration = `-- Enrich all toolbox rows with official X, descriptions, X-based ratings and RootData-style token status.
INSERT INTO "toolbox_columns" ("id", "key", "title", "type", "width", "sortOrder", "isSystem", "isVisible", "isPublic", "isSensitive", "isEditable", "isRequired", "options", "createdAt", "updatedAt") VALUES
  ('toolbox-col-official-twitter', 'officialTwitter', '官方推特', 'text', 150, 45, FALSE, TRUE, TRUE, FALSE, TRUE, FALSE, '[]'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET
  "title" = EXCLUDED."title", "type" = EXCLUDED."type", "width" = EXCLUDED."width", "sortOrder" = EXCLUDED."sortOrder",
  "isVisible" = TRUE, "isPublic" = TRUE, "isSensitive" = FALSE, "isEditable" = TRUE, "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "toolbox_columns" ("id", "key", "title", "type", "width", "sortOrder", "isSystem", "isVisible", "isPublic", "isSensitive", "isEditable", "isRequired", "options", "createdAt", "updatedAt") VALUES
  ('toolbox-col-token-status', 'tokenStatus', '是否发币', 'select', 120, 65, FALSE, TRUE, TRUE, FALSE, TRUE, FALSE, '["未发币","已发币"]'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET
  "title" = EXCLUDED."title", "type" = EXCLUDED."type", "width" = EXCLUDED."width", "sortOrder" = EXCLUDED."sortOrder",
  "isVisible" = TRUE, "isPublic" = TRUE, "isSensitive" = FALSE, "isEditable" = TRUE, "options" = EXCLUDED."options", "updatedAt" = CURRENT_TIMESTAMP;

${updates}

INSERT INTO "toolbox_cell_values" ("id", "itemId", "columnId", "value", "createdAt", "updatedAt") VALUES
  ${cells}
ON CONFLICT ("itemId", "columnId") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "audit_logs" ("id", "action", "targetType", "targetId", "metadata", "createdAt") VALUES
  ('toolbox-enrichment-20260811', 'toolbox.metadata_enriched', 'toolbox.import', '18i-vrpwprwYvRsUIbuJKsiNRCwTuwbtXMokZlili9UM',
   '{"items":162,"officialXMethod":"site-link-and-manual-verification","ratingMethod":"x-evidence-and-influence-tier","tokenMethod":"rootdata-tge-standard"}'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
`;

await Promise.all([
  fs.writeFile(path.join(root, "data", "toolbox-enriched-data.json"), `${JSON.stringify(enriched, null, 2)}\n`, "utf8"),
  fs.writeFile(path.join(migrationDir, "migration.sql"), migration, "utf8")
]);

const stats = {
  categories: enriched.categories.length,
  items: enrichedItems.length,
  descriptions: enrichedItems.filter((item) => item.description).length,
  officialXConfirmed: enrichedItems.filter((item) => item.officialTwitter.startsWith("@")).length,
  officialXUnresolved: enrichedItems.filter((item) => !item.officialTwitter.startsWith("@")).length,
  ratings: enrichedItems.filter((item) => Number.isInteger(item.rating) && item.rating >= 1 && item.rating <= 10).length,
  tokenStatuses: enrichedItems.filter((item) => ["已发币", "未发币"].includes(item.tokenStatus)).length,
  issuedTokens: enrichedItems.filter((item) => item.tokenStatus === "已发币").length
};

if (stats.items !== 162 || stats.descriptions !== 162 || stats.ratings !== 162 || stats.tokenStatuses !== 162) {
  throw new Error(`Enrichment completeness check failed: ${JSON.stringify(stats)}`);
}
console.log(JSON.stringify(stats, null, 2));
