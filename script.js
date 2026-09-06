const menuButton = document.querySelector(".menu-button");
const mobileMenu = document.querySelector("#mobile-menu");
const contactForm = document.querySelector(".contact-form");
const themeButtons = document.querySelectorAll(".theme-toggle, .mobile-theme-toggle");
const langButtons = document.querySelectorAll(".lang-toggle, .mobile-lang-toggle");
const powerCanvas = document.querySelector("#power-law-canvas");
const powerModelMenu = document.querySelector(".power-model-menu");
const powerModelToggle = document.querySelector("#power-model-toggle");
const powerModelLabel = document.querySelector("#power-model-label");
const powerModelDot = powerModelToggle?.querySelector(".model-dot");
const powerModelOptions = document.querySelectorAll("[data-model-option]");
const powerMetricsPanel = document.querySelector("#power-metrics-panel");
const powerMetricsToggle = document.querySelector("#power-metrics-toggle");
const alphaWalletForm = document.querySelector("#alpha-wallet-form");
const alphaWalletInput = document.querySelector("#alpha-wallet");
const alphaWalletLabel = document.querySelector("#alpha-wallet-label");
const alphaScore = document.querySelector("#alpha-score");
const alphaCost = document.querySelector("#alpha-cost");
const alphaTime = document.querySelector("#alpha-time");
const alphaRisk = document.querySelector("#alpha-risk");
const alphaMissionList = document.querySelector("#alpha-mission-list");
const alphaProjectLibrary = document.querySelector("#alpha-project-library");
const alphaQuadrantMap = document.querySelector(".quadrant-map");
const walletScanTitle = document.querySelector("#wallet-scan-title");
const walletScanSummary = document.querySelector("#wallet-scan-summary");
const walletProtocols = document.querySelector("#wallet-protocols");
const walletChains = document.querySelector("#wallet-chains");
const walletAirdrops = document.querySelector("#wallet-airdrops");
const walletRiskTags = document.querySelector("#wallet-risk-tags");
const ALPHA_FEED_REFRESH_MS = 12 * 60 * 60 * 1000;
const ALPHA_PROJECTS_PER_PAGE = 9;
let alphaFeedIntervalId = null;
let alphaProjectSortMode = "score";
let alphaProjectSearchQuery = "";
let alphaProjectPage = 1;
let alphaFeedMode = "x";
let alphaContentFeedSort = "newest";
let alphaContentFeedSearch = "";
let alphaLatestXFeedItems = [];
let alphaLatestXFeedUpdatedAt = null;
let alphaLatestXFeedOptions = {};
let alphaQuadrantScatterTimer = null;
const ALPHA_REMOVED_STORAGE_KEY = "alphaops-removed-projects";
const ALPHA_PENDING_STORAGE_KEY = "alphaops-pending-projects";
const ALPHA_MAIN_STORAGE_KEY = "alphaops-main-projects";
const ALPHA_HIDDEN_PENDING_STORAGE_KEY = "alphaops-hidden-pending-projects";
const ALPHA_REMOVED_ITEMS_STORAGE_KEY = "alphaops-removed-items";
const ALPHA_TUTORIALS_STORAGE_KEY = "alphaops-tutorials";
const ALPHA_COMMENTS_STORAGE_KEY = "alphaops-comments";
const ALPHA_CONTENT_TOMBSTONES_STORAGE_KEY = "alphaops-content-tombstones";
const ALPHA_SERVER_SYNC_ENDPOINT = "/api/alphaops-projects";
let alphaRemovedProjects = [];
let alphaManualPendingProjects = [];
let alphaManualMainProjects = [];
let alphaHiddenPendingProjects = [];
let alphaRemovedItems = [];
let alphaTutorials = [];
let alphaComments = [];
let alphaContentTombstones = [];
let alphaServerSyncTimer = null;
let alphaServerSyncStatus = "idle";
let alphaServerSyncLabel = "服务器同步待命";

try {
  alphaRemovedProjects = JSON.parse(localStorage.getItem(ALPHA_REMOVED_STORAGE_KEY) || "[]");
} catch (error) {
  alphaRemovedProjects = [];
}

try {
  alphaManualPendingProjects = JSON.parse(localStorage.getItem(ALPHA_PENDING_STORAGE_KEY) || "[]");
} catch (error) {
  alphaManualPendingProjects = [];
}

try {
  alphaManualMainProjects = JSON.parse(localStorage.getItem(ALPHA_MAIN_STORAGE_KEY) || "[]");
} catch (error) {
  alphaManualMainProjects = [];
}

try {
  alphaHiddenPendingProjects = JSON.parse(localStorage.getItem(ALPHA_HIDDEN_PENDING_STORAGE_KEY) || "[]");
} catch (error) {
  alphaHiddenPendingProjects = [];
}

try {
  alphaRemovedItems = JSON.parse(localStorage.getItem(ALPHA_REMOVED_ITEMS_STORAGE_KEY) || "[]");
} catch (error) {
  alphaRemovedItems = [];
}

try {
  alphaTutorials = JSON.parse(localStorage.getItem(ALPHA_TUTORIALS_STORAGE_KEY) || "[]");
} catch (error) {
  alphaTutorials = [];
}

try {
  alphaComments = JSON.parse(localStorage.getItem(ALPHA_COMMENTS_STORAGE_KEY) || "[]");
} catch (error) {
  alphaComments = [];
}

try {
  alphaContentTombstones = JSON.parse(localStorage.getItem(ALPHA_CONTENT_TOMBSTONES_STORAGE_KEY) || "[]");
} catch (error) {
  alphaContentTombstones = [];
}

const alphaTrackedProjects = [
  { name: "Nava AI", status: "830 万美元种子轮融资", x: "https://x.com/navaai", site: "", note: "Nava AI 团队介绍" },
  { name: "Oh", status: "产品已上线", x: "https://x.com/ohdotxyz", site: "", note: "成人 AI 初创企业" },
  { name: "Splyce Finance", status: "产品已上线", x: "https://x.com/SplyceFi", site: "", note: "Sui 与 Solana 战略投资的借贷平台" },
  { name: "MYRIAD", status: "积分活动中", x: "https://x.com/MidasRWA", site: "https://myriad.markets/?rC=FKKu8u", note: "USD1 驱动的预测市场" },
  { name: "Midas", status: "产品已上线", x: "https://x.com/MidasRWA", site: "https://midas.app/products", note: "RWA 新秀" },
  { name: "Shelby", status: "产品已上线", x: "https://x.com/shelbyserves", site: "", note: "对标 Walrus - Aptos 新布局" },
  { name: "Poseidon", status: "产品已上线", x: "https://x.com/poseidonlabs", site: "https://app.numolabs.ai/login?ref=ZDT7DBBE", note: "$IP 生态太子波塞冬" },
  { name: "Legion", status: "产品已上线", x: "https://x.com/legiondotcc", site: "https://app.legion.cc?homie=6UK1VMRA", note: "Kraken 半官方发射台" },
  { name: "BetterPaymentNetwork", status: "YZi Labs 领投 BPN 5000 万美元", x: "https://x.com/bpn_network", site: "", note: "币安嫡系支付网络" },
  { name: "Axiom", status: "产品已上线", x: "https://x.com/AxiomExchange", site: "https://axiom.trade/@welinkbtc", note: "潜在史诗级大毛" },
  { name: "Eternis", status: "仅推特运营", x: "https://x.com/eternisai", site: "", note: "前 Binance Labs 投资总监的新项目" },
  { name: "Arc", status: "公开测试网上线", x: "https://x.com/arc", site: "", note: "Circle 旗下 L1" },
  { name: "Railnet", status: "产品已上线", x: "https://x.com/railnet_org", site: "", note: "Kiln 的开放收益层" },
  { name: "UMA", status: "种子轮估值超 45 亿美元", x: "https://x.com/UMA_Robots", site: "", note: "机器人赛道新贵" },
  { name: "Fomo", status: "产品已上线", x: "https://x.com/fomo", site: "https://fomo.family/r/welinkBTC", note: "Delphi 看好的消费级应用" },
  { name: "Theo", status: "产品已上线", x: "https://x.com/Theo_Network", site: "https://app.theo.xyz/referrals?invite=welinkbtc", note: "1 亿美元注资背后的金融蓝图" },
  { name: "Nansen", status: "积分活动中", x: "https://x.com/nansen_ai", site: "https://app.nansen.ai/r/qE5JIxOgV6o", note: "Nansen 会发币吗？" },
  { name: "Surf", status: "产品已上线", x: "https://x.com/SurfAI", site: "https://asksurf.ai/?r=welinkBTC", note: "Pantera 领投 1500 万美元" },
  { name: "Jarsy", status: "产品已上线", x: "https://x.com/JarsyInc", site: "https://app.jarsy.com/", note: "Pre IPO 新玩法" },
  { name: "Rocket", status: "150 万美元融资", x: "https://x.com/userocket_app", site: "", note: "前 Genie 核心班底打造" },
  { name: "Rialo", status: "2000 万美元初始轮融资", x: "https://x.com/RialoHQ", site: "", note: "Sui 基因，新公链" },
  { name: "Protege", status: "3000 万美元 A 轮融资", x: "https://x.com/withprotegeai", site: "", note: "Datavant 创始人再创业项目" },
  { name: "Coinpilot", status: "产品已上线", x: "https://x.com/trycoinpilot", site: "https://refer.coinpilot.com/0604fe", note: "Moongate 二次创业" },
  { name: "Voyage", status: "产品已上线", x: "https://x.com/onvoyage_ai", site: "", note: "下一个 Kaito?" },
  { name: "Liquid", status: "产品已上线", x: "https://x.com/liquidtrading", site: "https://referral.tryliquid.xyz/CnqcGFBxU0b", note: "万物皆可杠杆" },
  { name: "42space", status: "产品已上线", x: "https://x.com/42space", site: "https://42.space/join/8StJsivt", note: "事件期货市场" },
  { name: "Hibachi", status: "积分活动中", x: "https://x.com/hibachi_xyz", site: "https://hibachi.xyz/r/L7GSLB3YMI", note: "Hashflow 联创再创业项目" },
  { name: "Akave", status: "融资 665 万美元", x: "https://x.com/akavenetwork", site: "", note: "前 Protocol Labs 成员再创业项目" },
  { name: "xStocks", status: "产品已上线", x: "https://x.com/xStocksFi", site: "https://defi.xstocks.fi/points?ref=6UJAXT76", note: "Payward 商业版图相关资产" },
  { name: "VeryAI", status: "1000 万美元种子轮融资", x: "https://x.com/VeryAI", site: "", note: "VeryAI 介绍" },
  { name: "Self Protocol", status: "产品已上线", x: "https://x.com/selfxyz", site: "https://referral.self.xyz/referral/0xa5bDe3CC5cF6BBF86972BbD7C248de6fCa2CE96d", note: "Celo 拆分盘观察" },
  { name: "Lana", status: "产品已上线", x: "https://x.com/LanaAI", site: "https://www.lana.ai/", note: "AI 原生 Solana 浏览器" },
  { name: "XO", status: "产品已上线", x: "https://x.com/xomarket", site: "", note: "人人可创建的市场" },
  { name: "Blockstreet", status: "被 AI Financial 以 4300 万美元收购", x: "https://x.com/BlockStreetXYZ", site: "", note: "USD1 原生发射台" },
  { name: "WorldClaw", status: "产品已上线", x: "https://x.com/WorldClawAI", site: "", note: "基于 WLFI 的 AI Agent 基建" },
  { name: "Amplifi", status: "产品已上线", x: "https://x.com/useamplifi", site: "https://app.amplifi.finance/?invite=AMP-SVXQ", note: "预测市场杠杆平台" },
  { name: "BULK", status: "产品已上线", x: "https://x.com/bulktrade", site: "https://early.bulk.trade/deposit?ref=welinkbtc", note: "Solana 自己的 Hyperliquid" },
  { name: "Dreamcash", status: "产品已上线", x: "https://x.com/Dreamcash", site: "https://dreamcash.xyz/share?code=4PL7NK", note: "tradexyz 最佳平替" },
  { name: "Elastics", status: "内部测试网上线", x: "https://x.com/ElasticsAI", site: "", note: "基于自然语言的预测市场策略部署" },
  { name: "Osero", status: "1350 万美元融资", x: "https://x.com/OseroHQ", site: "", note: "Sky 嫡系储蓄平台" },
  { name: "BasedAI", status: "早期关注", x: "https://x.com/BasedAI_co", site: "", note: "开源 AI 基建 - Venice 联创新项目" },
  { name: "Möbius", status: "YZi Labs 领投战略轮", x: "https://x.com/MobiusExchange", site: "", note: "链上 Prime Brokerage" },
  { name: "CrowdBrains", status: "早期关注", x: "https://x.com/crowdbrainai", site: "", note: "Solana 黑客松冠军；分布式机器人网络" },
  { name: "AntSeed", status: "产品已上线", x: "https://x.com/AntSeedAI", site: "", note: "对标 OpenRouter?" },
  { name: "TurboFlow", status: "600 万美元种子轮融资", x: "https://x.com/TurboFlow_xyz", site: "https://www.tf.xyz/join?r=G8KV10", note: "亚太版 Kalshi" },
  { name: "Cestus Network", status: "仅推特运营", x: "https://x.com/CestusNetwork", site: "", note: "去中心化版 OpenRouter" },
  { name: "ambient.xyz", status: "产品已上线", x: "https://x.com/ambient_xyz", site: "", note: "PoW L1" },
  { name: "Creao AI", status: "产品已上线", x: "https://x.com/CreaoAI", site: "https://agent.creao.ai/signup?ref=kBDbYGNY", note: "AI 超级代理" },
  { name: "Openstock", status: "产品已上线", x: "https://x.com/OpenstockInc", site: "", note: "资本市场的链上接入层" },
  { name: "Pluralis Research", status: "早期关注", x: "https://x.com/Pluralis", site: "", note: "去中心化 AI 训练" },
  { name: "Arcus", status: "产品已上线", x: "https://x.com/arcus_xyz", site: "", note: "Arcus 前世今身" },
  { name: "Legend", status: "产品已上线", x: "https://x.com/legendtrade", site: "https://app.legend.trade/r/KIKM0J9T", note: "社交向 perp" },
  { name: "MOJO", status: "早期关注", x: "https://x.com/MojoAI_HQ", site: "", note: "MOJO 团队介绍" },
  { name: "rialto", status: "产品已上线", x: "https://x.com/rialto_xyz", site: "", note: "rialto 介绍" },
  { name: "Second Tier", status: "早期关注", x: "https://x.com/tier_xyz", site: "", note: "Second Tier 介绍" }
];
const translations = {
  zh: {
    "nav.network": "网络",
    "nav.products": "产品",
    "nav.research": "研究",
    "nav.alphaops": "AlphaOps",
    "nav.alpharadar": "Alpha Radar",
    "nav.dashboard": "链上看板",
    "nav.contact": "联系",
    "tools.theme": "深色",
    "tools.themeLight": "浅色",
    "tools.binanceChat": "币安聊天室",
    "tools.support": "支持",
    "hero.eyebrow": "Bitcoin intelligence / custody / settlement",
    "hero.title": "把比特币市场信号连接到真实执行。",
    "hero.text": "welinkBTC 是面向机构、矿工和高净值用户的ai agent，用极简的surf数据指标呈现行情洞察、OTC 服务、资产托管和 API 能力。",
    "hero.primary": "查看能力",
    "hero.secondary": "阅读市场简报",
    "terminal.hashrate": "Network Hashrate",
    "terminal.live": "live",
    "terminal.tight": "tight",
    "metrics.volume": "24H Volume",
    "metrics.settlement": "Settlement",
    "metrics.storage": "Cold Storage",
    "metrics.coverage": "Coverage",
    "network.eyebrow": "Network",
    "network.visualTitle": "链上关系 · 资产表现",
    "network.visualNote": "界面截图 · 非实时数据",
    "network.title": "一个面向比特币业务的可信连接层。",
    "network.text": "系统聚合展示加密金融服务、链上数据工具、矿业服务商与 BTC 投研能力。它用清晰的内容节奏帮助访问者快速理解你是谁、你解决什么问题，以及如何开始合作。",
    "features.otc": "为大额 BTC 买卖展示询价、做市、法币通道和结算能力。",
    "features.custody": "MPC、多签、冷热分层和企业权限流，适合托管业务落地页。",
    "features.signals": "展示链上指标、资金流、矿工行为和宏观风险的研究入口。",
    "features.api": "面向量化团队的报价、订单、风控和回调接口展示模块。",
    "power.subtitle": "链上趋势快照",
    "power.view": "View 视图",
    "power.model": "Indicator 指标",
    "power.modelName": "关键成本基础定价模型",
    "power.period": "Period 周期",
    "power.live": "实时链上快照",
    "power.project": "↗ Project 项目",
    "power.summary": "✧ AI Summary 人工智能总结",
    "power.download": "⇩ Download 下载",
    "power.metricsTitle": "关键成本基础定价模型",
    "power.current": "Current Price 现行价格",
    "power.modelValue": "Model Value 模型价值",
    "power.deviation": "Deviation 偏离",
    "power.upper": "Upper Band 上层波段",
    "power.lower": "Lower Band 下层",
    "power.years": "Years Running 历年历史",
    "power.eyebrow": "链上数据指标",
    "power.title": "用周期估值、链上行为、矿工压力、衍生品与资金流回答一个问题：比特币现在处于什么位置。",
    "power.topicCycle": "周期估值",
    "power.topicBehavior": "链上行为",
    "power.topicMiners": "矿工压力",
    "power.topicDerivatives": "衍生品",
    "power.topicFlows": "资金流",
    "power.copy1": "指标菜单与链上看板保持一致，切换指标即可加载对应的公开日频序列、参考阈值和最新快照。",
    "power.copy2": "时间跨度统一为 7D、30D、90D、1Y 与 ALL，方便在首页快速比较短期变化和完整周期结构。",
    "power.copy3": "开启 Glow 后会为当前指标的每条折线添加独立光亮效果，同时保留原始数据比例和阈值位置。",
    "ops.eyebrow": "Operating System",
    "ops.title": "从信号、报价到清算，保持同一个工作台。",
    "ops.ingest": "链上数据、交易所深度、宏观事件与内部订单流。",
    "ops.decide": "把风险、流动性和敞口聚合成可行动的市场视图。",
    "ops.execute": "通过 OTC、API 或托管流程完成交割和审计。",
    "research.eyebrow": "Research Desk",
    "research.pill": "Expert Insights",
    "research.title": "welinkBTC On-Chain-Main Research",
    "research.text": "深度拆解宏观周期、BTC 链上指标与市场结构，为严肃市场参与者提供每周研究。",
    "research.subscribers": "Subscribers",
    "research.articles": "Articles",
    "research.cardTitle": "Never miss an article",
    "research.cardText": "加入专业订阅者，第一时间收到更锐利的市场分析。",
    "research.benefit1": "完整文章访问",
    "research.benefit2": "每周研究通讯",
    "research.benefit3": "无广告干扰",
    "research.subscribe": "Subscribe Here →",
    "research.join": "Join 8,000+ professionals",
    "research.listTitle": "让研究内容像产品一样可信。",
    "research.article1": "ETF 资金流、矿工储备与下一轮信用窗口",
    "research.article2": "波动率冲击后，长期持有者行为如何变化",
    "research.article3": "胜率极高的MACD三重背离与ICT、PA共振反转模型",
    "contact.eyebrow": "Get in touch / 联系",
    "contact.title": "Let's talk.",
    "contact.text": "聊聊 AI、BTC 链上数据、OTC 或者一起搞点事情。",
    "contact.available": "当前开放合作 · Available",
    "contact.wechat": "微信群 / WeChat",
    "contact.soon": "敬请期待",
    "contact.opening": "即将开放",
    "form.email": "邮箱",
    "form.need": "需求",
    "form.submit": "发送请求",
    "form.received": "已收到",
    "footer.tagline": "Bitcoin intelligence template",
    "footer.top": "Back to top"
  },
  en: {
    "nav.network": "Network",
    "nav.products": "Products",
    "nav.research": "Research",
    "nav.alphaops": "AlphaOps",
    "nav.alpharadar": "Alpha Radar",
    "nav.dashboard": "Dashboard",
    "nav.contact": "Contact",
    "tools.theme": "Dark",
    "tools.themeLight": "Light",
    "tools.binanceChat": "Binance Chat",
    "tools.support": "Support",
    "hero.eyebrow": "Bitcoin intelligence / custody / settlement",
    "hero.title": "Connect Bitcoin market signals to real execution.",
    "hero.text": "welinkBTC is a website template for institutions, miners and high-net-worth clients, presenting market intelligence, OTC services, custody and API capabilities with a sharp monochrome system.",
    "hero.primary": "Explore Stack",
    "hero.secondary": "Read Market Brief",
    "terminal.hashrate": "Network Hashrate",
    "terminal.live": "live",
    "terminal.tight": "tight",
    "metrics.volume": "24H Volume",
    "metrics.settlement": "Settlement",
    "metrics.storage": "Cold Storage",
    "metrics.coverage": "Coverage",
    "network.eyebrow": "Network",
    "network.visualTitle": "On-chain connections · Asset performance",
    "network.visualNote": "Interface screenshot · Not live data",
    "network.title": "A trusted connection layer for Bitcoin businesses.",
    "network.text": "The system brings together crypto financial services, on-chain data products, mining providers and BTC research capabilities. Its clear content rhythm helps visitors understand who you are, what problem you solve and how to start working with you.",
    "features.otc": "Showcase RFQ, market making, fiat rails and settlement for large BTC orders.",
    "features.custody": "MPC, multisig, cold-hot segregation and enterprise permission flows for custody landing pages.",
    "features.signals": "Present on-chain metrics, fund flows, miner behavior and macro risk research.",
    "features.api": "Display quote, order, risk and callback APIs for quantitative trading teams.",
    "power.subtitle": "On-Chain Trend Snapshots",
    "power.view": "View",
    "power.model": "Indicator",
    "power.modelName": "Key Cost-Basis Pricing Models",
    "power.period": "Period",
    "power.live": "LIVE ON-CHAIN SNAPSHOT",
    "power.project": "↗ Project",
    "power.summary": "✧ AI Summary",
    "power.download": "⇩ Download",
    "power.metricsTitle": "Key Cost-Basis Pricing Models",
    "power.current": "Current Price",
    "power.modelValue": "Model Value",
    "power.deviation": "Deviation",
    "power.upper": "Upper Band",
    "power.lower": "Lower Band",
    "power.years": "Years Running",
    "power.eyebrow": "On-chain data indicators",
    "power.title": "Use cycle valuation, on-chain behavior, miner pressure, derivatives and capital flows to answer one question: where is Bitcoin now?",
    "power.topicCycle": "Cycle valuation",
    "power.topicBehavior": "On-chain behavior",
    "power.topicMiners": "Miner pressure",
    "power.topicDerivatives": "Derivatives",
    "power.topicFlows": "Capital flows",
    "power.copy1": "The indicator menu mirrors the on-chain dashboard, loading the matching public daily series, reference threshold and latest snapshot.",
    "power.copy2": "Time ranges are synchronized at 7D, 30D, 90D, 1Y and ALL for quick comparison between short-term moves and full-cycle structure.",
    "power.copy3": "Glow adds a dedicated light effect to every active chart line without changing the underlying scale or threshold position.",
    "ops.eyebrow": "Operating System",
    "ops.title": "Keep signals, quotes and clearing in one workspace.",
    "ops.ingest": "On-chain data, exchange depth, macro events and internal order flow.",
    "ops.decide": "Aggregate risk, liquidity and exposure into an actionable market view.",
    "ops.execute": "Complete delivery and audit through OTC, API or custody workflows.",
    "research.eyebrow": "Research Desk",
    "research.pill": "Expert Insights",
    "research.title": "welinkBTC On-Chain-Main Research",
    "research.text": "Deep dives, macro analysis, and on-chain metrics decoded. Don't miss our weekly publications designed for serious market participants.",
    "research.subscribers": "Subscribers",
    "research.articles": "Articles",
    "research.cardTitle": "Never miss an article",
    "research.cardText": "Join professional subscribers getting the sharpest market analysis delivered directly to your inbox.",
    "research.benefit1": "Full article access",
    "research.benefit2": "Weekly newsletters",
    "research.benefit3": "No advertisements",
    "research.subscribe": "Subscribe Here →",
    "research.join": "Join 8,000+ professionals",
    "research.listTitle": "Make research feel as trusted as the product.",
    "research.article1": "ETF flow, miner reserves and the next liquidity window",
    "research.article2": "Reading long-term holder behavior after volatility spikes",
    "research.article3": "High-probability MACD triple divergence with ICT and PA reversal confluence",
    "contact.eyebrow": "Get in touch / Contact",
    "contact.title": "Let's talk.",
    "contact.text": "Let's talk AI, BTC on-chain data, OTC, or build something useful together.",
    "contact.available": "Currently open for collaboration · Available",
    "contact.wechat": "WeChat Group",
    "contact.soon": "Coming soon",
    "contact.opening": "Opening soon",
    "form.email": "Email",
    "form.need": "Need",
    "form.submit": "Send Request",
    "form.received": "Received",
    "footer.tagline": "Bitcoin intelligence template",
    "footer.top": "Back to top"
  }
};

let currentLanguage = localStorage.getItem("welinkbtc-language") || "zh";
let currentTheme = localStorage.getItem("welinkbtc-theme") || "dark";
const alphaOpsUiTranslator = document.querySelector(".alphaops-page") && window.WelinkUiTranslator
  ? window.WelinkUiTranslator.create({
      roots: [document.querySelector(".alphaops-page"), document.querySelector(".site-footer")],
      profile: "alphaops"
    })
  : null;

const getCopy = (key) => translations[currentLanguage][key] || translations.zh[key] || key;

const ensureAlphaOpsNav = () => {
  document.querySelectorAll('[data-i18n="nav.dashboard"]').forEach((dashboardLink) => {
    const parent = dashboardLink.parentElement;
    if (!parent || parent.querySelector('[data-i18n="nav.alphaops"]')) return;

    const alphaLink = document.createElement("a");
    alphaLink.href = "alphaops.html";
    alphaLink.dataset.i18n = "nav.alphaops";
    alphaLink.textContent = getCopy("nav.alphaops");
    parent.insertBefore(alphaLink, dashboardLink);
  });
};

const applyLanguage = () => {
  document.documentElement.lang = currentLanguage === "zh" ? "zh-CN" : "en";
  ensureAlphaOpsNav();
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = getCopy(element.dataset.i18n);
  });
  langButtons.forEach((button) => {
    button.textContent = currentLanguage === "zh" ? "EN" : "中";
    button.setAttribute("aria-label", currentLanguage === "zh" ? "Switch to English" : "切换到中文");
  });
  alphaOpsUiTranslator?.setLanguage(currentLanguage);
  applyTheme();
};

const applyTheme = () => {
  document.body.dataset.theme = currentTheme;
  const labelKey = currentTheme === "dark" ? "tools.themeLight" : "tools.theme";
  themeButtons.forEach((button) => {
    button.textContent = getCopy(labelKey);
    button.setAttribute("aria-label", currentTheme === "dark" ? "Switch to light theme" : "Switch to dark theme");
  });
  window.drawProductDashboard?.();
};

menuButton?.addEventListener("click", () => {
  const isOpen = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!isOpen));
  mobileMenu?.classList.toggle("is-open", !isOpen);
});

mobileMenu?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    menuButton?.setAttribute("aria-expanded", "false");
    mobileMenu.classList.remove("is-open");
  });
});

themeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentTheme = currentTheme === "dark" ? "light" : "dark";
    localStorage.setItem("welinkbtc-theme", currentTheme);
    applyTheme();
  });
});

langButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentLanguage = currentLanguage === "zh" ? "en" : "zh";
    localStorage.setItem("welinkbtc-language", currentLanguage);
    applyLanguage();
    window.updateProductDashboardLanguage?.();
  });
});

contactForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const button = contactForm.querySelector("button");
  if (!button) return;

  const originalText = getCopy("form.submit");
  button.textContent = getCopy("form.received");
  button.disabled = true;

  window.setTimeout(() => {
    button.textContent = originalText;
    button.disabled = false;
  }, 1800);
});

function pickWalletItems(pool, seed, minCount, maxCount) {
  const count = minCount + (seed % (maxCount - minCount + 1));
  return pool
    .map((item, index) => ({ item, rank: (seed * (index + 7) + index * 19) % 997 }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, count)
    .map(({ item }) => item);
}

function renderWalletList(target, items, formatter = (item) => item) {
  if (!target) return;
  target.innerHTML = items.map((item) => `<li>${formatter(item)}</li>`).join("");
}

alphaWalletForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const wallet = alphaWalletInput?.value.trim() || "";
  const seed = wallet.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const score = wallet ? 68 + (seed % 25) : 78;
  const completion = wallet ? 38 + (seed % 41) : 63;
  const cost = (2.4 + (seed % 42) / 10).toFixed(2);
  const minutes = 12 + (seed % 21);
  const risk = score > 86 ? "低" : score > 76 ? "中等" : "偏高";
  const shortWallet = wallet.length > 12 ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : wallet || "未连接钱包";
  const protocols = pickWalletItems([
    "Uniswap / Swap",
    "Aave / Lending",
    "LayerZero / Bridge",
    "Stargate / Cross-chain",
    "Pendle / Yield",
    "Hyperliquid / Perp",
    "Jupiter / DEX",
    "EigenLayer / Restaking",
    "Aerodrome / LP",
    "Safe / Multisig"
  ], seed || 11, 3, 6);
  const chains = pickWalletItems([
    "Ethereum",
    "Arbitrum",
    "Base",
    "Optimism",
    "Solana",
    "Sui",
    "Aptos",
    "BNB Chain",
    "Linea",
    "zkSync"
  ], seed || 17, 3, 6);
  const airdrops = pickWalletItems(alphaTrackedProjects, seed || 23, 4, 6)
    .map((project) => `${project.name} · ${project.status || "早期关注"}`);
  const tasks = pickWalletItems([
    ["缺失", "完成一次低成本跨链，优先选择 gas 低的 L2"],
    ["缺失", "使用借贷或流动性功能，留下真实交互记录"],
    ["待做", "参与治理投票、Discord 验证或社区反馈"],
    ["待做", "检查项目官方 Claim 域名，避免钓鱼授权"],
    ["可选", "发布一条项目研究或教程，沉淀贡献履历"],
    ["可选", "收藏高分项目并设置截止日期提醒"],
    ["缺失", "补齐一次稳定币转入与真实交易路径"],
    ["待做", "清理高风险无限授权，降低资产暴露"]
  ], seed || 31, 4, 6);
  const riskTags = pickWalletItems([
    "跨链活跃",
    "低 Gas 任务友好",
    "授权需复查",
    "交互链较分散",
    "稳定币路径完整",
    "合约风险中等",
    "疑似空投猎人画像",
    "贡献履历不足",
    "治理参与偏低",
    "适合大使任务"
  ], seed || 41, 3, 5);
  const primaryAirdrop = airdrops[0]?.split(" · ")[0] || "AlphaOps";
  const title = wallet
    ? `今日优先：补齐 ${primaryAirdrop} 的缺失交互与贡献记录`
    : "输入钱包地址，扫描今日最值得补齐的 Alpha 任务";
  const summary = wallet
    ? `扫描到 ${protocols.length} 类协议痕迹、${chains.length} 条活跃链，当前完成度 ${completion}%。`
    : "根据钱包历史生成今日任务，而不是让用户自己筛选。";
  const riskClass = risk === "低" ? "risk-low" : risk === "中等" ? "risk-mid" : "risk-high";

  if (alphaWalletLabel) alphaWalletLabel.textContent = shortWallet;
  if (alphaScore) alphaScore.textContent = String(score);
  if (alphaCost) alphaCost.textContent = `$${cost}`;
  if (alphaTime) alphaTime.textContent = `${minutes} 分钟`;
  if (alphaRisk) alphaRisk.textContent = risk;
  if (walletScanTitle) walletScanTitle.textContent = title;
  if (walletScanSummary) walletScanSummary.textContent = summary;
  renderWalletList(walletProtocols, wallet ? protocols : ["等待扫描"]);
  renderWalletList(walletChains, wallet ? chains : ["等待扫描"]);
  renderWalletList(walletAirdrops, wallet ? airdrops : ["等待扫描"]);
  renderWalletList(alphaMissionList, wallet ? tasks : tasks.slice(0, 3), ([status, task]) => `<em>${status}</em>${task}`);
  if (walletRiskTags) {
    walletRiskTags.innerHTML = `
      <span>风险标签</span>
      <div class="wallet-risk-chipline ${riskClass}">
        ${(wallet ? riskTags : ["未扫描"]).map((tag) => `<strong>${tag}</strong>`).join("")}
      </div>
    `;
  }

  const featured = document.querySelector(".mission-card.featured p");
  if (featured) featured.textContent = summary;
  renderAlphaProjectLibrary();
});

function clampScore(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function deterministicScore(seed, offset, min = 45, max = 92) {
  return Math.round(min + ((seed * (offset + 11) + offset * 37) % (max - min + 1)));
}

function growthScoreFromRatio(ratio) {
  return Math.round(clampScore(50 + 35 * Math.log(Math.max(0.18, ratio))));
}

function alphaPriority(score, riskPenalty, sourceRisk) {
  if (sourceRisk >= 25 || riskPenalty >= 32) return "风险观察";
  if (score >= 85) return "强 Alpha";
  if (score >= 70) return "今日优先";
  if (score >= 55) return "观察跟进";
  return "暂不投入";
}

function alphaProjectScore(project, index, walletSeed = 0) {
  const status = project.status || "";
  const note = project.note || "";
  const seed = project.name.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) + index * 29 + walletSeed;
  const hasFunding = /融资|领投|投资|估值|Labs|Pantera|YZi|Kraken|Circle|Protocol Labs|Datavant/i.test(status + note);
  const isLive = /产品已上线|公开测试网|测试网|积分活动/i.test(status);
  const hasCampaign = /积分|空投|大使|任务|测试网|发射台|Claim|role|白名单/i.test(status + note);
  const earlyOnly = /仅推特|早期关注/i.test(status);
  const noSite = !project.site;
  const suspiciousSource = ["Shelby", "CrowdBrains", "Poseidon", "MYRIAD", "Fomo"].includes(project.name);

  const fundingScore = clampScore(deterministicScore(seed, 1, 42, 86) + (hasFunding ? 14 : 0));
  const ecosystemScore = clampScore(deterministicScore(seed, 2, 48, 88) + (/Sui|Solana|Binance|Circle|Kraken|Aptos|WLFI|Protocol Labs/i.test(status + note) ? 10 : 0));
  const productScore = clampScore(deterministicScore(seed, 3, 42, 86) + (isLive ? 12 : 0) - (earlyOnly ? 10 : 0));
  const tokenOpportunityScore = clampScore(deterministicScore(seed, 4, 50, 92) + (/积分|空投|尚未发行|测试网|发射台/i.test(status + note) ? 10 : 0));
  const securityScore = clampScore(deterministicScore(seed, 5, 55, 90) - (noSite ? 9 : 0) - (suspiciousSource ? 14 : 0));
  const P = Math.round(0.30 * fundingScore + 0.20 * ecosystemScore + 0.20 * productScore + 0.20 * tokenOpportunityScore + 0.10 * securityScore);

  const activeUsersGrowthScore = growthScoreFromRatio(0.8 + ((seed % 140) / 100));
  const tvlOrVolumeGrowthScore = growthScoreFromRatio(0.75 + (((seed + 17) % 155) / 100));
  const feesOrRevenueGrowthScore = growthScoreFromRatio(0.7 + (((seed + 31) % 130) / 100));
  const holderOrDexBuyerGrowthScore = growthScoreFromRatio(0.78 + (((seed + 47) % 145) / 100));
  const retentionScore = deterministicScore(seed, 6, 45, 88);
  const G = Math.round(0.30 * activeUsersGrowthScore + 0.25 * tvlOrVolumeGrowthScore + 0.20 * feesOrRevenueGrowthScore + 0.15 * holderOrDexBuyerGrowthScore + 0.10 * retentionScore);

  const mindshareScore = clampScore(deterministicScore(seed, 7, 42, 90) + (/AI|预测|Hyperliquid|RWA|Solana|Sui/i.test(project.name + note) ? 8 : 0));
  const followerGrowthScore = deterministicScore(seed, 8, 44, 88);
  const engagementQualityScore = deterministicScore(seed, 9, 46, 90);
  const contributorDensityScore = clampScore(deterministicScore(seed, 10, 38, 84) + (hasCampaign ? 8 : 0));
  const S = Math.round(0.35 * mindshareScore + 0.25 * followerGrowthScore + 0.20 * engagementQualityScore + 0.20 * contributorDensityScore);

  const statusScore = clampScore(deterministicScore(seed, 11, 44, 86) + (hasCampaign ? 14 : 0) + (isLive ? 6 : 0));
  const openTaskScore = clampScore(deterministicScore(seed, 12, 42, 88) + (project.site ? 8 : 0));
  const costScore = deterministicScore(seed, 13, 55, 95);
  const timeScore = deterministicScore(seed, 14, 50, 92);
  const rewardClarityScore = clampScore(deterministicScore(seed, 15, 40, 88) + (/积分|融资|领投|发射台/i.test(status + note) ? 7 : 0));
  const sourceTrustScore = clampScore(deterministicScore(seed, 16, 50, 90) - (noSite ? 10 : 0) - (suspiciousSource ? 16 : 0));
  const C = Math.round(0.25 * statusScore + 0.20 * openTaskScore + 0.20 * costScore + 0.15 * timeScore + 0.10 * rewardClarityScore + 0.10 * sourceTrustScore);

  const requirementCoverageScore = deterministicScore(seed + walletSeed, 17, 36, 92);
  const chainFitScore = deterministicScore(seed + walletSeed, 18, 42, 92);
  const protocolFitScore = deterministicScore(seed + walletSeed, 19, 40, 90);
  const capitalReadinessScore = deterministicScore(seed + walletSeed, 20, 50, 95);
  const actionabilityScore = clampScore(deterministicScore(seed + walletSeed, 21, 46, 92) + (project.site ? 6 : -4));
  const W = Math.round(0.30 * requirementCoverageScore + 0.20 * chainFitScore + 0.20 * protocolFitScore + 0.15 * capitalReadinessScore + 0.15 * actionabilityScore);

  const eventProximityScore = clampScore(deterministicScore(seed, 22, 44, 90) + (hasCampaign ? 8 : 0));
  const recentUpdateScore = deterministicScore(seed, 23, 45, 90);
  const catalystStrengthScore = clampScore(deterministicScore(seed, 24, 42, 90) + (hasFunding ? 8 : 0));
  const narrativeFitScore = deterministicScore(seed, 25, 48, 92);
  const K = Math.round(0.35 * eventProximityScore + 0.25 * recentUpdateScore + 0.25 * catalystStrengthScore + 0.15 * narrativeFitScore);

  const sourceRisk = (noSite ? 9 : 0) + (suspiciousSource ? 18 : 0) + (earlyOnly ? 8 : 0);
  const costRisk = costScore < 62 ? 7 : 2;
  const sybilRisk = hasCampaign ? 5 + (seed % 8) : 3;
  const staleDataRisk = earlyOnly ? 10 : 3 + (seed % 5);
  const crowdingRisk = S > 78 ? 8 : S > 66 ? 5 : 2;
  const securityRisk = securityScore < 62 ? 9 : 3;
  const R = Math.min(40, sourceRisk + costRisk + sybilRisk + staleDataRisk + crowdingRisk + securityRisk);
  const rawScore = 0.25 * P + 0.20 * G + 0.15 * S + 0.15 * C + 0.15 * W + 0.10 * K - R;
  const manualScore = Number(project.score);
  const score = Number.isFinite(manualScore) && project.score !== "" ? Math.round(clampScore(manualScore)) : Math.round(clampScore(rawScore));
  const priority = alphaPriority(score, R, sourceRisk);
  const topDrivers = [
    [P, "项目质量"],
    [G, "链上增长"],
    [S, "社区热度"],
    [C, "活动质量"],
    [W, "钱包匹配"],
    [K, "催化剂"]
  ].sort((a, b) => b[0] - a[0]).slice(0, 2).map(([value, label]) => `${label} ${value}`);
  const reasons = [
    `${topDrivers.join(" / ")} 是主要加分项。`,
    score >= 70 ? "进入可执行机会池，适合安排今日任务。" : "仍需等待更清晰的任务或链上增长信号。"
  ];
  const missingTasks = [
    project.site ? "完成官网/任务入口的一次低成本交互" : "补充官方任务入口，先不要连接高价值钱包",
    hasCampaign ? "补齐积分、role 或大使贡献记录" : "持续观察是否开放积分、空投或大使活动",
    W < 70 ? "补足活跃链与协议行为，让钱包更接近资格" : "复查授权并保留可验证贡献证据"
  ];
  const riskTips = [
    sourceRisk >= 25 ? "来源风险较高，只进入风险观察，不进入每日推荐。" : "优先使用官方链接，避免第三方 Claim 页面。",
    R >= 28 ? "风险扣分偏高，建议小额钱包先试。" : "风险可控，但仍需检查授权和活动截止时间。"
  ];

  return {
    score,
    priority,
    reasons,
    missingTasks,
    riskTips,
    components: { P, G, S, C, W, K, R },
    subScores: {
      fundingScore,
      ecosystemScore,
      productScore,
      tokenOpportunityScore,
      securityScore,
      activeUsersGrowthScore,
      tvlOrVolumeGrowthScore,
      feesOrRevenueGrowthScore,
      holderOrDexBuyerGrowthScore,
      retentionScore,
      mindshareScore,
      followerGrowthScore,
      engagementQualityScore,
      contributorDensityScore,
      statusScore,
      openTaskScore,
      costScore,
      timeScore,
      rewardClarityScore,
      sourceTrustScore,
      requirementCoverageScore,
      chainFitScore,
      protocolFitScore,
      capitalReadinessScore,
      actionabilityScore,
      eventProximityScore,
      recentUpdateScore,
      catalystStrengthScore,
      narrativeFitScore,
      sourceRisk,
      costRisk,
      sybilRisk,
      staleDataRisk,
      crowdingRisk,
      securityRisk
    }
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function alphaXHandle(project) {
  return project.x?.match(/x\.com\/([^/?#]+)/i)?.[1] || "";
}

function alphaProjectInitials(name) {
  const words = String(name || "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "A";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function alphaProjectHue(name) {
  const seed = String(name || "").split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return seed % 360;
}

function alphaProjectIcon(project) {
  if (project.icon) return project.icon;
  const handle = alphaXHandle(project);
  return handle ? `https://unavatar.io/x/${encodeURIComponent(handle)}` : "";
}

function formatAlphaFeedAge(timestamp) {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时`;
  return `${Math.round(hours / 24)} 天`;
}

function alphaSafeExternalUrl(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch (error) {
    return "";
  }
}

function alphaContentProject(name) {
  const key = String(name || "").trim().toLowerCase();
  return [
    ...alphaTrackedProjects,
    ...alphaManualMainProjects,
    ...alphaManualPendingProjects,
    ...alphaRemovedItems
  ].find((project) => String(project?.name || "").trim().toLowerCase() === key) || { name };
}

function alphaContentCount(records, projectName) {
  const key = String(projectName || "").trim().toLowerCase();
  return records.filter((record) => String(record.project || "").trim().toLowerCase() === key).length;
}

function alphaContentTimestamp(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "刚刚";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function alphaTutorialPlatform(url) {
  const safeUrl = alphaSafeExternalUrl(url);
  if (!safeUrl) return "内容链接";
  const host = new URL(safeUrl).hostname.replace(/^www\./, "").toLowerCase();
  if (host === "x.com" || host === "twitter.com") return "X 长推";
  if (host.includes("youtube.com") || host === "youtu.be") return "YouTube";
  if (host.includes("medium.com")) return "Medium";
  if (host.includes("mirror.xyz")) return "Mirror";
  if (host.includes("binance.com")) return "Binance Square";
  if (host.includes("substack.com")) return "Substack";
  return host;
}

function alphaContentRecordId(prefix) {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${random}`;
}

function alphaContentRecords(mode) {
  return mode === "tutorials" ? alphaTutorials : alphaComments;
}

function alphaContentRecord(mode, id) {
  return alphaContentRecords(mode).find((record) => record.id === id);
}

function alphaRenderContentAvatar(projectName) {
  const project = alphaContentProject(projectName);
  const icon = alphaProjectIcon(project);
  return `
    <div class="alpha-x-avatar" style="--project-hue:${alphaProjectHue(projectName)}">
      ${icon ? `<img src="${escapeHtml(icon)}" alt="${escapeHtml(projectName)} icon" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()" />` : ""}
      <span>${escapeHtml(alphaProjectInitials(projectName))}</span>
    </div>
  `;
}

function renderAlphaContentFeed(mode) {
  const stream = document.querySelector("#alpha-x-feed-list");
  const meta = document.querySelector("#alpha-x-feed-meta");
  const status = document.querySelector("#alpha-x-feed-status");
  if (!stream) return;

  const search = alphaContentFeedSearch.trim().toLowerCase();
  const records = [...alphaContentRecords(mode)]
    .filter((record) => !search || [record.project, record.title, record.description, record.text, record.platform]
      .some((value) => String(value || "").toLowerCase().includes(search)))
    .sort((a, b) => {
      const delta = new Date(b.createdAt || b.updatedAt || 0) - new Date(a.createdAt || a.updatedAt || 0);
      return alphaContentFeedSort === "oldest" ? -delta : delta;
    });

  if (mode === "tutorials") {
    stream.innerHTML = records.length ? records.map((record) => {
      const safeUrl = alphaSafeExternalUrl(record.url);
      return `
        <article class="alpha-x-feed-card alpha-content-feed-card tutorial">
          ${alphaRenderContentAvatar(record.project)}
          <div class="alpha-x-feed-body">
            <div class="alpha-x-feed-top">
              <strong>${escapeHtml(record.project)}</strong>
              <span>${alphaContentTimestamp(record.createdAt)}</span>
              ${safeUrl ? `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer" aria-label="打开教程原文">↗</a>` : ""}
            </div>
            <em class="alpha-content-kind">${escapeHtml(record.platform || alphaTutorialPlatform(record.url))}</em>
            <h5>${escapeHtml(record.title)}</h5>
            ${record.description ? `<p>${escapeHtml(record.description)}</p>` : ""}
            <div class="alpha-content-card-actions">
              ${safeUrl ? `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">打开原文</a>` : ""}
              <button type="button" data-alpha-copy-content="${escapeHtml(safeUrl || record.title)}">复制链接</button>
              <button type="button" data-alpha-edit-content="tutorials:${escapeHtml(record.id)}">编辑</button>
              <button type="button" data-alpha-delete-content="tutorials:${escapeHtml(record.id)}">删除</button>
            </div>
          </div>
        </article>
      `;
    }).join("") : `
      <div class="alpha-x-feed-empty">
        <strong>教程集合尚未建立</strong>
        <p>在任一项目卡点击「教程指导」，添加 X 长推、视频或其他内容平台链接。</p>
      </div>
    `;
  } else {
    const sentimentLabels = { positive: "看好", neutral: "中性", caution: "谨慎" };
    stream.innerHTML = records.length ? records.map((record) => `
      <article class="alpha-x-feed-card alpha-content-feed-card comment">
        ${alphaRenderContentAvatar(record.project)}
        <div class="alpha-x-feed-body">
          <div class="alpha-x-feed-top">
            <strong>${escapeHtml(record.project)}</strong>
            <span>${alphaContentTimestamp(record.createdAt)}</span>
            <em class="alpha-comment-sentiment ${escapeHtml(record.sentiment || "neutral")}">${sentimentLabels[record.sentiment] || "中性"}</em>
          </div>
          <p class="alpha-comment-text">${escapeHtml(record.text)}</p>
          <div class="alpha-content-card-actions">
            <button type="button" data-alpha-copy-content="${escapeHtml(record.text)}">复制评论</button>
            <button type="button" data-alpha-edit-content="comments:${escapeHtml(record.id)}">编辑</button>
            <button type="button" data-alpha-delete-content="comments:${escapeHtml(record.id)}">删除</button>
          </div>
        </div>
      </article>
    `).join("") : `
      <div class="alpha-x-feed-empty">
        <strong>评论流暂无内容</strong>
        <p>在项目卡点击「评论」，留下研究判断、跟进结论或风险提醒。</p>
      </div>
    `;
  }

  if (meta) meta.textContent = `${records.length} 条${mode === "tutorials" ? "教程" : "评论"} · ${alphaContentFeedSort === "oldest" ? "最早优先" : "最新优先"}`;
  if (status) status.textContent = mode === "tutorials"
    ? "项目教程按发布时间整理，可搜索项目、主题或内容平台。"
    : "项目简评按发布时间整理，适合记录观点变化与风险结论。";
}

function renderActiveAlphaFeed() {
  document.querySelectorAll("[data-alpha-feed-mode]").forEach((button) => {
    const active = button.dataset.alphaFeedMode === alphaFeedMode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  const tools = document.querySelector("#alpha-content-feed-tools");
  if (tools) tools.hidden = alphaFeedMode === "x";
  const refreshButton = document.querySelector("#alpha-x-feed-refresh");
  if (refreshButton) refreshButton.hidden = alphaFeedMode !== "x";

  if (alphaFeedMode === "x") {
    renderAlphaFeed(alphaLatestXFeedItems, alphaLatestXFeedUpdatedAt || new Date().toISOString(), alphaLatestXFeedOptions);
  } else {
    renderAlphaContentFeed(alphaFeedMode);
  }
}

function openAlphaContentDialog(mode, projectName, recordId = "") {
  const dialog = document.querySelector("#alpha-content-dialog");
  const form = document.querySelector("#alpha-content-form");
  if (!dialog || !form) return;
  const record = recordId ? alphaContentRecord(mode, recordId) : null;
  form.reset();
  form.dataset.mode = mode;
  form.dataset.recordId = recordId;
  form.elements.project.value = projectName || record?.project || "";
  form.elements.title.value = record?.title || "";
  form.elements.url.value = record?.url || "";
  form.elements.description.value = record?.description || "";
  form.elements.text.value = record?.text || "";
  form.elements.sentiment.value = record?.sentiment || "neutral";
  form.querySelectorAll("[data-alpha-content-fields]").forEach((section) => {
    section.hidden = section.dataset.alphaContentFields !== mode;
  });
  form.elements.title.required = mode === "tutorials";
  form.elements.url.required = mode === "tutorials";
  form.elements.text.required = mode === "comments";
  const title = dialog.querySelector("#alpha-content-dialog-title");
  const eyebrow = dialog.querySelector("#alpha-content-dialog-eyebrow");
  if (eyebrow) eyebrow.textContent = projectName || record?.project || "AlphaOps 项目";
  if (title) title.textContent = `${record ? "编辑" : "添加"}${mode === "tutorials" ? "教程指导" : "项目评论"}`;
  dialog.showModal();
  const focusTarget = mode === "tutorials" ? form.elements.title : form.elements.text;
  window.setTimeout(() => focusTarget?.focus(), 30);
}

function submitAlphaContent(form) {
  const mode = form.dataset.mode || "tutorials";
  const recordId = form.dataset.recordId || "";
  const existing = recordId ? alphaContentRecord(mode, recordId) : null;
  const now = new Date().toISOString();
  const project = String(form.elements.project.value || "").trim();
  if (!project) return;

  if (mode === "tutorials") {
    const urlInput = form.elements.url;
    const safeUrl = alphaSafeExternalUrl(urlInput.value);
    if (!safeUrl) {
      urlInput.setCustomValidity("请输入有效的 http 或 https 内容链接");
      urlInput.reportValidity();
      return;
    }
    urlInput.setCustomValidity("");
    const record = {
      id: existing?.id || alphaContentRecordId("tutorial"),
      project,
      title: String(form.elements.title.value || "").trim(),
      url: safeUrl,
      description: String(form.elements.description.value || "").trim(),
      platform: alphaTutorialPlatform(safeUrl),
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    alphaTutorials = [record, ...alphaTutorials.filter((item) => item.id !== record.id)].slice(0, 500);
  } else {
    const record = {
      id: existing?.id || alphaContentRecordId("comment"),
      project,
      text: String(form.elements.text.value || "").trim(),
      sentiment: String(form.elements.sentiment.value || "neutral"),
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    if (!record.text) return;
    alphaComments = [record, ...alphaComments.filter((item) => item.id !== record.id)].slice(0, 500);
  }

  if (recordId) alphaContentTombstones = alphaContentTombstones.filter((id) => id !== recordId);
  alphaFeedMode = mode;
  saveAlphaContentState();
  document.querySelector("#alpha-content-dialog")?.close();
  renderAlphaProjectLibrary();
}

function deleteAlphaContent(mode, id) {
  if (!id) return;
  if (mode === "tutorials") alphaTutorials = alphaTutorials.filter((record) => record.id !== id);
  else alphaComments = alphaComments.filter((record) => record.id !== id);
  if (!alphaContentTombstones.includes(id)) alphaContentTombstones.push(id);
  saveAlphaContentState();
  renderAlphaProjectLibrary();
}

async function copyAlphaContent(value, button) {
  try {
    await navigator.clipboard.writeText(String(value || ""));
    const original = button.textContent;
    button.textContent = "已复制";
    window.setTimeout(() => { button.textContent = original; }, 1400);
  } catch (error) {
    button.textContent = "复制失败";
  }
}

function exportAlphaContent() {
  const records = alphaContentRecords(alphaFeedMode);
  const blob = new Blob([JSON.stringify(records, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `alphaops-${alphaFeedMode}-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function createAlphaFallbackFeed(projects) {
  const templates = [
    "发布了新的任务线索，建议优先核对官网、Claim 地址与钱包授权范围。",
    "出现新的社区讨论热度，适合补充长推、教程或大使贡献记录。",
    "链上交互窗口仍在，建议低成本完成一次真实产品使用记录。",
    "项目状态有更新，适合加入观察列表并设置截止日期提醒。",
    "近期关注度提升，建议重新检查积分、空投或大使活动入口。"
  ];

  return projects.slice(0, 18).map((project, index) => ({
    project: project.name,
    handle: alphaXHandle(project),
    text: templates[index % templates.length],
    url: project.x,
    avatar: project.name.slice(0, 2).toUpperCase(),
    timestamp: new Date(Date.now() - (index + 1) * 37 * 60000).toISOString(),
    fallback: true
  }));
}

function renderAlphaFeed(items, updatedAt = new Date().toISOString(), options = {}) {
  alphaLatestXFeedItems = Array.isArray(items) ? items : [];
  alphaLatestXFeedUpdatedAt = updatedAt;
  alphaLatestXFeedOptions = typeof options === "boolean" ? { fallback: options } : { ...options };
  if (alphaFeedMode !== "x") return;
  const stream = document.querySelector("#alpha-x-feed-list");
  const meta = document.querySelector("#alpha-x-feed-meta");
  const status = document.querySelector("#alpha-x-feed-status");
  if (!stream) return;

  const feedState = alphaLatestXFeedOptions;
  const sorted = [...items].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 24);
  stream.innerHTML = sorted.length ? sorted.map((item) => {
    const safeUrl = alphaSafeExternalUrl(item.url);
    return `
      <article class="alpha-x-feed-card">
        <div class="alpha-x-avatar">
          ${item.avatarUrl ? `<img src="${escapeHtml(item.avatarUrl)}" alt="${escapeHtml(item.project || "X")} avatar" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()" />` : ""}
          <span>${escapeHtml(item.avatar || item.project?.slice(0, 2) || "X")}</span>
        </div>
        <div class="alpha-x-feed-body">
          <div class="alpha-x-feed-top">
            <strong>${escapeHtml(item.project)}</strong>
            <span>${formatAlphaFeedAge(item.timestamp)}</span>
            ${safeUrl ? `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open X post">↗</a>` : ""}
          </div>
          <p>${escapeHtml(item.text)}</p>
        </div>
      </article>
    `;
  }).join("") : `
    <div class="alpha-x-feed-empty">
      <strong>暂未获取到最新推文</strong>
      <p>请确认项目池 X 链接可访问，或在 Vercel 中配置 X_BEARER_TOKEN 后刷新。</p>
    </div>
  `;

  if (meta) {
    const minuteAge = Math.max(0, Math.round((Date.now() - new Date(updatedAt).getTime()) / 60000));
    const sourceLabel = feedState.source === "x-api" ? "X API 实时源" : feedState.source === "rsshub" ? "备用公开源" : "项目池源";
    meta.textContent = `${feedState.totalHandles || 55} 个项目的最新推文 · ${sourceLabel} · 更新于 ${minuteAge || "刚刚"}${minuteAge ? " 分钟前" : ""}`;
  }

  if (status) {
    if (feedState.message) {
      status.textContent = feedState.message;
    } else if (feedState.source === "x-api") {
      status.textContent = "已按最新时间倒序同步，每 12 小时自动刷新。";
    } else {
      status.textContent = feedState.fallback ? "X 实时源暂不可用，当前展示项目池动态预览。" : "当前使用备用公开源，每 12 小时自动刷新。";
    }
  }
}

async function refreshAlphaFeed(projects) {
  if (document.hidden) return;
  const refreshButton = document.querySelector("#alpha-x-feed-refresh");
  refreshButton?.classList.add("is-loading");
  try {
    const handles = projects.map(alphaXHandle).filter(Boolean).join(",");
    const response = await fetch(`/api/alphaops-feed?handles=${encodeURIComponent(handles)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("feed unavailable");
    const data = await response.json();
    if (!Array.isArray(data.items)) throw new Error("feed unavailable");
    renderAlphaFeed(data.items, data.updatedAt, {
      source: data.source,
      message: data.message,
      configured: data.configured,
      totalHandles: data.handles || projects.map(alphaXHandle).filter(Boolean).length
    });
  } catch (error) {
    renderAlphaFeed(createAlphaFallbackFeed(projects), new Date().toISOString(), {
      fallback: true,
      source: "preview",
      message: "X 实时源暂不可用，当前展示项目池动态预览。",
      totalHandles: projects.map(alphaXHandle).filter(Boolean).length
    });
  } finally {
    refreshButton?.classList.remove("is-loading");
  }
}

function sortAlphaProjects(projects, mode) {
  return [...projects].sort((a, b) => {
    if (mode === "az") return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    if (mode === "quality") return b.alpha.components.P - a.alpha.components.P || b.alpha.score - a.alpha.score;
    if (mode === "social") return b.alpha.components.S - a.alpha.components.S || b.alpha.score - a.alpha.score;
    return b.alpha.score - a.alpha.score;
  });
}

function alphaHeatFlames(socialScore) {
  const score = Number(socialScore) || 0;
  if (score > 75) return 4;
  if (score > 70) return 3;
  if (score > 65) return 2;
  return 1;
}

function renderAlphaQuadrant(projects) {
  if (!alphaQuadrantMap) return;
  const topProjects = projects.slice(0, 64);
  if (alphaQuadrantScatterTimer) window.clearTimeout(alphaQuadrantScatterTimer);
  alphaQuadrantMap.innerHTML = `
    <span class="axis-x">关注拥挤度</span>
    <span class="axis-y">基本面动量</span>
    <span class="quadrant-zone zone-alpha">链上增长 / 注意力滞后</span>
    <span class="quadrant-zone zone-crowded">高热拥挤</span>
    <span class="quadrant-zone zone-watch">低拥挤观察</span>
    <span class="quadrant-zone zone-risk">高热低动量</span>
    ${topProjects.map((project, index) => {
      const { P, G, S, K, R } = project.alpha.components;
      const momentum = Math.round(0.62 * G + 0.38 * P);
      const reward = Math.round(0.45 * P + 0.25 * K + 0.30 * project.alpha.score);
      const x = Math.round(clampScore(S, 28, 92));
      const y = Math.round(clampScore(momentum, 18, 88));
      const size = Math.round(34 + (reward / 100) * 78);
      const riskHue = Math.round(138 - (Math.min(40, R) / 40) * 112);
      return `
        <i class="bubble alpha-bubble" style="left:${x}%; top:${100 - y}%; width:${size}px; height:${size}px; --risk-hue:${riskHue}; --bubble-delay:${index % 9};" title="${escapeHtml(project.name)} · 拥挤度 S ${S} · 动量 ${momentum} · 风险 R ${R}">
          <strong>${escapeHtml(project.name)}</strong>
          <small>${project.alpha.score}</small>
        </i>
      `;
    }).join("")}
  `;
  alphaQuadrantScatterTimer = window.setTimeout(scatterAlphaQuadrantBubbles, 10000);
}

function scatterAlphaQuadrantBubbles() {
  if (!alphaQuadrantMap) return;
  const bubbles = [...alphaQuadrantMap.querySelectorAll(".alpha-bubble")];
  const mapWidth = alphaQuadrantMap.clientWidth || 1;
  const mapHeight = alphaQuadrantMap.clientHeight || 1;
  bubbles.forEach((bubble) => {
    const radiusX = (bubble.offsetWidth / 2 / mapWidth) * 100;
    const radiusY = (bubble.offsetHeight / 2 / mapHeight) * 100;
    const minX = Math.max(7, radiusX + 2);
    const maxX = Math.min(93, 100 - radiusX - 2);
    const minY = Math.max(8, radiusY + 2);
    const maxY = Math.min(92, 100 - radiusY - 2);
    const x = minX + Math.random() * Math.max(1, maxX - minX);
    const y = minY + Math.random() * Math.max(1, maxY - minY);
    bubble.classList.add("is-scattered");
    bubble.style.left = `${x.toFixed(2)}%`;
    bubble.style.top = `${y.toFixed(2)}%`;
  });
}

const alphaBasePendingProjects = [
  { id: "base-monad-testnet", name: "Monad Testnet", reason: "待核验测试网任务入口与官方积分说明" },
  { id: "base-megaeth", name: "MegaETH", reason: "待确认生态任务是否开放给普通钱包" },
  { id: "base-berachain-apps", name: "Berachain Apps", reason: "待拆分官方应用、积分和风险链接" },
  { id: "base-abstract", name: "Abstract", reason: "待补充链上增长与社区贡献数据" }
];

function getAlphaServerState() {
  return {
    pending: alphaManualPendingProjects,
    main: alphaManualMainProjects,
    hiddenPending: alphaHiddenPendingProjects,
    removedItems: alphaRemovedItems,
    removedProjects: alphaRemovedProjects,
    tutorials: alphaTutorials,
    comments: alphaComments,
    contentTombstones: alphaContentTombstones,
    updatedAt: new Date().toISOString()
  };
}

function saveAlphaLocalState(sync = true) {
  localStorage.setItem(ALPHA_REMOVED_STORAGE_KEY, JSON.stringify(alphaRemovedProjects));
  localStorage.setItem(ALPHA_PENDING_STORAGE_KEY, JSON.stringify(alphaManualPendingProjects));
  localStorage.setItem(ALPHA_MAIN_STORAGE_KEY, JSON.stringify(alphaManualMainProjects));
  localStorage.setItem(ALPHA_HIDDEN_PENDING_STORAGE_KEY, JSON.stringify(alphaHiddenPendingProjects));
  localStorage.setItem(ALPHA_REMOVED_ITEMS_STORAGE_KEY, JSON.stringify(alphaRemovedItems));
  localStorage.setItem(ALPHA_TUTORIALS_STORAGE_KEY, JSON.stringify(alphaTutorials));
  localStorage.setItem(ALPHA_COMMENTS_STORAGE_KEY, JSON.stringify(alphaComments));
  localStorage.setItem(ALPHA_CONTENT_TOMBSTONES_STORAGE_KEY, JSON.stringify(alphaContentTombstones));
  if (sync) queueAlphaServerSync(0);
}

function alphaArray(value) {
  return Array.isArray(value) ? value : [];
}

function alphaProjectMergeKey(project) {
  if (!project || typeof project !== "object") return "";
  return String(project.name || project.id || "").trim().toLowerCase();
}

function mergeAlphaProjectArrays(localItems, serverItems) {
  const seen = new Set();
  return [...alphaArray(localItems), ...alphaArray(serverItems)].filter((project) => {
    const key = alphaProjectMergeKey(project);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeAlphaStringArrays(localItems, serverItems) {
  const seen = new Set();
  return [...alphaArray(localItems), ...alphaArray(serverItems)]
    .map((item) => String(item || "").trim())
    .filter((item) => {
      const key = item.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function mergeAlphaContentRecords(localItems, serverItems) {
  const records = new Map();
  [...alphaArray(serverItems), ...alphaArray(localItems)].forEach((record) => {
    const id = String(record?.id || "").trim();
    if (!id) return;
    const current = records.get(id);
    const currentTime = new Date(current?.updatedAt || current?.createdAt || 0).getTime();
    const nextTime = new Date(record.updatedAt || record.createdAt || 0).getTime();
    if (!current || nextTime >= currentTime) records.set(id, record);
  });
  return [...records.values()].sort((a, b) => (
    new Date(b.createdAt || b.updatedAt || 0).getTime()
    - new Date(a.createdAt || a.updatedAt || 0).getTime()
  ));
}

function alphaProjectNames(projects) {
  return new Set(alphaArray(projects)
    .map((project) => alphaProjectMergeKey(project))
    .filter(Boolean));
}

function alphaStringNames(items) {
  return new Set(alphaArray(items)
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean));
}

function alphaStateHasContent(state) {
  if (!state || typeof state !== "object") return false;
  return [
    state.pending,
    state.main,
    state.hiddenPending,
    state.removedItems,
    state.removedProjects,
    state.tutorials,
    state.comments,
    state.contentTombstones
  ].some((items) => alphaArray(items).length > 0);
}

function setAlphaServerSyncStatus(status, label) {
  alphaServerSyncStatus = status;
  alphaServerSyncLabel = label;
  const statusNode = document.querySelector("#alpha-sync-status");
  if (!statusNode) return;
  statusNode.dataset.status = status;
  statusNode.textContent = label;
}

function applyAlphaServerState(state) {
  if (!state || typeof state !== "object") return false;
  const serverState = {
    pending: alphaArray(state.pending),
    main: alphaArray(state.main),
    hiddenPending: alphaArray(state.hiddenPending),
    removedItems: alphaArray(state.removedItems),
    removedProjects: alphaArray(state.removedProjects),
    tutorials: alphaArray(state.tutorials),
    comments: alphaArray(state.comments),
    contentTombstones: alphaArray(state.contentTombstones)
  };
  const localState = getAlphaServerState();
  const serverHasContent = alphaStateHasContent(serverState);
  const localHasContent = alphaStateHasContent(localState);

  if (!serverHasContent && localHasContent) {
    saveAlphaLocalState(false);
    queueAlphaServerSync(0);
    return true;
  }

  const removedItemNames = new Set([
    ...alphaProjectNames(alphaRemovedItems),
    ...alphaProjectNames(serverState.removedItems)
  ]);
  alphaManualMainProjects = mergeAlphaProjectArrays(alphaManualMainProjects, serverState.main)
    .filter((project) => !removedItemNames.has(alphaProjectMergeKey(project)));
  const mainNames = alphaProjectNames(alphaManualMainProjects);
  alphaManualPendingProjects = mergeAlphaProjectArrays(alphaManualPendingProjects, serverState.pending)
    .filter((project) => !removedItemNames.has(alphaProjectMergeKey(project)))
    .filter((project) => !mainNames.has(alphaProjectMergeKey(project)));
  const activeNames = new Set([
    ...mainNames,
    ...alphaProjectNames(alphaManualPendingProjects)
  ]);
  alphaHiddenPendingProjects = mergeAlphaStringArrays(alphaHiddenPendingProjects, serverState.hiddenPending);
  alphaRemovedItems = mergeAlphaProjectArrays(alphaRemovedItems, serverState.removedItems)
    .filter((project) => !activeNames.has(alphaProjectMergeKey(project)));
  alphaRemovedProjects = mergeAlphaStringArrays(alphaRemovedProjects, serverState.removedProjects);
  alphaContentTombstones = mergeAlphaStringArrays(alphaContentTombstones, serverState.contentTombstones);
  const removedContentIds = new Set(alphaContentTombstones.map((id) => id.toLowerCase()));
  alphaTutorials = mergeAlphaContentRecords(alphaTutorials, serverState.tutorials)
    .filter((record) => !removedContentIds.has(String(record.id || "").toLowerCase()));
  alphaComments = mergeAlphaContentRecords(alphaComments, serverState.comments)
    .filter((record) => !removedContentIds.has(String(record.id || "").toLowerCase()));
  saveAlphaLocalState(false);
  setAlphaServerSyncStatus(serverHasContent ? "synced" : "idle", serverHasContent ? "已读取服务器项目" : "服务器同步待命");
  if (localHasContent) queueAlphaServerSync(0);
  return true;
}

async function persistAlphaServerState(options = {}) {
  const payload = JSON.stringify(getAlphaServerState());
  setAlphaServerSyncStatus("syncing", "正在保存到服务器");
  let errorLabel = "服务器同步失败";
  try {
    const response = await fetch(ALPHA_SERVER_SYNC_ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: Boolean(options.keepalive)
    });
    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null);
      const detail = String(errorPayload?.detail || errorPayload?.error || "");
      if (/suspended/i.test(detail)) errorLabel = "服务器存储已暂停";
      throw new Error(detail || `Sync failed: ${response.status}`);
    }
    setAlphaServerSyncStatus("synced", "已同步服务器");
    return true;
  } catch (error) {
    setAlphaServerSyncStatus("error", errorLabel);
    console.warn("AlphaOps server sync skipped.", error);
    return false;
  }
}

function queueAlphaServerSync(delayMs = 0) {
  if (!alphaProjectLibrary) return;
  setAlphaServerSyncStatus("syncing", "待保存到服务器");
  if (alphaServerSyncTimer) window.clearTimeout(alphaServerSyncTimer);
  alphaServerSyncTimer = window.setTimeout(() => {
    alphaServerSyncTimer = null;
    persistAlphaServerState();
  }, delayMs);
}

function flushAlphaServerSync() {
  if (!alphaProjectLibrary) return;
  if (alphaServerSyncTimer) {
    window.clearTimeout(alphaServerSyncTimer);
    alphaServerSyncTimer = null;
  }

  const payload = JSON.stringify(getAlphaServerState());
  setAlphaServerSyncStatus("syncing", "正在保存到服务器");
  if (navigator.sendBeacon) {
    const sent = navigator.sendBeacon(
      ALPHA_SERVER_SYNC_ENDPOINT,
      new Blob([payload], { type: "application/json" })
    );
    if (sent) {
      setAlphaServerSyncStatus("syncing", "离页同步已发送");
      return;
    }
  }

  persistAlphaServerState({ keepalive: true });
}

async function loadAlphaServerState() {
  if (!alphaProjectLibrary) return;
  setAlphaServerSyncStatus("syncing", "正在读取服务器");
  try {
    const response = await fetch(ALPHA_SERVER_SYNC_ENDPOINT, { cache: "no-store" });
    if (!response.ok) throw new Error(`Load failed: ${response.status}`);
    const payload = await response.json();
    if (payload?.configured === false) {
      setAlphaServerSyncStatus("error", "服务器存储未配置");
      return;
    }
    if (applyAlphaServerState(payload?.state)) {
      renderAlphaProjectLibrary();
      applyLanguage();
    } else {
      setAlphaServerSyncStatus("synced", "已读取服务器");
    }
  } catch (error) {
    setAlphaServerSyncStatus("error", "服务器同步失败");
    console.warn("AlphaOps server state unavailable.", error);
  }
}

function saveAlphaRemovedProjects(sync = true) {
  localStorage.setItem(ALPHA_REMOVED_STORAGE_KEY, JSON.stringify(alphaRemovedProjects));
  if (sync) queueAlphaServerSync(0);
}

function removeAlphaProject(name) {
  if (!alphaRemovedProjects.includes(name)) alphaRemovedProjects.push(name);
  saveAlphaRemovedProjects();
  renderAlphaProjectLibrary();
}

function restoreAlphaProject(name) {
  const removedItem = alphaRemovedItems.find((project) => project.name === name);
  if (removedItem) {
    alphaManualMainProjects.unshift({
      id: `main-${Date.now()}`,
      icon: removedItem.icon || "",
      name: removedItem.name,
      status: removedItem.status || "待人工确认",
      x: removedItem.x || "",
      site: removedItem.site || "",
      note: removedItem.note || "从已移除项目恢复",
      manual: true,
      score: removedItem.score || ""
    });
    alphaRemovedItems = alphaRemovedItems.filter((project) => project.name !== name);
    saveAlphaManualMainProjects();
    saveAlphaRemovedItems();
  }
  alphaRemovedProjects = alphaRemovedProjects.filter((projectName) => projectName !== name);
  saveAlphaRemovedProjects();
  renderAlphaProjectLibrary();
}

function saveAlphaManualPendingProjects(sync = true) {
  localStorage.setItem(ALPHA_PENDING_STORAGE_KEY, JSON.stringify(alphaManualPendingProjects));
  if (sync) queueAlphaServerSync(0);
}

function saveAlphaManualMainProjects(sync = true) {
  localStorage.setItem(ALPHA_MAIN_STORAGE_KEY, JSON.stringify(alphaManualMainProjects));
  if (sync) queueAlphaServerSync(0);
}

function saveAlphaHiddenPendingProjects(sync = true) {
  localStorage.setItem(ALPHA_HIDDEN_PENDING_STORAGE_KEY, JSON.stringify(alphaHiddenPendingProjects));
  if (sync) queueAlphaServerSync(0);
}

function saveAlphaRemovedItems(sync = true) {
  localStorage.setItem(ALPHA_REMOVED_ITEMS_STORAGE_KEY, JSON.stringify(alphaRemovedItems));
  if (sync) queueAlphaServerSync(0);
}

function saveAlphaContentState(sync = true) {
  localStorage.setItem(ALPHA_TUTORIALS_STORAGE_KEY, JSON.stringify(alphaTutorials));
  localStorage.setItem(ALPHA_COMMENTS_STORAGE_KEY, JSON.stringify(alphaComments));
  localStorage.setItem(ALPHA_CONTENT_TOMBSTONES_STORAGE_KEY, JSON.stringify(alphaContentTombstones));
  if (sync) queueAlphaServerSync(0);
}

function normalizeAlphaPendingProject(project) {
  return {
    id: project.id || `manual-${Date.now()}`,
    icon: project.icon || "",
    name: project.name || "",
    description: project.description || project.reason || "",
    status: project.status || "",
    score: project.score || "",
    note: project.note || "",
    site: project.site || "",
    x: project.x || "",
    reason: project.reason || ""
  };
}

function readAlphaIconFile(file) {
  return new Promise((resolve) => {
    if (!file) {
      resolve("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

async function addAlphaPendingProject(form) {
  const formData = new FormData(form);
  const iconFile = form.querySelector('input[name="icon"]')?.files?.[0];
  const icon = await readAlphaIconFile(iconFile);
  const name = String(formData.get("name") || "").trim();
  if (!name) return;

  alphaManualPendingProjects.unshift({
    id: `manual-${Date.now()}`,
    icon,
    name,
    description: String(formData.get("description") || "").trim(),
    status: String(formData.get("status") || "").trim(),
    score: String(formData.get("score") || "").trim(),
    note: String(formData.get("note") || "").trim(),
    site: String(formData.get("site") || "").trim(),
    x: String(formData.get("x") || "").trim()
  });
  saveAlphaManualPendingProjects();
  renderAlphaProjectLibrary();
}

function getAlphaPendingProjectById(id) {
  return [...alphaManualPendingProjects, ...alphaBasePendingProjects].find((project) => project.id === id);
}

function removePendingSource(project) {
  if (project.id?.startsWith("manual-")) {
    alphaManualPendingProjects = alphaManualPendingProjects.filter((item) => item.id !== project.id);
    saveAlphaManualPendingProjects();
  } else if (project.id && !alphaHiddenPendingProjects.includes(project.id)) {
    alphaHiddenPendingProjects.push(project.id);
    saveAlphaHiddenPendingProjects();
  }
}

function movePendingProjectToMain(id) {
  const source = getAlphaPendingProjectById(id);
  if (!source) return;
  const project = normalizeAlphaPendingProject(source);
  alphaManualMainProjects.unshift({
    id: `main-${Date.now()}`,
    icon: project.icon,
    name: project.name,
    status: project.status || "待人工确认",
    x: project.x,
    site: project.site,
    note: project.note || project.description || project.reason || "手动移入 AlphaOps 项目池",
    manual: true,
    score: project.score
  });
  removePendingSource(source);
  saveAlphaManualMainProjects();
  renderAlphaProjectLibrary();
}

function deletePendingProject(id) {
  const source = getAlphaPendingProjectById(id);
  if (!source) return;
  const project = normalizeAlphaPendingProject(source);
  alphaRemovedItems.unshift({
    id: `removed-${Date.now()}`,
    icon: project.icon,
    name: project.name,
    note: project.note || project.description || project.reason || "从待添加项目移除",
    status: project.status,
    score: project.score,
    site: project.site,
    x: project.x
  });
  removePendingSource(source);
  saveAlphaRemovedItems();
  renderAlphaProjectLibrary();
}

function moveRemovedProjectToPending(name) {
  const tracked = alphaTrackedProjects.find((project) => project.name === name);
  const manualMain = alphaManualMainProjects.find((project) => project.name === name);
  const removedItem = alphaRemovedItems.find((project) => project.name === name);
  const source = removedItem || manualMain || tracked;
  if (!source) return;

  alphaManualPendingProjects.unshift({
    id: `manual-${Date.now()}`,
    icon: source.icon || "",
    name: source.name,
    description: source.description || source.note || "",
    status: source.status || "",
    score: source.score || "",
    note: source.note || "",
    site: source.site || "",
    x: source.x || ""
  });
  alphaRemovedProjects = alphaRemovedProjects.filter((projectName) => projectName !== name);
  alphaManualMainProjects = alphaManualMainProjects.filter((project) => project.name !== name);
  alphaRemovedItems = alphaRemovedItems.filter((project) => project.name !== name);
  saveAlphaManualPendingProjects();
  saveAlphaRemovedProjects();
  saveAlphaManualMainProjects();
  saveAlphaRemovedItems();
  renderAlphaProjectLibrary();
}

function permanentlyDeleteRemovedProject(name) {
  alphaRemovedProjects = alphaRemovedProjects.filter((projectName) => projectName !== name);
  alphaManualMainProjects = alphaManualMainProjects.filter((project) => project.name !== name);
  alphaRemovedItems = alphaRemovedItems.filter((project) => project.name !== name);
  saveAlphaRemovedProjects();
  saveAlphaManualMainProjects();
  saveAlphaRemovedItems();
  renderAlphaProjectLibrary();
}

function openEditPendingProject(id) {
  const details = [...document.querySelectorAll("[data-alpha-edit-panel]")]
    .find((panel) => panel.dataset.alphaEditPanel === id);
  details?.setAttribute("open", "");
}

async function updatePendingProject(form) {
  const formData = new FormData(form);
  const id = String(formData.get("id") || "");
  const source = getAlphaPendingProjectById(id);
  if (!source) return;
  const iconFile = form.querySelector('input[name="icon"]')?.files?.[0];
  const icon = await readAlphaIconFile(iconFile);
  const updated = {
    id: source.id?.startsWith("manual-") ? source.id : `manual-${Date.now()}`,
    icon: icon || source.icon || "",
    name: String(formData.get("name") || "").trim(),
    description: String(formData.get("description") || "").trim(),
    status: String(formData.get("status") || "").trim(),
    score: String(formData.get("score") || "").trim(),
    note: String(formData.get("note") || "").trim(),
    site: String(formData.get("site") || "").trim(),
    x: String(formData.get("x") || "").trim()
  };
  if (!updated.name) return;

  if (source.id?.startsWith("manual-")) {
    alphaManualPendingProjects = alphaManualPendingProjects.map((project) => project.id === id ? updated : project);
  } else {
    alphaManualPendingProjects.unshift(updated);
    if (!alphaHiddenPendingProjects.includes(source.id)) alphaHiddenPendingProjects.push(source.id);
    saveAlphaHiddenPendingProjects();
  }
  saveAlphaManualPendingProjects();
  renderAlphaProjectLibrary();
}

function renderAlphaProjectLibrary() {
  if (!alphaProjectLibrary) return;
  const walletSeed = (alphaWalletInput?.value.trim() || "").split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const activeProjects = [
    ...alphaTrackedProjects.filter((project) => !alphaRemovedProjects.includes(project.name)),
    ...alphaManualMainProjects.filter((project) => !alphaRemovedProjects.includes(project.name))
  ];
  const removedProjects = [
    ...alphaTrackedProjects.filter((project) => alphaRemovedProjects.includes(project.name)),
    ...alphaManualMainProjects.filter((project) => alphaRemovedProjects.includes(project.name)),
    ...alphaRemovedItems
  ];
  const pendingProjects = [...alphaManualPendingProjects, ...alphaBasePendingProjects]
    .filter((project) => !alphaHiddenPendingProjects.includes(project.id));
  const searchQuery = alphaProjectSearchQuery.trim().toLowerCase();
  const ranked = activeProjects
    .map((project, index) => ({ ...project, alpha: alphaProjectScore(project, index, walletSeed) }))
    .sort((a, b) => b.alpha.score - a.alpha.score);
  renderAlphaQuadrant(ranked);
  const visibleProjects = searchQuery
    ? ranked.filter((project) => [
      project.name,
      project.note,
      project.description,
      project.status
    ].some((value) => String(value || "").toLowerCase().includes(searchQuery)))
    : ranked;
  const sortedProjects = sortAlphaProjects(visibleProjects, alphaProjectSortMode);
  const alphaProjectPageCount = Math.max(1, Math.ceil(sortedProjects.length / ALPHA_PROJECTS_PER_PAGE));
  alphaProjectPage = Math.min(Math.max(1, alphaProjectPage), alphaProjectPageCount);
  const alphaProjectPageStart = (alphaProjectPage - 1) * ALPHA_PROJECTS_PER_PAGE;
  const pagedProjects = sortedProjects.slice(alphaProjectPageStart, alphaProjectPageStart + ALPHA_PROJECTS_PER_PAGE);
  document.querySelector("#alpha-x-feed-panel")?.remove();

  alphaProjectLibrary.innerHTML = `
    <div class="alpha-library-main">
      <div class="alpha-library-head">
      <div>
        <span>Project Intake</span>
        <div class="alpha-library-title-row">
          <h3>AlphaOps 项目池</h3>
          <label class="alpha-project-search">
            <span>搜索</span>
            <input id="alpha-project-search" type="search" value="${escapeHtml(alphaProjectSearchQuery)}" placeholder="按名称 / 描述搜索" autocomplete="off" />
          </label>
          <details class="alpha-score-note">
            <summary>Alpha Score 规则</summary>
            <div class="alpha-score-note-body">
              <p>Alpha Score 是 0-100 分的透明规则引擎，用来回答：这个机会现在值不值得用户投入时间、资金和钱包行为。</p>
              <code>A = clamp(0.25P + 0.20G + 0.15S + 0.15C + 0.15W + 0.10K - R, 0, 100)</code>
              <div class="alpha-score-note-grid">
                <div><strong>P 项目质量</strong><span>融资/背书 30%，团队/生态 20%，产品成熟度 20%，代币机会 20%，安全可信度 10%。</span></div>
                <div><strong>G 链上增长</strong><span>看 7 日均值 vs 前 30 日均值：growth_score = clamp(50 + 35 * ln(growth_ratio), 0, 100)。</span></div>
                <div><strong>S 社区热度</strong><span>Mindshare 35%，粉丝增长 25%，互动质量 20%，贡献者密度 20%。</span></div>
                <div><strong>C 活动质量</strong><span>状态、开放任务、成本、耗时、奖励清晰度和来源可信度。</span></div>
                <div><strong>W 钱包匹配</strong><span>资格覆盖、链适配、协议适配、资金准备度和可执行性。</span></div>
                <div><strong>K 催化剂</strong><span>事件临近度、近期更新、催化强度和叙事适配。</span></div>
                <div><strong>R 风险扣分</strong><span>最高 40 分，覆盖来源、成本、女巫、数据过期、拥挤度和安全风险。</span></div>
              </div>
              <p>输出不只是分数，而是：分数 + 优先级 + 原因 + 缺失任务 + 风险提示。70 分以上进入每日行动清单，85 分以上视为强 Alpha。若 source_risk >= 25，则只进入风险观察。</p>
              <p>模型分两层：项目/机会层判断项目本身是否值得关注；用户钱包层判断当前钱包是否适合参与。MVP 先实现 Campaign Score、Wallet Fit Score、Project/Growth Score 和 Risk Penalty，后续可用真实结果训练模型。</p>
            </div>
          </details>
          <details class="alpha-manual-add">
            <summary>手动添加项目</summary>
            <form class="alpha-manual-form" id="alpha-manual-form">
              <label class="alpha-icon-upload">
                <span>上传项目图标</span>
                <input type="file" name="icon" accept="image/*" />
              </label>
              <label>
                <span>项目名称</span>
                <input type="text" name="name" placeholder="Project name" required />
              </label>
              <label>
                <span>项目描述</span>
                <textarea name="description" rows="3" placeholder="项目一句话介绍"></textarea>
              </label>
              <div class="alpha-manual-row">
                <label>
                  <span>项目状态标签</span>
                  <input type="text" name="status" placeholder="积分活动中 / 产品已上线" />
                </label>
                <label>
                  <span>AlphaOps 评分</span>
                  <input type="number" name="score" min="0" max="100" placeholder="0-100" />
                </label>
              </div>
              <label>
                <span>项目研究备注</span>
                <textarea name="note" rows="3" placeholder="为什么值得观察、还缺哪些证据"></textarea>
              </label>
              <div class="alpha-manual-row">
                <label>
                  <span>官网/任务链接</span>
                  <input type="url" name="site" placeholder="https://..." />
                </label>
                <label>
                  <span>X 链接</span>
                  <input type="url" name="x" placeholder="https://x.com/..." />
                </label>
              </div>
              <div class="alpha-manual-actions">
                <button type="submit">添加到待添加项目</button>
                <button type="button" data-alpha-manual-cancel>取消</button>
              </div>
            </form>
          </details>
          <span class="alpha-sync-status" id="alpha-sync-status" data-status="${alphaServerSyncStatus}">${alphaServerSyncLabel}</span>
        </div>
        <p>已整理为 AlphaOps 的项目池，用于空投、积分、大使活动、链上异动与风险链接检查。</p>
      </div>
      <div class="alpha-sort-controls" role="group" aria-label="AlphaOps project sorting">
        <button type="button" data-alpha-sort="score" class="${alphaProjectSortMode === "score" ? "is-active" : ""}">Alpha Score</button>
        <button type="button" data-alpha-sort="az" class="${alphaProjectSortMode === "az" ? "is-active" : ""}">A-Z 名称</button>
        <button type="button" data-alpha-sort="quality" class="${alphaProjectSortMode === "quality" ? "is-active" : ""}">项目质量 P</button>
        <button type="button" data-alpha-sort="social" class="${alphaProjectSortMode === "social" ? "is-active" : ""}">社区热度 S</button>
      </div>
      </div>
      <div class="alpha-library-grid">
      ${pagedProjects.length ? pagedProjects.map((project, index) => `
        <article class="alpha-project-card">
          <details class="alpha-delete-popover">
            <summary aria-label="删除 ${escapeHtml(project.name)}">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 3h6l1 2h4v2H4V5h4l1-2Z"></path>
                <path d="M7 9h10l-.7 11H7.7L7 9Z"></path>
                <path d="M10 11v7M14 11v7"></path>
              </svg>
            </summary>
            <div class="alpha-delete-confirm">
              <strong>确认删除？</strong>
              <p>删除后会移动到「已移除项目」。</p>
              <div>
                <button type="button" data-alpha-remove="${escapeHtml(project.name)}">确认删除</button>
                <button type="button" data-alpha-delete-cancel>取消</button>
              </div>
            </div>
          </details>
          <div class="alpha-project-top">
            <span>#${String(alphaProjectPageStart + index + 1).padStart(2, "0")}</span>
            <div class="alpha-project-identity">
              <div class="alpha-project-icon" style="--project-hue: ${alphaProjectHue(project.name)}">
                <span>${escapeHtml(alphaProjectInitials(project.name))}</span>
                ${alphaProjectIcon(project) ? `<img src="${alphaProjectIcon(project)}" alt="${escapeHtml(project.name)} icon" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'" />` : ""}
              </div>
              <strong>${project.name}</strong>
            </div>
            <div class="alpha-score-topline" title="社区热度 S：${project.alpha.components.S}">
              <b>${Array.from({ length: alphaHeatFlames(project.alpha.components.S) }, () => "🔥").join("")}</b>
              <em>${project.alpha.score}</em>
            </div>
          </div>
          <div class="alpha-score-label">
            <span>Alpha Score</span>
            <details class="alpha-priority-popover">
              <summary>${project.alpha.priority}</summary>
              <div class="alpha-priority-panel">
                <div class="alpha-score-output">
                  <strong>原因</strong>
                  <p>${project.alpha.reasons.join(" ")}</p>
                </div>
                <div class="alpha-score-output">
                  <strong>缺失任务</strong>
                  <ul>${project.alpha.missingTasks.map((task) => `<li>${task}</li>`).join("")}</ul>
                </div>
                <div class="alpha-score-output risk">
                  <strong>风险提示</strong>
                  <p>${project.alpha.riskTips.join(" ")}</p>
                </div>
              </div>
            </details>
          </div>
          <p>${project.note}</p>
          <small>${project.status || "早期关注"}</small>
          <div class="alpha-score-breakdown" aria-label="Alpha Score breakdown">
            <span>P ${project.alpha.components.P}</span>
            <span>G ${project.alpha.components.G}</span>
            <span>S ${project.alpha.components.S}</span>
            <span>C ${project.alpha.components.C}</span>
            <span>W ${project.alpha.components.W}</span>
            <span>K ${project.alpha.components.K}</span>
            <span>R -${project.alpha.components.R}</span>
          </div>
          <div class="alpha-project-links">
            ${project.site ? `<a class="alpha-task-link" href="${project.site}" target="_blank" rel="noopener noreferrer">官网/任务</a>` : ""}
            ${project.x ? `<a href="${project.x}" target="_blank" rel="noopener noreferrer">X</a>` : ""}
          </div>
          <div class="alpha-project-contributions" aria-label="${escapeHtml(project.name)} 内容协作">
            <button type="button" data-alpha-add-tutorial="${escapeHtml(project.name)}">
              <span aria-hidden="true">▤</span>教程指导
              <em>${alphaContentCount(alphaTutorials, project.name)}</em>
            </button>
            <button type="button" data-alpha-add-comment="${escapeHtml(project.name)}">
              <span aria-hidden="true">◌</span>评论
              <em>${alphaContentCount(alphaComments, project.name)}</em>
            </button>
          </div>
        </article>
      `).join("") : `<div class="alpha-library-empty">未找到匹配项目</div>`}
      </div>
      ${sortedProjects.length ? `
        <nav class="alpha-library-pagination" aria-label="AlphaOps 项目池翻页">
          <span>共 ${sortedProjects.length} 个项目 · 每页 ${ALPHA_PROJECTS_PER_PAGE} 个</span>
          <div>
            <button type="button" data-alpha-page="${alphaProjectPage - 1}" ${alphaProjectPage === 1 ? "disabled" : ""}>上一页</button>
            ${Array.from({ length: alphaProjectPageCount }, (_, pageIndex) => {
              const pageNumber = pageIndex + 1;
              return `<button type="button" data-alpha-page="${pageNumber}" class="${pageNumber === alphaProjectPage ? "is-active" : ""}" ${pageNumber === alphaProjectPage ? 'aria-current="page"' : ""}>${pageNumber}</button>`;
            }).join("")}
            <button type="button" data-alpha-page="${alphaProjectPage + 1}" ${alphaProjectPage === alphaProjectPageCount ? "disabled" : ""}>下一页</button>
          </div>
        </nav>
      ` : ""}
      <details class="alpha-watch-pool" aria-label="AlphaOps project watch pool">
      <summary class="alpha-watch-head">
        <div>
          <span>Watch Pool</span>
          <h3>AlphaOps 项目观察池</h3>
          <p>用于暂存待确认项目与从主项目池移除的项目，方便后续人工复核、恢复或继续追踪。</p>
        </div>
        <strong>${pendingProjects.length + removedProjects.length}</strong>
      </summary>
      <div class="alpha-watch-grid">
        <article class="alpha-watch-column">
          <div class="alpha-watch-column-head">
            <strong>待添加项目</strong>
            <em>${pendingProjects.length}</em>
          </div>
          <div class="alpha-watch-list">
            ${pendingProjects.map((project) => `
              <div class="alpha-watch-item ${project.id ? "manual" : ""}">
                <div class="alpha-watch-project-head">
                  <div class="alpha-watch-icon" style="--project-hue: ${alphaProjectHue(project.name)}">
                    <span>${escapeHtml(alphaProjectInitials(project.name))}</span>
                    ${project.icon ? `<img src="${escapeHtml(project.icon)}" alt="${escapeHtml(project.name)} icon" />` : ""}
                  </div>
                  <div>
                    <strong>${escapeHtml(project.name)}</strong>
                    ${project.status ? `<small>${escapeHtml(project.status)}</small>` : ""}
                  </div>
                  ${project.score ? `<em>${escapeHtml(project.score)}</em>` : ""}
                </div>
                <p>${escapeHtml(project.description || project.reason || project.note || "待补充项目信息")}</p>
                ${project.note ? `<p>${escapeHtml(project.note)}</p>` : ""}
                ${(project.site || project.x) ? `
                  <div class="alpha-watch-links">
                    ${project.site ? `<a href="${escapeHtml(project.site)}" target="_blank" rel="noopener noreferrer">官网/任务</a>` : ""}
                    ${project.x ? `<a href="${escapeHtml(project.x)}" target="_blank" rel="noopener noreferrer">X</a>` : ""}
                  </div>
                ` : ""}
                <div class="alpha-watch-actions">
                  <button type="button" data-alpha-move-pending="${escapeHtml(project.id)}">移入主项目池</button>
                  <button type="button" data-alpha-edit-pending="${escapeHtml(project.id)}">编辑</button>
                  <button type="button" data-alpha-delete-pending="${escapeHtml(project.id)}">删除</button>
                </div>
                <details class="alpha-watch-edit" data-alpha-edit-panel="${escapeHtml(project.id)}">
                  <summary>编辑项目</summary>
                  <form class="alpha-manual-form alpha-edit-form">
                    <input type="hidden" name="id" value="${escapeHtml(project.id)}" />
                    <label class="alpha-icon-upload">
                      <span>上传项目图标</span>
                      <input type="file" name="icon" accept="image/*" />
                    </label>
                    <label>
                      <span>项目名称</span>
                      <input type="text" name="name" value="${escapeHtml(project.name)}" required />
                    </label>
                    <label>
                      <span>项目描述</span>
                      <textarea name="description" rows="3">${escapeHtml(project.description || project.reason || "")}</textarea>
                    </label>
                    <div class="alpha-manual-row">
                      <label>
                        <span>项目状态标签</span>
                        <input type="text" name="status" value="${escapeHtml(project.status || "")}" />
                      </label>
                      <label>
                        <span>AlphaOps 评分</span>
                        <input type="number" name="score" min="0" max="100" value="${escapeHtml(project.score || "")}" />
                      </label>
                    </div>
                    <label>
                      <span>项目研究备注</span>
                      <textarea name="note" rows="3">${escapeHtml(project.note || "")}</textarea>
                    </label>
                    <div class="alpha-manual-row">
                      <label>
                        <span>官网/任务链接</span>
                        <input type="url" name="site" value="${escapeHtml(project.site || "")}" />
                      </label>
                      <label>
                        <span>X 链接</span>
                        <input type="url" name="x" value="${escapeHtml(project.x || "")}" />
                      </label>
                    </div>
                    <div class="alpha-manual-actions">
                      <button type="submit">保存编辑</button>
                      <button type="button" data-alpha-edit-cancel>取消</button>
                    </div>
                  </form>
                </details>
              </div>
            `).join("")}
          </div>
        </article>
        <article class="alpha-watch-column">
          <div class="alpha-watch-column-head">
            <strong>已移除项目</strong>
            <em>${removedProjects.length}</em>
          </div>
          <div class="alpha-watch-list">
            ${removedProjects.length ? removedProjects.map((project) => `
              <div class="alpha-watch-item">
                <strong>${project.name}</strong>
                <p>${project.note}</p>
                <div class="alpha-watch-actions removed">
                  <button type="button" data-alpha-removed-to-pending="${escapeHtml(project.name)}">移入待添加项目</button>
                  <details class="alpha-removed-delete">
                    <summary>删除</summary>
                    <div class="alpha-removed-confirm">
                      <strong>彻底删除？</strong>
                      <p>该操作会从本地记录中移除当前项目。</p>
                      <div>
                        <button type="button" data-alpha-permanent-delete="${escapeHtml(project.name)}">确认删除</button>
                        <button type="button" data-alpha-permanent-cancel>取消</button>
                      </div>
                    </div>
                  </details>
                </div>
              </div>
            `).join("") : `<div class="alpha-watch-empty">暂无已移除项目</div>`}
          </div>
        </article>
      </div>
      </details>
    </div>
    <aside class="alpha-x-feed-panel" id="alpha-x-feed-panel" aria-label="AlphaOps content feed">
      <div class="alpha-x-feed-head">
        <div class="alpha-feed-heading">
          <span>Real-time Feed</span>
          <div class="alpha-feed-tabs" role="tablist" aria-label="AlphaOps 内容流切换">
            <button type="button" role="tab" data-alpha-feed-mode="x" class="${alphaFeedMode === "x" ? "is-active" : ""}" aria-selected="${alphaFeedMode === "x"}">动态流</button>
            <button type="button" role="tab" data-alpha-feed-mode="tutorials" class="${alphaFeedMode === "tutorials" ? "is-active" : ""}" aria-selected="${alphaFeedMode === "tutorials"}">教程集合 <em>${alphaTutorials.length}</em></button>
            <button type="button" role="tab" data-alpha-feed-mode="comments" class="${alphaFeedMode === "comments" ? "is-active" : ""}" aria-selected="${alphaFeedMode === "comments"}">评论流 <em>${alphaComments.length}</em></button>
          </div>
          <p id="alpha-x-feed-meta">55 个项目的最新动态 · 正在同步</p>
        </div>
        <button class="alpha-x-refresh" id="alpha-x-feed-refresh" type="button" aria-label="刷新动态流">↻</button>
      </div>
      <div class="alpha-content-feed-tools" id="alpha-content-feed-tools" ${alphaFeedMode === "x" ? "hidden" : ""}>
        <label>
          <span>筛选</span>
          <input id="alpha-content-feed-search" type="search" value="${escapeHtml(alphaContentFeedSearch)}" placeholder="搜索项目或内容" autocomplete="off" />
        </label>
        <button type="button" id="alpha-content-feed-sort">${alphaContentFeedSort === "oldest" ? "最早优先" : "最新优先"}</button>
        <button type="button" id="alpha-content-feed-export" aria-label="导出当前内容流">导出</button>
      </div>
      <small id="alpha-x-feed-status">接入项目池 X 最新推文，按时间倒序排列，每 12 小时自动刷新。</small>
      <div class="alpha-x-feed-list" id="alpha-x-feed-list"></div>
    </aside>
    <dialog class="alpha-content-dialog" id="alpha-content-dialog" aria-labelledby="alpha-content-dialog-title">
      <form class="alpha-content-form" id="alpha-content-form">
        <header>
          <div>
            <span id="alpha-content-dialog-eyebrow">AlphaOps 项目</span>
            <h4 id="alpha-content-dialog-title">添加教程指导</h4>
          </div>
          <button type="button" data-alpha-content-close aria-label="关闭编辑窗口">×</button>
        </header>
        <input type="hidden" name="project" />
        <section data-alpha-content-fields="tutorials">
          <label>
            <span>教程主题</span>
            <input type="text" name="title" maxlength="90" placeholder="例如：低成本完成积分任务的完整步骤" />
          </label>
          <label>
            <span>内容链接</span>
            <input type="url" name="url" inputmode="url" placeholder="https://x.com/... 或其他内容平台" />
          </label>
          <label>
            <span>主题描述</span>
            <textarea name="description" rows="4" maxlength="360" placeholder="概括教程覆盖的步骤、适用人群和注意事项"></textarea>
          </label>
          <p>支持 X、YouTube、Medium、Mirror、Binance Square、Substack 及其他公开内容链接。</p>
        </section>
        <section data-alpha-content-fields="comments" hidden>
          <label>
            <span>观点标签</span>
            <select name="sentiment">
              <option value="positive">看好</option>
              <option value="neutral" selected>中性</option>
              <option value="caution">谨慎</option>
            </select>
          </label>
          <label>
            <span>项目简评</span>
            <textarea name="text" rows="6" maxlength="500" placeholder="记录项目进展、研究判断、风险提示或下一步跟进结论"></textarea>
          </label>
          <p>建议写明判断依据和观察时间，方便后续复盘观点变化。</p>
        </section>
        <footer>
          <button type="submit">保存内容</button>
          <button type="button" data-alpha-content-close>取消</button>
        </footer>
      </form>
    </dialog>
  `;

  document.querySelector("#alpha-x-feed-refresh")?.addEventListener("click", () => refreshAlphaFeed(ranked));
  document.querySelectorAll("[data-alpha-feed-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      alphaFeedMode = button.dataset.alphaFeedMode || "x";
      renderActiveAlphaFeed();
    });
  });
  document.querySelector("#alpha-content-feed-search")?.addEventListener("input", (event) => {
    alphaContentFeedSearch = event.currentTarget.value;
    renderAlphaContentFeed(alphaFeedMode);
  });
  document.querySelector("#alpha-content-feed-sort")?.addEventListener("click", () => {
    alphaContentFeedSort = alphaContentFeedSort === "newest" ? "oldest" : "newest";
    const sortButton = document.querySelector("#alpha-content-feed-sort");
    if (sortButton) sortButton.textContent = alphaContentFeedSort === "oldest" ? "最早优先" : "最新优先";
    renderAlphaContentFeed(alphaFeedMode);
  });
  document.querySelector("#alpha-content-feed-export")?.addEventListener("click", exportAlphaContent);
  document.querySelectorAll("[data-alpha-add-tutorial]").forEach((button) => {
    button.addEventListener("click", () => openAlphaContentDialog("tutorials", button.dataset.alphaAddTutorial || ""));
  });
  document.querySelectorAll("[data-alpha-add-comment]").forEach((button) => {
    button.addEventListener("click", () => openAlphaContentDialog("comments", button.dataset.alphaAddComment || ""));
  });
  document.querySelector("#alpha-content-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitAlphaContent(event.currentTarget);
  });
  document.querySelectorAll("[data-alpha-content-close]").forEach((button) => {
    button.addEventListener("click", () => document.querySelector("#alpha-content-dialog")?.close());
  });
  document.querySelector("#alpha-content-dialog")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  });
  document.querySelector("#alpha-x-feed-panel")?.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const copyButton = target?.closest("[data-alpha-copy-content]");
    if (copyButton) {
      copyAlphaContent(copyButton.dataset.alphaCopyContent || "", copyButton);
      return;
    }
    const editButton = target?.closest("[data-alpha-edit-content]");
    if (editButton) {
      const [mode, id] = String(editButton.dataset.alphaEditContent || "").split(":");
      const record = alphaContentRecord(mode, id);
      if (record) openAlphaContentDialog(mode, record.project, id);
      return;
    }
    const deleteButton = target?.closest("[data-alpha-delete-content]");
    if (!deleteButton) return;
    if (deleteButton.dataset.confirming !== "true") {
      deleteButton.dataset.confirming = "true";
      deleteButton.textContent = "确认删除";
      window.setTimeout(() => {
        if (!deleteButton.isConnected) return;
        deleteButton.dataset.confirming = "false";
        deleteButton.textContent = "删除";
      }, 3200);
      return;
    }
    const [mode, id] = String(deleteButton.dataset.alphaDeleteContent || "").split(":");
    deleteAlphaContent(mode, id);
  });
  document.querySelectorAll("[data-alpha-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      alphaProjectSortMode = button.dataset.alphaSort || "score";
      alphaProjectPage = 1;
      renderAlphaProjectLibrary();
    });
  });
  document.querySelector("#alpha-project-search")?.addEventListener("input", (event) => {
    alphaProjectSearchQuery = event.currentTarget.value;
    alphaProjectPage = 1;
    renderAlphaProjectLibrary();
    const searchInput = document.querySelector("#alpha-project-search");
    searchInput?.focus();
    searchInput?.setSelectionRange(alphaProjectSearchQuery.length, alphaProjectSearchQuery.length);
  });
  document.querySelectorAll("[data-alpha-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const requestedPage = Number(button.dataset.alphaPage);
      if (!Number.isInteger(requestedPage) || requestedPage < 1 || requestedPage === alphaProjectPage) return;
      alphaProjectPage = requestedPage;
      renderAlphaProjectLibrary();
      window.requestAnimationFrame(() => document.querySelector(".alpha-library-grid")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    });
  });
  document.querySelector("#alpha-manual-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    addAlphaPendingProject(event.currentTarget);
  });
  document.querySelector("[data-alpha-manual-cancel]")?.addEventListener("click", () => {
    document.querySelector(".alpha-manual-add")?.removeAttribute("open");
  });
  document.querySelectorAll("[data-alpha-move-pending]").forEach((button) => {
    button.addEventListener("click", () => movePendingProjectToMain(button.dataset.alphaMovePending || ""));
  });
  document.querySelectorAll("[data-alpha-edit-pending]").forEach((button) => {
    button.addEventListener("click", () => openEditPendingProject(button.dataset.alphaEditPending || ""));
  });
  document.querySelectorAll("[data-alpha-delete-pending]").forEach((button) => {
    button.addEventListener("click", () => deletePendingProject(button.dataset.alphaDeletePending || ""));
  });
  document.querySelectorAll(".alpha-edit-form").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      updatePendingProject(event.currentTarget);
    });
  });
  document.querySelectorAll("[data-alpha-edit-cancel]").forEach((button) => {
    button.addEventListener("click", () => button.closest(".alpha-watch-edit")?.removeAttribute("open"));
  });
  document.querySelectorAll("[data-alpha-removed-to-pending]").forEach((button) => {
    button.addEventListener("click", () => moveRemovedProjectToPending(button.dataset.alphaRemovedToPending || ""));
  });
  document.querySelectorAll("[data-alpha-permanent-delete]").forEach((button) => {
    button.addEventListener("click", () => permanentlyDeleteRemovedProject(button.dataset.alphaPermanentDelete || ""));
  });
  document.querySelectorAll("[data-alpha-permanent-cancel]").forEach((button) => {
    button.addEventListener("click", () => button.closest(".alpha-removed-delete")?.removeAttribute("open"));
  });
  document.querySelector(".alpha-manual-add")?.addEventListener("toggle", (event) => {
    if (!event.currentTarget.open) return;
    document.querySelector(".alpha-score-note")?.removeAttribute("open");
  });
  document.querySelector(".alpha-score-note")?.addEventListener("toggle", (event) => {
    if (!event.currentTarget.open) return;
    document.querySelector(".alpha-manual-add")?.removeAttribute("open");
  });
  document.querySelectorAll("[data-alpha-remove]").forEach((button) => {
    button.addEventListener("click", () => removeAlphaProject(button.dataset.alphaRemove || ""));
  });
  document.querySelectorAll("[data-alpha-delete-cancel]").forEach((button) => {
    button.addEventListener("click", () => button.closest(".alpha-delete-popover")?.removeAttribute("open"));
  });
  document.querySelectorAll("[data-alpha-restore]").forEach((button) => {
    button.addEventListener("click", () => restoreAlphaProject(button.dataset.alphaRestore || ""));
  });
  document.querySelectorAll(".alpha-removed-delete").forEach((popover) => {
    popover.addEventListener("toggle", () => {
      if (!popover.open) return;
      document.querySelectorAll(".alpha-removed-delete[open]").forEach((openPopover) => {
        if (openPopover !== popover) openPopover.removeAttribute("open");
      });
    });
  });
  document.querySelectorAll(".alpha-delete-popover").forEach((popover) => {
    popover.addEventListener("toggle", () => {
      if (!popover.open) return;
      document.querySelectorAll(".alpha-delete-popover[open]").forEach((openPopover) => {
        if (openPopover !== popover) openPopover.removeAttribute("open");
      });
    });
  });
  document.querySelectorAll(".alpha-priority-popover").forEach((popover) => {
    popover.addEventListener("toggle", () => {
      if (!popover.open) return;
      document.querySelectorAll(".alpha-priority-popover[open]").forEach((openPopover) => {
        if (openPopover !== popover) openPopover.removeAttribute("open");
      });
    });
  });
  if (!alphaLatestXFeedItems.length) {
    renderAlphaFeed(createAlphaFallbackFeed(ranked), new Date().toISOString(), {
      fallback: true,
      source: "preview",
      message: "正在连接项目池 X 最新推文。",
      totalHandles: ranked.map(alphaXHandle).filter(Boolean).length
    });
    refreshAlphaFeed(ranked);
  } else {
    renderActiveAlphaFeed();
  }
  if (alphaFeedIntervalId) window.clearInterval(alphaFeedIntervalId);
  alphaFeedIntervalId = window.setInterval(() => refreshAlphaFeed(ranked), ALPHA_FEED_REFRESH_MS);

  const rankList = document.querySelector(".rank-list");
  if (rankList) {
    rankList.innerHTML = ranked.slice(0, 8).map((project, index) => `
      <div><span>${String(index + 1).padStart(2, "0")}</span><strong>${project.name}</strong><em>${project.alpha.score}</em></div>
    `).join("");
  }
}

renderAlphaProjectLibrary();
loadAlphaServerState();
if (alphaProjectLibrary) {
  window.addEventListener("pagehide", flushAlphaServerSync);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushAlphaServerSync();
  });
}

applyLanguage();

if (false) {
const powerState = {
  rotationX: -0.72,
  rotationY: 0.54,
  dragging: false,
  lastX: 0,
  lastY: 0,
  range: "all",
  glow: false,
  view: "3d",
  model: "log-growth"
};

const powerModelConfig = {
  "log-growth": {
    label: "Log Growth",
    metricTitle: "Logarithmic Growth 对数增长",
    dotClass: "model-log-growth",
    priceColor: "#c5ffd2",
    glow: "rgba(132, 255, 173, 0.42)"
  },
  "power-law": {
    label: "Power Law",
    metricTitle: "Power Law 幂律模型",
    dotClass: "model-power-law",
    priceColor: "#c5ffd2",
    glow: "rgba(90, 146, 243, 0.34)"
  },
  "pl-drawdown": {
    label: "PL Drawdown",
    metricTitle: "PL Drawdown 幂律回撤",
    dotClass: "model-pl-drawdown",
    priceColor: "#d9dce1",
    glow: "rgba(228, 88, 59, 0.24)"
  },
  "log-risk": {
    label: "Log Risk",
    metricTitle: "Log Risk 对数风险",
    dotClass: "model-log-risk",
    priceColor: "#d9dce1",
    glow: "rgba(239, 123, 34, 0.26)"
  }
};

const powerData = Array.from({ length: 190 }, (_, index) => {
  const t = index / 189;
  const base = Math.pow(t + 0.035, 2.18) * 7.5;
  const cycle = Math.sin(t * 42) * (0.35 - t * 0.12) + Math.sin(t * 92) * 0.08;
  const adoptionStep = t > 0.18 ? 0.6 : 0;
  const institutionalStep = t > 0.72 ? 0.46 : 0;
  return {
    x: -4.8 + t * 9.6,
    y: Math.max(0.08, base + cycle + adoptionStep + institutionalStep),
    z: Math.sin(t * 8) * 0.16
  };
});

const modelData = powerData.map((point, index) => {
  const t = index / Math.max(powerData.length - 1, 1);
  return {
    x: point.x,
    y: Math.pow(t + 0.05, 2.05) * 7.7 + 0.12,
    z: -0.04
  };
});

let powerBtcSeries = [];
let powerBtcLoaded = false;

function buildFallbackBtcSeries() {
  const anchors = [
    ["2010-07-18", 0.07],
    ["2011-06-08", 31],
    ["2011-11-18", 2.05],
    ["2013-12-04", 1150],
    ["2015-01-14", 170],
    ["2017-12-17", 19600],
    ["2018-12-15", 3200],
    ["2021-11-10", 69000],
    ["2022-11-21", 15700],
    ["2024-03-14", 73750],
    ["2025-10-05", 112000],
    ["2026-07-15", 96500]
  ].map(([date, price]) => ({ date: new Date(date), price }));

  const series = [];
  for (let i = 0; i < anchors.length - 1; i += 1) {
    const start = anchors[i];
    const end = anchors[i + 1];
    const steps = Math.max(8, Math.round((end.date - start.date) / 1000 / 60 / 60 / 24 / 18));
    for (let step = 0; step < steps; step += 1) {
      const t = step / steps;
      const date = new Date(start.date.getTime() + (end.date - start.date) * t);
      const logPrice = Math.log10(start.price) + (Math.log10(end.price) - Math.log10(start.price)) * t;
      const wave = Math.sin((series.length + 1) * 0.78) * 0.045 + Math.sin((series.length + 1) * 0.19) * 0.03;
      series.push({ date, price: Math.pow(10, logPrice + wave) });
    }
  }
  series.push(anchors.at(-1));
  return series;
}

async function loadPowerBtcSeries() {
  if (powerBtcLoaded) return;
  powerBtcSeries = buildFallbackBtcSeries();
  powerBtcLoaded = true;

  try {
    const response = await fetch("https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=max&interval=daily");
    if (!response.ok) throw new Error("BTC history request failed");
    const payload = await response.json();
    const prices = Array.isArray(payload.prices) ? payload.prices : [];
    const parsed = prices
      .map(([time, price]) => ({ date: new Date(time), price: Number(price) }))
      .filter((point) => Number.isFinite(point.price) && point.price > 0);

    if (parsed.length > 30) {
      powerBtcSeries = parsed;
      drawPowerLawDashboard();
    }
  } catch (error) {
    drawPowerLawDashboard();
  }
}

function getPowerVisibleBtcSeries() {
  if (!powerBtcSeries.length) powerBtcSeries = buildFallbackBtcSeries();
  if (powerState.range === "all") return powerBtcSeries;

  const years = Number.parseInt(powerState.range, 10);
  if (!Number.isFinite(years)) return powerBtcSeries;

  const latest = powerBtcSeries.at(-1)?.date ?? new Date();
  const start = new Date(latest);
  start.setFullYear(start.getFullYear() - years);
  return powerBtcSeries.filter((point) => point.date >= start);
}

function rotatePoint(point) {
  const cosY = Math.cos(powerState.rotationY);
  const sinY = Math.sin(powerState.rotationY);
  const cosX = Math.cos(powerState.rotationX);
  const sinX = Math.sin(powerState.rotationX);
  const y = point.y - 3.8;
  let x1 = point.x * cosY - point.z * sinY;
  let z1 = point.x * sinY + point.z * cosY;
  let y1 = y * cosX - z1 * sinX;
  let z2 = y * sinX + z1 * cosX;
  return { x: x1, y: y1, z: z2 };
}

function projectPoint(point, width, height) {
  if (powerState.view === "2d") {
    return {
      x: width * 0.12 + ((point.x + 4.8) / 9.6) * width * 0.58,
      y: height * 0.78 - (point.y / 9.2) * height * 0.55
    };
  }

  const rotated = rotatePoint(point);
  const perspective = 760 / (760 + rotated.z * 72);
  return {
    x: width * 0.34 + rotated.x * 72 * perspective,
    y: height * 0.64 - rotated.y * 64 * perspective
  };
}

function drawPowerPath(ctx, points, width, height, color, lineWidth) {
  ctx.beginPath();
  points.forEach((point, index) => {
    const projected = projectPoint(point, width, height);
    if (index === 0) ctx.moveTo(projected.x, projected.y);
    else ctx.lineTo(projected.x, projected.y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
}

function getPowerModelPrice(t, model) {
  const safeT = Math.max(0, Math.min(1, t));
  if (model === "power-law" || model === "pl-drawdown") {
    return Math.pow(10, -1 + safeT * 6.05);
  }
  return Math.pow(10, -1 + Math.pow(safeT, 0.48) * (Math.log10(125000) + 1));
}

function drawModelLine(ctx, series, xFor, yFor, model) {
  ctx.beginPath();
  series.forEach((point, index) => {
    const t = index / Math.max(series.length - 1, 1);
    const x = xFor(point.date);
    const y = yFor(getPowerModelPrice(t, model));
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = model === "power-law" ? "rgba(245, 247, 251, 0.86)" : "rgba(240, 242, 245, 0.78)";
  ctx.lineWidth = model === "power-law" ? 2.2 : 1.8;
  ctx.stroke();
}

function drawDrawdownBands(ctx, series, xFor, yFor, plot) {
  const barWidth = Math.max(2, (plot.right - plot.left) / Math.max(series.length, 1) * 1.2);
  series.forEach((point, index) => {
    const t = index / Math.max(series.length - 1, 1);
    const modelPrice = getPowerModelPrice(t, "pl-drawdown");
    const drawdown = Math.max(0, 1 - point.price / modelPrice);
    if (drawdown < 0.12) return;

    const x = xFor(point.date);
    const top = yFor(modelPrice);
    const bottom = yFor(Math.max(point.price, 0.1));
    const intensity = Math.min(1, drawdown / 0.72);
    const red = Math.round(130 + intensity * 110);
    const green = Math.round(118 - intensity * 70);
    ctx.fillStyle = `rgba(${red}, ${green}, 32, ${0.18 + intensity * 0.44})`;
    ctx.fillRect(x - barWidth / 2, top, barWidth, Math.max(3, bottom - top));
  });
}

function drawRiskBars(ctx, series, xFor, plot) {
  const floor = plot.bottom;
  const barWidth = Math.max(2, (plot.right - plot.left) / Math.max(series.length, 1) * 1.1);
  series.forEach((point, index) => {
    const t = index / Math.max(series.length - 1, 1);
    const modelPrice = getPowerModelPrice(t, "log-growth");
    const deviation = Math.log10(point.price / modelPrice);
    const wave = Math.sin(index * 0.08) * 0.08 + Math.sin(index * 0.021) * 0.1;
    const risk = Math.max(0.04, Math.min(1, 0.42 + deviation * 0.58 + wave));
    const x = xFor(point.date);
    const height = 24 + risk * (plot.bottom - plot.top) * 0.28;
    const hue = 58 - risk * 46;
    const alpha = 0.32 + risk * 0.46;
    ctx.fillStyle = `hsla(${hue}, 82%, ${54 - risk * 10}%, ${alpha})`;
    ctx.fillRect(x - barWidth / 2, floor - height, barWidth, height);
  });
}

function updatePowerModelUi() {
  const config = powerModelConfig[powerState.model] || powerModelConfig["log-growth"];
  if (powerModelLabel) powerModelLabel.textContent = config.label;
  if (powerModelDot) {
    powerModelDot.className = `model-dot ${config.dotClass}`;
  }
  powerModelOptions.forEach((button) => {
    button.classList.toggle("active", button.dataset.modelOption === powerState.model);
  });
  const title = document.querySelector(".power-metrics h3");
  if (title) title.textContent = config.metricTitle;
}

function drawPowerBtc2D(ctx, width, height) {
  const series = getPowerVisibleBtcSeries();
  const plot = {
    left: Math.max(84, width * 0.07),
    right: width * 0.94,
    top: height * 0.16,
    bottom: height * 0.83
  };
  const yMin = Math.log10(0.1);
  const yMax = Math.log10(200000);
  const startTime = series[0].date.getTime();
  const endTime = series.at(-1).date.getTime();

  const xFor = (date) => {
    const t = (date.getTime() - startTime) / Math.max(endTime - startTime, 1);
    return plot.left + t * (plot.right - plot.left);
  };
  const yFor = (price) => {
    const t = (Math.log10(Math.max(price, 0.1)) - yMin) / (yMax - yMin);
    return plot.bottom - t * (plot.bottom - plot.top);
  };

  const floorTop = plot.bottom + height * 0.02;
  ctx.strokeStyle = "rgba(87, 96, 120, 0.18)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 12; i += 1) {
    const x = plot.left + ((plot.right - plot.left) / 12) * i;
    ctx.beginPath();
    ctx.moveTo(x, floorTop);
    ctx.lineTo(x + (i - 6) * 28, height);
    ctx.stroke();
  }
  for (let i = 0; i <= 7; i += 1) {
    const y = floorTop + ((height - floorTop) / 7) * i;
    ctx.beginPath();
    ctx.moveTo(0, y + i * 4);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(91, 98, 117, 0.45)";
  ctx.beginPath();
  ctx.moveTo(plot.left, plot.top);
  ctx.lineTo(plot.left, plot.bottom);
  ctx.lineTo(plot.right, plot.bottom);
  ctx.stroke();

  const yTicks = [
    ["$0.10", 0.1],
    ["$1", 1],
    ["$10", 10],
    ["$100", 100],
    ["$1k", 1000],
    ["$10k", 10000],
    ["$100k", 100000]
  ];

  ctx.fillStyle = "rgba(225, 226, 232, 0.66)";
  ctx.font = "700 15px JetBrains Mono, monospace";
  yTicks.forEach(([label, value]) => {
    const y = yFor(value);
    ctx.strokeStyle = "rgba(91, 98, 117, 0.18)";
    ctx.beginPath();
    ctx.moveTo(plot.left - 16, y);
    ctx.lineTo(plot.right, y);
    ctx.stroke();
    ctx.fillText(label, plot.left - 70, y + 5);
  });

  const startYear = new Date(startTime).getFullYear();
  const endYear = new Date(endTime).getFullYear();
  const yearStep = powerState.range === "all" ? 2 : 1;
  for (let year = Math.ceil(startYear / yearStep) * yearStep; year <= endYear; year += yearStep) {
    const x = xFor(new Date(`${year}-01-01T00:00:00Z`));
    ctx.strokeStyle = "rgba(91, 98, 117, 0.2)";
    ctx.beginPath();
    ctx.moveTo(x, plot.bottom);
    ctx.lineTo(x, plot.bottom + 18);
    ctx.stroke();
    ctx.fillText(String(year), x - 18, plot.bottom + 48);
  }

  if (powerState.model === "pl-drawdown") {
    drawDrawdownBands(ctx, series, xFor, yFor, plot);
  } else if (powerState.model === "log-risk") {
    drawRiskBars(ctx, series, xFor, plot);
  } else {
    drawModelLine(ctx, series, xFor, yFor, powerState.model);
  }

  const modelConfig = powerModelConfig[powerState.model] || powerModelConfig["log-growth"];
  if (powerState.glow) {
    ctx.shadowColor = modelConfig.glow.replace("0.42", "0.62").replace("0.34", "0.55").replace("0.24", "0.5").replace("0.26", "0.52");
    ctx.shadowBlur = 24;
  } else {
    ctx.shadowColor = modelConfig.glow;
    ctx.shadowBlur = 12;
  }
  ctx.beginPath();
  series.forEach((point, index) => {
    const x = xFor(point.date);
    const y = yFor(point.price);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = modelConfig.priceColor;
  ctx.lineWidth = powerState.model === "pl-drawdown" || powerState.model === "log-risk" ? 3.2 : 3.8;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.shadowBlur = 0;

  const latest = series.at(-1);
  const latestX = xFor(latest.date);
  const latestY = yFor(latest.price);
  ctx.fillStyle = powerState.model === "pl-drawdown" ? "#6ff06d" : "#c7f8cf";
  ctx.beginPath();
  ctx.arc(latestX, latestY, 7, 0, Math.PI * 2);
  ctx.fill();
}

function drawPowerLawDashboard() {
  if (!powerCanvas) return;
  const rect = powerCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  powerCanvas.width = rect.width * dpr;
  powerCanvas.height = rect.height * dpr;
  const ctx = powerCanvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const width = rect.width;
  const height = rect.height;
  ctx.clearRect(0, 0, width, height);

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#17181e");
  gradient.addColorStop(1, "#101116");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  if (powerState.view === "2d") {
    drawPowerBtc2D(ctx, width, height);
    return;
  }

  const gridAlpha = powerState.glow ? 0.26 : 0.16;
  ctx.strokeStyle = `rgba(110, 126, 148, ${gridAlpha})`;
  ctx.lineWidth = 1;

  for (let x = -5; x <= 5; x += 1) {
    const a = projectPoint({ x, y: 0, z: -2.2 }, width, height);
    const b = projectPoint({ x, y: 0, z: 2.2 }, width, height);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  for (let z = -2; z <= 2; z += 0.5) {
    const a = projectPoint({ x: -5.2, y: 0, z }, width, height);
    const b = projectPoint({ x: 5.2, y: 0, z }, width, height);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  const yTicks = [
    ["$0.10", 0.15],
    ["$1", 0.95],
    ["$10", 1.75],
    ["$100", 2.75],
    ["$1k  1000美元", 3.75],
    ["$10k  一万美元", 5.15],
    ["$100k  10万美元", 6.55]
  ];

  ctx.fillStyle = "rgba(225, 226, 232, 0.62)";
  ctx.font = "700 15px JetBrains Mono, monospace";
  yTicks.forEach(([label, y]) => {
    const p = projectPoint({ x: -5.35, y, z: 0 }, width, height);
    ctx.fillText(label, p.x - 90, p.y + 5);
  });

  const years = ["2012", "2014", "2016", "2018", "2020", "2022", "2024", "2026"];
  years.forEach((year, index) => {
    const x = -4.3 + index * 1.25;
    const p = projectPoint({ x, y: 0, z: 1.9 }, width, height);
    ctx.fillText(year, p.x - 18, p.y + 24);
  });

  if (powerState.glow) {
    ctx.shadowColor = "rgba(132, 255, 173, 0.55)";
    ctx.shadowBlur = 18;
  }
  const modelConfig = powerModelConfig[powerState.model] || powerModelConfig["log-growth"];
  drawPowerPath(ctx, modelData, width, height, "rgba(240, 242, 245, 0.74)", 1.6);
  drawPowerPath(ctx, powerData, width, height, modelConfig.priceColor, 4);
  ctx.shadowBlur = 0;

  const latest = projectPoint(powerData.at(-1), width, height);
  ctx.fillStyle = "#c7f8cf";
  ctx.beginPath();
  ctx.arc(latest.x, latest.y, 6, 0, Math.PI * 2);
  ctx.fill();
}

powerCanvas?.addEventListener("pointerdown", (event) => {
  if (window.productDashboardOwnsInteractions) return;
  powerState.dragging = true;
  powerState.lastX = event.clientX;
  powerState.lastY = event.clientY;
  powerCanvas.setPointerCapture(event.pointerId);
});

powerCanvas?.addEventListener("pointermove", (event) => {
  if (window.productDashboardOwnsInteractions) return;
  if (!powerState.dragging) return;
  const dx = event.clientX - powerState.lastX;
  const dy = event.clientY - powerState.lastY;
  powerState.lastX = event.clientX;
  powerState.lastY = event.clientY;
  powerState.rotationY += dx * 0.006;
  powerState.rotationX = Math.max(-1.18, Math.min(-0.18, powerState.rotationX + dy * 0.004));
  drawPowerLawDashboard();
});

powerCanvas?.addEventListener("pointerup", (event) => {
  if (window.productDashboardOwnsInteractions) return;
  powerState.dragging = false;
  powerCanvas.releasePointerCapture(event.pointerId);
});

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    if (window.productDashboardOwnsInteractions) return;
    document.querySelectorAll("[data-view]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    powerState.view = button.dataset.view;
    drawPowerLawDashboard();
  });
});

document.querySelectorAll("[data-range]").forEach((button) => {
  button.addEventListener("click", () => {
    if (window.productDashboardOwnsInteractions) return;
    document.querySelectorAll("[data-range]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    powerState.range = button.dataset.range;
    drawPowerLawDashboard();
  });
});

powerModelToggle?.addEventListener("click", (event) => {
  if (window.productDashboardOwnsInteractions) return;
  event.stopPropagation();
  const isOpen = powerModelMenu?.classList.toggle("is-open") ?? false;
  powerModelToggle.setAttribute("aria-expanded", String(isOpen));
});

powerModelOptions.forEach((button) => {
  button.addEventListener("click", () => {
    if (window.productDashboardOwnsInteractions) return;
    powerState.model = button.dataset.modelOption || "log-growth";
    powerModelMenu?.classList.remove("is-open");
    powerModelToggle?.setAttribute("aria-expanded", "false");
    updatePowerModelUi();
    drawPowerLawDashboard();
  });
});

document.addEventListener("click", (event) => {
  if (!powerModelMenu?.contains(event.target)) {
    powerModelMenu?.classList.remove("is-open");
    powerModelToggle?.setAttribute("aria-expanded", "false");
  }
});

document.querySelector("#power-glow")?.addEventListener("change", (event) => {
  if (window.productDashboardOwnsInteractions) return;
  powerState.glow = event.target.checked;
  drawPowerLawDashboard();
});

document.querySelector("#power-download")?.addEventListener("click", () => {
  if (!powerCanvas) return;
  const link = document.createElement("a");
  link.download = "welinkbtc-power-law-dashboard.png";
  link.href = powerCanvas.toDataURL("image/png");
  link.click();
});

powerMetricsToggle?.addEventListener("click", () => {
  if (window.productDashboardOwnsInteractions) return;
  const isCollapsed = powerMetricsPanel?.classList.toggle("is-collapsed") ?? false;
  powerMetricsToggle.setAttribute("aria-expanded", String(!isCollapsed));
  powerMetricsToggle.setAttribute("aria-label", isCollapsed ? "展开指标窗口" : "收起指标窗口");
});

updatePowerModelUi();
loadPowerBtcSeries();
window.addEventListener("resize", drawPowerLawDashboard);
drawPowerLawDashboard();
}
