-- Enrich all toolbox rows with official X, descriptions, X-based ratings and RootData-style token status.
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

UPDATE "toolbox_items" SET "description" = '聚合 X、Farcaster 等社交信息流，支持跨平台浏览与内容发布。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-firefly';
UPDATE "toolbox_items" SET "description" = '面向 Web3 社区的社交内容与互动平台，支持账号登录和内容发布。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-tako';
UPDATE "toolbox_items" SET "description" = '去中心化社交协议入口，可浏览频道、使用 Frames 并参与链上社交。', "rating" = 9, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-farcaster';
UPDATE "toolbox_items" SET "description" = '基于社交影响力与互动数据的 Web3 声誉和任务平台。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-giverep';
UPDATE "toolbox_items" SET "description" = 'reddit 是用于 Web3 社交、内容分发或社区互动的工具入口。', "rating" = 10, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-reddit';
UPDATE "toolbox_items" SET "description" = '面向 AI Agent 的创建、发行与交易平台，连接智能体与链上经济。', "rating" = 9, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-virtuals';
UPDATE "toolbox_items" SET "description" = 'soul 是用于 Web3 社交、内容分发或社区互动的工具入口。', "rating" = 5, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-soul';
UPDATE "toolbox_items" SET "description" = 'glider 是用于 Web3 社交、内容分发或社区互动的工具入口。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-glider';
UPDATE "toolbox_items" SET "description" = '跨链稳定币与收益协议，提供资产铸造、质押及生态任务入口。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-river';
UPDATE "toolbox_items" SET "description" = 'wallchain 是用于 Web3 社交、内容分发或社区互动的工具入口。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-wallchain';
UPDATE "toolbox_items" SET "description" = 'ethos 是用于 Web3 社交、内容分发或社区互动的工具入口。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-ethos';
UPDATE "toolbox_items" SET "description" = '推特 是用于 Web3 社交、内容分发或社区互动的工具入口。', "rating" = 10, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-x';
UPDATE "toolbox_items" SET "description" = '币安广场 是用于 Web3 社交、内容分发或社区互动的工具入口。', "rating" = 10, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-binance-square';
UPDATE "toolbox_items" SET "description" = 'Billionlive 是用于 Web3 社交、内容分发或社区互动的工具入口。', "rating" = 5, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r15';
UPDATE "toolbox_items" SET "description" = 'highlight 是用于 Web3 社交、内容分发或社区互动的工具入口。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r16';
UPDATE "toolbox_items" SET "description" = 'rodeo 是用于 Web3 社交、内容分发或社区互动的工具入口。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r17';
UPDATE "toolbox_items" SET "description" = '推特pro 是用于 Web3 社交、内容分发或社区互动的工具入口。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r18';
UPDATE "toolbox_items" SET "description" = '加密行业注意力与内容影响力分析平台，提供 Yaps 等社区积分产品。', "rating" = 9, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-kaito';
UPDATE "toolbox_items" SET "description" = 'Polarise 是用于 Web3 社交、内容分发或社区互动的工具入口。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r20';
UPDATE "toolbox_items" SET "description" = 'Base 生态的一体化钱包与社交入口，用于资产、应用和链上身份管理。', "rating" = 10, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-base';
UPDATE "toolbox_items" SET "description" = 'matrica 用于钱包身份、社区成员和链上账号验证。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-matrica';
UPDATE "toolbox_items" SET "description" = '综合加密资产行情、排名、市值、交易所与项目基础资料平台。', "rating" = 10, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-cmc';
UPDATE "toolbox_items" SET "description" = '加密市场行情、分类数据、研究内容与币种追踪平台。', "rating" = 10, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-coingecko';
UPDATE "toolbox_items" SET "description" = '实时加密行情、自选组合和市场概览工具。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-livecoinwatch';
UPDATE "toolbox_items" SET "description" = '链上实体标签、地址追踪、资金流向和情报分析平台。', "rating" = 9, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-arkm';
UPDATE "toolbox_items" SET "description" = '社区驱动的链上 SQL 数据分析与可视化看板平台。', "rating" = 9, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-dune';
UPDATE "toolbox_items" SET "description" = '面向投资研究的链上标签、地址画像与资金流分析平台。', "rating" = 9, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-nansen';
UPDATE "toolbox_items" SET "description" = '聚焦数字资产市场、监管与机构动态的加密行业新闻媒体。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-dlnews';
UPDATE "toolbox_items" SET "description" = '提供比特币及多链地址、供需和市场周期指标的链上数据平台。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-glassnode';
UPDATE "toolbox_items" SET "description" = 'treeofalpha 提供加密市场、链上数据、资讯或研究分析服务。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-treeofalpha';
UPDATE "toolbox_items" SET "description" = 'Web3 与前沿科技中文资讯、深度分析及财经日历平台。', "rating" = 9, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-panewslab';
UPDATE "toolbox_items" SET "description" = 'chainalert币链快报 提供加密市场、链上数据、资讯或研究分析服务。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-chainalert';
UPDATE "toolbox_items" SET "description" = '加密行业快讯、研究、融资信息与重要事件日历平台。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-foresight';
UPDATE "toolbox_items" SET "description" = '提供合约持仓、爆仓、资金费率与多维市场统计的衍生品数据平台。', "rating" = 9, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r38';
UPDATE "toolbox_items" SET "description" = '面向 Crypto 行业的中文快讯、深度研究与数据资讯平台。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r39';
UPDATE "toolbox_items" SET "description" = '专注比特币链上周期、估值和持币结构分析的研究工具。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r40';
UPDATE "toolbox_items" SET "description" = '基于真实事件结果结算的链上预测市场与概率交易平台。', "rating" = 10, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r42';
UPDATE "toolbox_items" SET "description" = '受监管的事件合约与预测交易平台，覆盖经济、政治和体育等主题。', "rating" = 9, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r43';
UPDATE "toolbox_items" SET "description" = '面向宏观与加密事件的观点交易和预测市场平台。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r44';
UPDATE "toolbox_items" SET "description" = 'predict 是用于事件观点、概率发现或结果交易的预测平台。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r45';
UPDATE "toolbox_items" SET "description" = 'probable 是用于事件观点、概率发现或结果交易的预测平台。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r46';
UPDATE "toolbox_items" SET "description" = 'klout 是用于事件观点、概率发现或结果交易的预测平台。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r47';
UPDATE "toolbox_items" SET "description" = 'fireplace 是用于事件观点、概率发现或结果交易的预测平台。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r48';
UPDATE "toolbox_items" SET "description" = 'Upshot 是用于事件观点、概率发现或结果交易的预测平台。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r49';
UPDATE "toolbox_items" SET "description" = 'Converge 是用于事件观点、概率发现或结果交易的预测平台。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r50';
UPDATE "toolbox_items" SET "description" = '面向加密研究的 AI 助手，可聚合资料并生成分析结论。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r52';
UPDATE "toolbox_items" SET "description" = 'Google 的多模态 AI 助手，用于检索、写作、分析与内容生成。', "rating" = 10, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r53';
UPDATE "toolbox_items" SET "description" = '面向股票和加密市场的 AI 研究助手，提供标的分析与交易要点。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r54';
UPDATE "toolbox_items" SET "description" = 'yupp 是用于问答、研究、生成或智能体任务的 AI 产品。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r55';
UPDATE "toolbox_items" SET "description" = 'minara 是用于问答、研究、生成或智能体任务的 AI 产品。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r56';
UPDATE "toolbox_items" SET "description" = 'gonka 是用于问答、研究、生成或智能体任务的 AI 产品。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r57';
UPDATE "toolbox_items" SET "description" = 'AI 角色与智能体创作、发现和互动平台。', "rating" = 9, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r58';
UPDATE "toolbox_items" SET "description" = '通义千问 AI 助手，支持问答、写作、分析、代码和多模态任务。', "rating" = 10, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r59';
UPDATE "toolbox_items" SET "description" = 'OpenAI 的通用 AI 助手，用于研究、写作、分析、代码与自动化。', "rating" = 10, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r60';
UPDATE "toolbox_items" SET "description" = 'bananaimg 是用于问答、研究、生成或智能体任务的 AI 产品。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r61';
UPDATE "toolbox_items" SET "description" = 'imagine 是用于问答、研究、生成或智能体任务的 AI 产品。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r62';
UPDATE "toolbox_items" SET "description" = 'nousresearch 是用于问答、研究、生成或智能体任务的 AI 产品。', "rating" = 9, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r63';
UPDATE "toolbox_items" SET "description" = 'wayfinder 是用于问答、研究、生成或智能体任务的 AI 产品。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r64';
UPDATE "toolbox_items" SET "description" = 'agentlisa 是用于问答、研究、生成或智能体任务的 AI 产品。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r65';
UPDATE "toolbox_items" SET "description" = '聚合多链资产与交易机会的一站式链上交易平台。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r68';
UPDATE "toolbox_items" SET "description" = '加密交易所与多链钱包，提供现货、永续和资产管理服务。', "rating" = 9, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r69';
UPDATE "toolbox_items" SET "description" = 'grvt交易所 是提供永续合约、链上交易或衍生品服务的交易平台。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r70';
UPDATE "toolbox_items" SET "description" = '多链去中心化交易平台，提供永续合约、现货及活动入口。', "rating" = 9, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r71';
UPDATE "toolbox_items" SET "description" = 'standx交易平台 是提供永续合约、链上交易或衍生品服务的交易平台。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r72';
UPDATE "toolbox_items" SET "description" = 'edgex 是提供永续合约、链上交易或衍生品服务的交易平台。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r73';
UPDATE "toolbox_items" SET "description" = '高性能链上永续合约交易平台，提供统一保证金和积分体系。', "rating" = 9, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r74';
UPDATE "toolbox_items" SET "description" = 'extended 是提供永续合约、链上交易或衍生品服务的交易平台。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r75';
UPDATE "toolbox_items" SET "description" = 'apex 是提供永续合约、链上交易或衍生品服务的交易平台。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r76';
UPDATE "toolbox_items" SET "description" = '高性能链上订单簿交易平台，提供永续、现货和原生金融应用。', "rating" = 10, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r77';
UPDATE "toolbox_items" SET "description" = '简化多链资产管理与交易流程的非托管加密入口。', "rating" = 9, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r78';
UPDATE "toolbox_items" SET "description" = 'o1 是提供永续合约、链上交易或衍生品服务的交易平台。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r79';
UPDATE "toolbox_items" SET "description" = '支持跨链兑换、衍生品和收益操作的一站式 DeFi 应用。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r80';
UPDATE "toolbox_items" SET "description" = 'titan 是提供永续合约、链上交易或衍生品服务的交易平台。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r81';
UPDATE "toolbox_items" SET "description" = '高性能去中心化订单簿与永续合约交易平台。', "rating" = 9, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r82';
UPDATE "toolbox_items" SET "description" = 'arkm 是提供永续合约、链上交易或衍生品服务的交易平台。', "rating" = 9, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r83';
UPDATE "toolbox_items" SET "description" = 'variational 是提供永续合约、链上交易或衍生品服务的交易平台。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r84';
UPDATE "toolbox_items" SET "description" = 'vanish 是提供永续合约、链上交易或衍生品服务的交易平台。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r85';
UPDATE "toolbox_items" SET "description" = 'based 是提供永续合约、链上交易或衍生品服务的交易平台。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r86';
UPDATE "toolbox_items" SET "description" = 'blockstreet 是提供永续合约、链上交易或衍生品服务的交易平台。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r87';
UPDATE "toolbox_items" SET "description" = 'flipster 是提供永续合约、链上交易或衍生品服务的交易平台。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r88';
UPDATE "toolbox_items" SET "description" = 'ostium 是提供永续合约、链上交易或衍生品服务的交易平台。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r89';
UPDATE "toolbox_items" SET "description" = 'nado 是提供永续合约、链上交易或衍生品服务的交易平台。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r90';
UPDATE "toolbox_items" SET "description" = 'byreal By的dex交易所 是提供永续合约、链上交易或衍生品服务的交易平台。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r91';
UPDATE "toolbox_items" SET "description" = 'trycoinpilot 是提供永续合约、链上交易或衍生品服务的交易平台。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r92';
UPDATE "toolbox_items" SET "description" = '面向 X 账号和加密 KOL 的影响力排名与社交数据分析工具。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r95';
UPDATE "toolbox_items" SET "description" = '以气泡图展示加密资产涨跌和市值分布的市场可视化工具。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r96';
UPDATE "toolbox_items" SET "description" = '通过地址关系图分析代币持仓集中度与链上资金关联。', "rating" = 9, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r97';
UPDATE "toolbox_items" SET "description" = '多链钱包资产、协议仓位、地址画像和社交关系数据平台。', "rating" = 9, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r98';
UPDATE "toolbox_items" SET "description" = 'arkham 是面向加密数据观察、钱包、跨链或运营效率的实用工具。', "rating" = 9, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r99';
UPDATE "toolbox_items" SET "description" = '多链钱包资产与 DeFi 仓位跟踪、探索和交易工具。', "rating" = 9, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r100';
UPDATE "toolbox_items" SET "description" = '面向多链 DeFi 用户的浏览器钱包与桌面资产管理工具。', "rating" = 9, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r101';
UPDATE "toolbox_items" SET "description" = 'Web3 项目、团队、融资、投资机构、代币与 X 影响力数据库。', "rating" = 9, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r102';
UPDATE "toolbox_items" SET "description" = 'superteam工作 是面向加密数据观察、钱包、跨链或运营效率的实用工具。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r103';
UPDATE "toolbox_items" SET "description" = 'watchoor空投 是面向加密数据观察、钱包、跨链或运营效率的实用工具。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r104';
UPDATE "toolbox_items" SET "description" = 'aicoin 是面向加密数据观察、钱包、跨链或运营效率的实用工具。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r105';
UPDATE "toolbox_items" SET "description" = '用于跨链转移资产和消息的去中心化互操作协议。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r106';
UPDATE "toolbox_items" SET "description" = 'gridy网格交易机器人 是面向加密数据观察、钱包、跨链或运营效率的实用工具。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r107';
UPDATE "toolbox_items" SET "description" = 'guild公会 是面向加密数据观察、钱包、跨链或运营效率的实用工具。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r108';
UPDATE "toolbox_items" SET "description" = 'Google 邮箱入口，用于日常邮件收发、账号登录与通知管理。', "rating" = 10, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r110';
UPDATE "toolbox_items" SET "description" = '强调隐私与端到端加密的电子邮箱服务。', "rating" = 9, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r111';
UPDATE "toolbox_items" SET "description" = 'Microsoft 邮箱入口，用于邮件、联系人和账号通知管理。', "rating" = 9, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r112';
UPDATE "toolbox_items" SET "description" = 'gmx邮箱 是账号、邮箱、代理或日常运营场景的常用服务入口。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r113';
UPDATE "toolbox_items" SET "description" = 'web3chirou邮箱 是账号、邮箱、代理或日常运营场景的常用服务入口。', "rating" = 5, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r114';
UPDATE "toolbox_items" SET "description" = 'welinkBTC｜16年入圈｜4年社区运营经验｜擅长#socialfi领域｜#binance 广场创作者：万联welinkBTC｜专注分享#Web3#链游#AI#AirDrop投资机会，一…', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r115';
UPDATE "toolbox_items" SET "description" = 'linktr主页 是账号、邮箱、代理或日常运营场景的常用服务入口。', "rating" = 9, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r116';
UPDATE "toolbox_items" SET "description" = 'SafePal 营销联盟后台，用于推广链接、转化和佣金管理。', "rating" = 9, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r117';
UPDATE "toolbox_items" SET "description" = 'WEB3 Serve 提供 Twitter、Discord、Gmail、Steam 等海外账号资源服务，支持自动发货、订单查询和售后服务，适用于营销测试、账号管理和跨境业务等合规场景。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r118';
UPDATE "toolbox_items" SET "description" = 'wgetcloud梯子 是账号、邮箱、代理或日常运营场景的常用服务入口。', "rating" = 5, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r119';
UPDATE "toolbox_items" SET "description" = '面向应用的嵌入式钱包与身份认证管理平台。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r120';
UPDATE "toolbox_items" SET "description" = 'proxyline代理IP 是账号、邮箱、代理或日常运营场景的常用服务入口。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r121';
UPDATE "toolbox_items" SET "description" = 'sms短信 是账号、邮箱、代理或日常运营场景的常用服务入口。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r122';
UPDATE "toolbox_items" SET "description" = '社交媒体营销推广平台,twitter粉丝,推特粉丝,facebook粉丝,youtube订阅者,tiktok粉丝,粉丝购买', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r123';
UPDATE "toolbox_items" SET "description" = '蔚莱云Ai出海跨境账号，性价比稳定全球海外IP推特谷歌DC电报AI充值订阅API中转账号资源', "rating" = 5, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r124';
UPDATE "toolbox_items" SET "description" = 'nxonearth 梯子 是账号、邮箱、代理或日常运营场景的常用服务入口。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r125';
UPDATE "toolbox_items" SET "description" = 'sms短信 是账号、邮箱、代理或日常运营场景的常用服务入口。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r126';
UPDATE "toolbox_items" SET "description" = '跑路云 梯子 是账号、邮箱、代理或日常运营场景的常用服务入口。', "rating" = 5, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r127';
UPDATE "toolbox_items" SET "description" = '面向 Web3 应用和社区的隐私身份验证与真人证明网络。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r130';
UPDATE "toolbox_items" SET "description" = '零知识证明基础设施与 Proving Grounds 任务入口。', "rating" = 9, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r131';
UPDATE "toolbox_items" SET "description" = 'nebulai挂机挖矿 是用于 Web3 任务、支付、跨链、挖矿或新项目参与的工具。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r132';
UPDATE "toolbox_items" SET "description" = '面向可验证计算的分布式网络节点与贡献任务平台。', "rating" = 9, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r133';
UPDATE "toolbox_items" SET "description" = '结合链上意图、AI Agent 与跨链账户能力的模块化协议。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r134';
UPDATE "toolbox_items" SET "description" = 'astranova 是用于 Web3 任务、支付、跨链、挖矿或新项目参与的工具。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r135';
UPDATE "toolbox_items" SET "description" = 'dawn挂机挖矿 是用于 Web3 任务、支付、跨链、挖矿或新项目参与的工具。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r136';
UPDATE "toolbox_items" SET "description" = 'yarm嘴撸ai 是用于 Web3 任务、支付、跨链、挖矿或新项目参与的工具。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r137';
UPDATE "toolbox_items" SET "description" = 'trex 是用于 Web3 任务、支付、跨链、挖矿或新项目参与的工具。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r138';
UPDATE "toolbox_items" SET "description" = 'ferra 是用于 Web3 任务、支付、跨链、挖矿或新项目参与的工具。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r139';
UPDATE "toolbox_items" SET "description" = '面向比特币等资产的链上跨链兑换与流动性工具。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r140';
UPDATE "toolbox_items" SET "description" = 'rails 是用于 Web3 任务、支付、跨链、挖矿或新项目参与的工具。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r141';
UPDATE "toolbox_items" SET "description" = 'rumi流媒体挖矿 是用于 Web3 任务、支付、跨链、挖矿或新项目参与的工具。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r142';
UPDATE "toolbox_items" SET "description" = 're跨链桥 是用于 Web3 任务、支付、跨链、挖矿或新项目参与的工具。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r143';
UPDATE "toolbox_items" SET "description" = 'tria支付u卡 是用于 Web3 任务、支付、跨链、挖矿或新项目参与的工具。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r144';
UPDATE "toolbox_items" SET "description" = 'fuseenergy能源 是用于 Web3 任务、支付、跨链、挖矿或新项目参与的工具。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r145';
UPDATE "toolbox_items" SET "description" = '面向以太坊 Gas 市场的基础设施、交易和社区激励平台。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r146';
UPDATE "toolbox_items" SET "description" = 'senpi交易ai代理 是用于 Web3 任务、支付、跨链、挖矿或新项目参与的工具。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r147';
UPDATE "toolbox_items" SET "description" = 'unitas 是用于 Web3 任务、支付、跨链、挖矿或新项目参与的工具。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r148';
UPDATE "toolbox_items" SET "description" = 'katana L1 是用于 Web3 任务、支付、跨链、挖矿或新项目参与的工具。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r149';
UPDATE "toolbox_items" SET "description" = 'katana 生态 是用于 Web3 任务、支付、跨链、挖矿或新项目参与的工具。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r150';
UPDATE "toolbox_items" SET "description" = 'pip代理ai 是用于 Web3 任务、支付、跨链、挖矿或新项目参与的工具。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r151';
UPDATE "toolbox_items" SET "description" = '面向机器人与智能设备的开放协作、数据和 AI 基础设施平台。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r153';
UPDATE "toolbox_items" SET "description" = 'prismax 面向机器人、分布式算力或 AI 基础设施任务。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r154';
UPDATE "toolbox_items" SET "description" = 'perle 面向机器人、分布式算力或 AI 基础设施任务。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r155';
UPDATE "toolbox_items" SET "description" = '去中心化机器学习算力网络与模型训练任务平台。', "rating" = 9, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r156';
UPDATE "toolbox_items" SET "description" = '分布式 AI 算力、模型训练和智能体运行平台。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r157';
UPDATE "toolbox_items" SET "description" = 'june 面向机器人、分布式算力或 AI 基础设施任务。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r158';
UPDATE "toolbox_items" SET "description" = 'Solana 生态收益与质押平台，提供资产存入和奖励任务。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r161';
UPDATE "toolbox_items" SET "description" = 'Abstract 消费级区块链的账号、奖励与生态任务门户。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r162';
UPDATE "toolbox_items" SET "description" = 'hylo 提供链上质押、稳定币收益或挖矿奖励管理。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r163';
UPDATE "toolbox_items" SET "description" = 'Sign 协议代币质押与奖励管理入口。', "rating" = 9, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r164';
UPDATE "toolbox_items" SET "description" = '链上应收账款与 PayFi 协议的流动性和质押入口。', "rating" = 9, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r165';
UPDATE "toolbox_items" SET "description" = 'Sky 生态的借贷、稳定币储蓄与代币质押平台。', "rating" = 9, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r166';
UPDATE "toolbox_items" SET "description" = 'lava比特币质押 提供链上质押、稳定币收益或挖矿奖励管理。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r167';
UPDATE "toolbox_items" SET "description" = '稳定币收益与质押协议，提供资产组合和奖励管理。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r168';
UPDATE "toolbox_items" SET "description" = 'usd稳定币质押挖矿 提供链上质押、稳定币收益或挖矿奖励管理。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r169';
UPDATE "toolbox_items" SET "description" = 'cascade 提供链上质押、稳定币收益或挖矿奖励管理。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r170';
UPDATE "toolbox_items" SET "description" = '链上交易与资本配置项目的公开销售及分配入口。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r171';
UPDATE "toolbox_items" SET "description" = '面向合规早期项目的加密资产发行、认购与积分平台。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r173';
UPDATE "toolbox_items" SET "description" = 'alph 是用于链上新资产发现、交易或策略跟踪的平台。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r177';
UPDATE "toolbox_items" SET "description" = 'tradegenius 是用于链上新资产发现、交易或策略跟踪的平台。', "rating" = 7, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r178';
UPDATE "toolbox_items" SET "description" = 'o1_exchange 是用于链上新资产发现、交易或策略跟踪的平台。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r179';
UPDATE "toolbox_items" SET "description" = '面向 Solana 新资产的发现、交易、钱包追踪与积分平台。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r180';
UPDATE "toolbox_items" SET "description" = 'universalx交易所 是用于链上新资产发现、交易或策略跟踪的平台。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r181';
UPDATE "toolbox_items" SET "description" = 'fomo 是用于链上新资产发现、交易或策略跟踪的平台。', "rating" = 8, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'toolbox-sheet-r182';

INSERT INTO "toolbox_cell_values" ("id", "itemId", "columnId", "value", "createdAt", "updatedAt") VALUES
  ('toolbox-twitter-r2', 'toolbox-firefly', 'toolbox-col-official-twitter', '"@thefireflyapp"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r2', 'toolbox-firefly', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r3', 'toolbox-tako', 'toolbox-col-official-twitter', '"@TakoProtocol"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r3', 'toolbox-tako', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r4', 'toolbox-farcaster', 'toolbox-col-official-twitter', '"@farcaster_xyz"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r4', 'toolbox-farcaster', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r5', 'toolbox-giverep', 'toolbox-col-official-twitter', '"@GiveRepApp"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r5', 'toolbox-giverep', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r6', 'toolbox-reddit', 'toolbox-col-official-twitter', '"@Reddit"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r6', 'toolbox-reddit', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r7', 'toolbox-virtuals', 'toolbox-col-official-twitter', '"@virtuals_io"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r7', 'toolbox-virtuals', 'toolbox-col-token-status', '"已发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r8', 'toolbox-soul', 'toolbox-col-official-twitter', '"未发现官方 X"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r8', 'toolbox-soul', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r9', 'toolbox-glider', 'toolbox-col-official-twitter', '"@glider_fi"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r9', 'toolbox-glider', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r10', 'toolbox-river', 'toolbox-col-official-twitter', '"@RiverdotInc"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r10', 'toolbox-river', 'toolbox-col-token-status', '"已发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r11', 'toolbox-wallchain', 'toolbox-col-official-twitter', '"@wallchain_xyz"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r11', 'toolbox-wallchain', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r12', 'toolbox-ethos', 'toolbox-col-official-twitter', '"@ethos_network"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r12', 'toolbox-ethos', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r13', 'toolbox-x', 'toolbox-col-official-twitter', '"@X"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r13', 'toolbox-x', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r14', 'toolbox-binance-square', 'toolbox-col-official-twitter', '"@BinanceSquare"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r14', 'toolbox-binance-square', 'toolbox-col-token-status', '"已发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r15', 'toolbox-sheet-r15', 'toolbox-col-official-twitter', '"未发现官方 X"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r15', 'toolbox-sheet-r15', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r16', 'toolbox-sheet-r16', 'toolbox-col-official-twitter', '"@highlight_xyz"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r16', 'toolbox-sheet-r16', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r17', 'toolbox-sheet-r17', 'toolbox-col-official-twitter', '"@rodeo_club"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r17', 'toolbox-sheet-r17', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r18', 'toolbox-sheet-r18', 'toolbox-col-official-twitter', '"@X"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r18', 'toolbox-sheet-r18', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r19', 'toolbox-kaito', 'toolbox-col-official-twitter', '"@KaitoAI"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r19', 'toolbox-kaito', 'toolbox-col-token-status', '"已发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r20', 'toolbox-sheet-r20', 'toolbox-col-official-twitter', '"@polarise_xyz"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r20', 'toolbox-sheet-r20', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r21', 'toolbox-base', 'toolbox-col-official-twitter', '"@base"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r21', 'toolbox-base', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r23', 'toolbox-matrica', 'toolbox-col-official-twitter', '"@MatricaLabs"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r23', 'toolbox-matrica', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r26', 'toolbox-cmc', 'toolbox-col-official-twitter', '"@CoinMarketCap"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r26', 'toolbox-cmc', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r27', 'toolbox-coingecko', 'toolbox-col-official-twitter', '"@coingecko"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r27', 'toolbox-coingecko', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r28', 'toolbox-livecoinwatch', 'toolbox-col-official-twitter', '"@LiveCoinWatch"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r28', 'toolbox-livecoinwatch', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r29', 'toolbox-arkm', 'toolbox-col-official-twitter', '"@arkham"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r29', 'toolbox-arkm', 'toolbox-col-token-status', '"已发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r30', 'toolbox-dune', 'toolbox-col-official-twitter', '"@Dune"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r30', 'toolbox-dune', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r31', 'toolbox-nansen', 'toolbox-col-official-twitter', '"@nansen_ai"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r31', 'toolbox-nansen', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r32', 'toolbox-dlnews', 'toolbox-col-official-twitter', '"@dlnews"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r32', 'toolbox-dlnews', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r33', 'toolbox-glassnode', 'toolbox-col-official-twitter', '"@glassnode"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r33', 'toolbox-glassnode', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r34', 'toolbox-treeofalpha', 'toolbox-col-official-twitter', '"@Tree_of_Alpha"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r34', 'toolbox-treeofalpha', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r35', 'toolbox-panewslab', 'toolbox-col-official-twitter', '"@PANews"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r35', 'toolbox-panewslab', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r36', 'toolbox-chainalert', 'toolbox-col-official-twitter', '"@ChainAlertMe"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r36', 'toolbox-chainalert', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r37', 'toolbox-foresight', 'toolbox-col-official-twitter', '"@Foresight_News"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r37', 'toolbox-foresight', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r38', 'toolbox-sheet-r38', 'toolbox-col-official-twitter', '"@coinglass_com"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r38', 'toolbox-sheet-r38', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r39', 'toolbox-sheet-r39', 'toolbox-col-official-twitter', '"@ChainCatcher_"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r39', 'toolbox-sheet-r39', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r40', 'toolbox-sheet-r40', 'toolbox-col-official-twitter', '"@Checkonchain"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r40', 'toolbox-sheet-r40', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r42', 'toolbox-sheet-r42', 'toolbox-col-official-twitter', '"@Polymarket"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r42', 'toolbox-sheet-r42', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r43', 'toolbox-sheet-r43', 'toolbox-col-official-twitter', '"@Kalshi"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r43', 'toolbox-sheet-r43', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r44', 'toolbox-sheet-r44', 'toolbox-col-official-twitter', '"@opinionlabsxyz"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r44', 'toolbox-sheet-r44', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r45', 'toolbox-sheet-r45', 'toolbox-col-official-twitter', '"@predictdotfun"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r45', 'toolbox-sheet-r45', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r46', 'toolbox-sheet-r46', 'toolbox-col-official-twitter', '"@0xProbable"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r46', 'toolbox-sheet-r46', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r47', 'toolbox-sheet-r47', 'toolbox-col-official-twitter', '"@KloutDotGG"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r47', 'toolbox-sheet-r47', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r48', 'toolbox-sheet-r48', 'toolbox-col-official-twitter', '"@fireplacefyi"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r48', 'toolbox-sheet-r48', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r49', 'toolbox-sheet-r49', 'toolbox-col-official-twitter', '"@UpshotHQ"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r49', 'toolbox-sheet-r49', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r50', 'toolbox-sheet-r50', 'toolbox-col-official-twitter', '"@ConvergeMarkets"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r50', 'toolbox-sheet-r50', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r52', 'toolbox-sheet-r52', 'toolbox-col-official-twitter', '"@surf_ai"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r52', 'toolbox-sheet-r52', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r53', 'toolbox-sheet-r53', 'toolbox-col-official-twitter', '"@GeminiApp"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r53', 'toolbox-sheet-r53', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r54', 'toolbox-sheet-r54', 'toolbox-col-official-twitter', '"@ask_edgen"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r54', 'toolbox-sheet-r54', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r55', 'toolbox-sheet-r55', 'toolbox-col-official-twitter', '"@yupp_ai"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r55', 'toolbox-sheet-r55', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r56', 'toolbox-sheet-r56', 'toolbox-col-official-twitter', '"@minaraai"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r56', 'toolbox-sheet-r56', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r57', 'toolbox-sheet-r57', 'toolbox-col-official-twitter', '"@gonka_ai"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r57', 'toolbox-sheet-r57', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r58', 'toolbox-sheet-r58', 'toolbox-col-official-twitter', '"@MyShell_AI"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r58', 'toolbox-sheet-r58', 'toolbox-col-token-status', '"已发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r59', 'toolbox-sheet-r59', 'toolbox-col-official-twitter', '"@Alibaba_Qwen"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r59', 'toolbox-sheet-r59', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r60', 'toolbox-sheet-r60', 'toolbox-col-official-twitter', '"@OpenAI"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r60', 'toolbox-sheet-r60', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r61', 'toolbox-sheet-r61', 'toolbox-col-official-twitter', '"@bananaimg_ai"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r61', 'toolbox-sheet-r61', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r62', 'toolbox-sheet-r62', 'toolbox-col-official-twitter', '"@imagineartcom"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r62', 'toolbox-sheet-r62', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r63', 'toolbox-sheet-r63', 'toolbox-col-official-twitter', '"@NousResearch"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r63', 'toolbox-sheet-r63', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r64', 'toolbox-sheet-r64', 'toolbox-col-official-twitter', '"@AIWayfinder"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r64', 'toolbox-sheet-r64', 'toolbox-col-token-status', '"已发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r65', 'toolbox-sheet-r65', 'toolbox-col-official-twitter', '"@AgentLisaAI"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r65', 'toolbox-sheet-r65', 'toolbox-col-token-status', '"已发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r68', 'toolbox-sheet-r68', 'toolbox-col-official-twitter', '"@UniversalXapp"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r68', 'toolbox-sheet-r68', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r69', 'toolbox-sheet-r69', 'toolbox-col-official-twitter', '"@Backpack"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r69', 'toolbox-sheet-r69', 'toolbox-col-token-status', '"已发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r70', 'toolbox-sheet-r70', 'toolbox-col-official-twitter', '"@grvt_io"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r70', 'toolbox-sheet-r70', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r71', 'toolbox-sheet-r71', 'toolbox-col-official-twitter', '"@Aster_DEX"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r71', 'toolbox-sheet-r71', 'toolbox-col-token-status', '"已发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r72', 'toolbox-sheet-r72', 'toolbox-col-official-twitter', '"@standx_official"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r72', 'toolbox-sheet-r72', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r73', 'toolbox-sheet-r73', 'toolbox-col-official-twitter', '"@edgeX_exchange"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r73', 'toolbox-sheet-r73', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r74', 'toolbox-sheet-r74', 'toolbox-col-official-twitter', '"@paradex"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r74', 'toolbox-sheet-r74', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r75', 'toolbox-sheet-r75', 'toolbox-col-official-twitter', '"@extendedapp"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r75', 'toolbox-sheet-r75', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r76', 'toolbox-sheet-r76', 'toolbox-col-official-twitter', '"@OfficialApeXdex"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r76', 'toolbox-sheet-r76', 'toolbox-col-token-status', '"已发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r77', 'toolbox-sheet-r77', 'toolbox-col-official-twitter', '"@HyperliquidX"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r77', 'toolbox-sheet-r77', 'toolbox-col-token-status', '"已发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r78', 'toolbox-sheet-r78', 'toolbox-col-official-twitter', '"@infinex"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r78', 'toolbox-sheet-r78', 'toolbox-col-token-status', '"已发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r79', 'toolbox-sheet-r79', 'toolbox-col-official-twitter', '"@o1_exchange"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r79', 'toolbox-sheet-r79', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r80', 'toolbox-sheet-r80', 'toolbox-col-official-twitter', '"@defidotapp"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r80', 'toolbox-sheet-r80', 'toolbox-col-token-status', '"已发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r81', 'toolbox-sheet-r81', 'toolbox-col-official-twitter', '"@Titan_Exchange"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r81', 'toolbox-sheet-r81', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r82', 'toolbox-sheet-r82', 'toolbox-col-official-twitter', '"@Lighter_xyz"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r82', 'toolbox-sheet-r82', 'toolbox-col-token-status', '"已发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r83', 'toolbox-sheet-r83', 'toolbox-col-official-twitter', '"@arkham"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r83', 'toolbox-sheet-r83', 'toolbox-col-token-status', '"已发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r84', 'toolbox-sheet-r84', 'toolbox-col-official-twitter', '"@variational_io"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r84', 'toolbox-sheet-r84', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r85', 'toolbox-sheet-r85', 'toolbox-col-official-twitter', '"@vanish_trade"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r85', 'toolbox-sheet-r85', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r86', 'toolbox-sheet-r86', 'toolbox-col-official-twitter', '"@basedotone"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r86', 'toolbox-sheet-r86', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r87', 'toolbox-sheet-r87', 'toolbox-col-official-twitter', '"@BlockSt_HQ"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r87', 'toolbox-sheet-r87', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r88', 'toolbox-sheet-r88', 'toolbox-col-official-twitter', '"@flipster_io"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r88', 'toolbox-sheet-r88', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r89', 'toolbox-sheet-r89', 'toolbox-col-official-twitter', '"@OstiumLabs"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r89', 'toolbox-sheet-r89', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r90', 'toolbox-sheet-r90', 'toolbox-col-official-twitter', '"@nadohq"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r90', 'toolbox-sheet-r90', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r91', 'toolbox-sheet-r91', 'toolbox-col-official-twitter', '"@byreal_io"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r91', 'toolbox-sheet-r91', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r92', 'toolbox-sheet-r92', 'toolbox-col-official-twitter', '"@trycoinpilot"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r92', 'toolbox-sheet-r92', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r95', 'toolbox-sheet-r95', 'toolbox-col-official-twitter', '"@xhunt_ai"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r95', 'toolbox-sheet-r95', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r96', 'toolbox-sheet-r96', 'toolbox-col-official-twitter', '"@CryptoBubbles"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r96', 'toolbox-sheet-r96', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r97', 'toolbox-sheet-r97', 'toolbox-col-official-twitter', '"@bubblemaps"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r97', 'toolbox-sheet-r97', 'toolbox-col-token-status', '"已发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r98', 'toolbox-sheet-r98', 'toolbox-col-official-twitter', '"@DeBankDeFi"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r98', 'toolbox-sheet-r98', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r99', 'toolbox-sheet-r99', 'toolbox-col-official-twitter', '"@arkham"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r99', 'toolbox-sheet-r99', 'toolbox-col-token-status', '"已发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r100', 'toolbox-sheet-r100', 'toolbox-col-official-twitter', '"@zapper_fi"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r100', 'toolbox-sheet-r100', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r101', 'toolbox-sheet-r101', 'toolbox-col-official-twitter', '"@Rabby_io"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r101', 'toolbox-sheet-r101', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r102', 'toolbox-sheet-r102', 'toolbox-col-official-twitter', '"@RootDataLabs"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r102', 'toolbox-sheet-r102', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r103', 'toolbox-sheet-r103', 'toolbox-col-official-twitter', '"@SuperteamEarn"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r103', 'toolbox-sheet-r103', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r104', 'toolbox-sheet-r104', 'toolbox-col-official-twitter', '"@GoWatchoor"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r104', 'toolbox-sheet-r104', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r105', 'toolbox-sheet-r105', 'toolbox-col-official-twitter', '"@AiCoinzh"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r105', 'toolbox-sheet-r105', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r106', 'toolbox-sheet-r106', 'toolbox-col-official-twitter', '"@deBridgeFinance"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r106', 'toolbox-sheet-r106', 'toolbox-col-token-status', '"已发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r107', 'toolbox-sheet-r107', 'toolbox-col-official-twitter', '"@gridyai888"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r107', 'toolbox-sheet-r107', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r108', 'toolbox-sheet-r108', 'toolbox-col-official-twitter', '"@guildxyz"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r108', 'toolbox-sheet-r108', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r110', 'toolbox-sheet-r110', 'toolbox-col-official-twitter', '"@gmail"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r110', 'toolbox-sheet-r110', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r111', 'toolbox-sheet-r111', 'toolbox-col-official-twitter', '"@ProtonPrivacy"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r111', 'toolbox-sheet-r111', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r112', 'toolbox-sheet-r112', 'toolbox-col-official-twitter', '"@Outlook"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r112', 'toolbox-sheet-r112', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r113', 'toolbox-sheet-r113', 'toolbox-col-official-twitter', '"@gmxmail"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r113', 'toolbox-sheet-r113', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r114', 'toolbox-sheet-r114', 'toolbox-col-official-twitter', '"未发现官方 X"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r114', 'toolbox-sheet-r114', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r115', 'toolbox-sheet-r115', 'toolbox-col-official-twitter', '"@web3bio"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r115', 'toolbox-sheet-r115', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r116', 'toolbox-sheet-r116', 'toolbox-col-official-twitter', '"@Linktree_"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r116', 'toolbox-sheet-r116', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r117', 'toolbox-sheet-r117', 'toolbox-col-official-twitter', '"@iSafePal"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r117', 'toolbox-sheet-r117', 'toolbox-col-token-status', '"已发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r118', 'toolbox-sheet-r118', 'toolbox-col-official-twitter', '"@web3serve"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r118', 'toolbox-sheet-r118', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r119', 'toolbox-sheet-r119', 'toolbox-col-official-twitter', '"未发现官方 X"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r119', 'toolbox-sheet-r119', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r120', 'toolbox-sheet-r120', 'toolbox-col-official-twitter', '"@privy_io"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r120', 'toolbox-sheet-r120', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r121', 'toolbox-sheet-r121', 'toolbox-col-official-twitter', '"@ProxyLine_net"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r121', 'toolbox-sheet-r121', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r122', 'toolbox-sheet-r122', 'toolbox-col-official-twitter', '"@smsactivate"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r122', 'toolbox-sheet-r122', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r123', 'toolbox-sheet-r123', 'toolbox-col-official-twitter', '"@crazysmm"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r123', 'toolbox-sheet-r123', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r124', 'toolbox-sheet-r124', 'toolbox-col-official-twitter', '"未发现官方 X"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r124', 'toolbox-sheet-r124', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r125', 'toolbox-sheet-r125', 'toolbox-col-official-twitter', '"@nxonearth"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r125', 'toolbox-sheet-r125', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r126', 'toolbox-sheet-r126', 'toolbox-col-official-twitter', '"@HeroSMS_com"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r126', 'toolbox-sheet-r126', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r127', 'toolbox-sheet-r127', 'toolbox-col-official-twitter', '"未发现官方 X"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r127', 'toolbox-sheet-r127', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r130', 'toolbox-sheet-r130', 'toolbox-col-official-twitter', '"@billions_ntwk"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r130', 'toolbox-sheet-r130', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r131', 'toolbox-sheet-r131', 'toolbox-col-official-twitter', '"@brevis_zk"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r131', 'toolbox-sheet-r131', 'toolbox-col-token-status', '"已发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r132', 'toolbox-sheet-r132', 'toolbox-col-official-twitter', '"@NebulaiHQ"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r132', 'toolbox-sheet-r132', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r133', 'toolbox-sheet-r133', 'toolbox-col-official-twitter', '"@NexusLabs"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r133', 'toolbox-sheet-r133', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r134', 'toolbox-sheet-r134', 'toolbox-col-official-twitter', '"@wardenprotocol"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r134', 'toolbox-sheet-r134', 'toolbox-col-token-status', '"已发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r135', 'toolbox-sheet-r135', 'toolbox-col-official-twitter', '"@AstraNovaWorld"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r135', 'toolbox-sheet-r135', 'toolbox-col-token-status', '"已发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r136', 'toolbox-sheet-r136', 'toolbox-col-official-twitter', '"@dawninternet"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r136', 'toolbox-sheet-r136', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r137', 'toolbox-sheet-r137', 'toolbox-col-official-twitter', '"@Yarm_AI"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r137', 'toolbox-sheet-r137', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r138', 'toolbox-sheet-r138', 'toolbox-col-official-twitter', '"@TREX_chain"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r138', 'toolbox-sheet-r138', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r139', 'toolbox-sheet-r139', 'toolbox-col-official-twitter', '"@ferraProtocol"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r139', 'toolbox-sheet-r139', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r140', 'toolbox-sheet-r140', 'toolbox-col-official-twitter', '"@rifthq"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r140', 'toolbox-sheet-r140', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r141', 'toolbox-sheet-r141', 'toolbox-col-official-twitter', '"@rails_xyz"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r141', 'toolbox-sheet-r141', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r142', 'toolbox-sheet-r142', 'toolbox-col-official-twitter', '"@rumilabs_io"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r142', 'toolbox-sheet-r142', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r143', 'toolbox-sheet-r143', 'toolbox-col-official-twitter', '"@re"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r143', 'toolbox-sheet-r143', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r144', 'toolbox-sheet-r144', 'toolbox-col-official-twitter', '"@useTria"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r144', 'toolbox-sheet-r144', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r145', 'toolbox-sheet-r145', 'toolbox-col-official-twitter', '"@fuseenergy"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r145', 'toolbox-sheet-r145', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r146', 'toolbox-sheet-r146', 'toolbox-col-official-twitter', '"@ETHGasOfficial"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r146', 'toolbox-sheet-r146', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r147', 'toolbox-sheet-r147', 'toolbox-col-official-twitter', '"@senpi_ai"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r147', 'toolbox-sheet-r147', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r148', 'toolbox-sheet-r148', 'toolbox-col-official-twitter', '"@unitas_so"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r148', 'toolbox-sheet-r148', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r149', 'toolbox-sheet-r149', 'toolbox-col-official-twitter', '"@katana"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r149', 'toolbox-sheet-r149', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r150', 'toolbox-sheet-r150', 'toolbox-col-official-twitter', '"@katana"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r150', 'toolbox-sheet-r150', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r151', 'toolbox-sheet-r151', 'toolbox-col-official-twitter', '"@pip_world"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r151', 'toolbox-sheet-r151', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r153', 'toolbox-sheet-r153', 'toolbox-col-official-twitter', '"@OpenMind_AGI"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r153', 'toolbox-sheet-r153', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r154', 'toolbox-sheet-r154', 'toolbox-col-official-twitter', '"@PrismaX"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r154', 'toolbox-sheet-r154', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r155', 'toolbox-sheet-r155', 'toolbox-col-official-twitter', '"@PerleLabs"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r155', 'toolbox-sheet-r155', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r156', 'toolbox-sheet-r156', 'toolbox-col-official-twitter', '"@gensynai"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r156', 'toolbox-sheet-r156', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r157', 'toolbox-sheet-r157', 'toolbox-col-official-twitter', '"@PrimeIntellect"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r157', 'toolbox-sheet-r157', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r158', 'toolbox-sheet-r158', 'toolbox-col-official-twitter', '"@AskJuneAI"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r158', 'toolbox-sheet-r158', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r161', 'toolbox-sheet-r161', 'toolbox-col-official-twitter', '"@solsticefi"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r161', 'toolbox-sheet-r161', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r162', 'toolbox-sheet-r162', 'toolbox-col-official-twitter', '"@AbstractChain"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r162', 'toolbox-sheet-r162', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r163', 'toolbox-sheet-r163', 'toolbox-col-official-twitter', '"@hylo_so"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r163', 'toolbox-sheet-r163', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r164', 'toolbox-sheet-r164', 'toolbox-col-official-twitter', '"@sign"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r164', 'toolbox-sheet-r164', 'toolbox-col-token-status', '"已发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r165', 'toolbox-sheet-r165', 'toolbox-col-official-twitter', '"@humafinance"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r165', 'toolbox-sheet-r165', 'toolbox-col-token-status', '"已发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r166', 'toolbox-sheet-r166', 'toolbox-col-official-twitter', '"@sparkdotfi"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r166', 'toolbox-sheet-r166', 'toolbox-col-token-status', '"已发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r167', 'toolbox-sheet-r167', 'toolbox-col-official-twitter', '"@Lava__xyz"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r167', 'toolbox-sheet-r167', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r168', 'toolbox-sheet-r168', 'toolbox-col-official-twitter', '"@r2yield"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r168', 'toolbox-sheet-r168', 'toolbox-col-token-status', '"已发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r169', 'toolbox-sheet-r169', 'toolbox-col-official-twitter', '"@USDai_Official"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r169', 'toolbox-sheet-r169', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r170', 'toolbox-sheet-r170', 'toolbox-col-official-twitter', '"@cascade_xyz"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r170', 'toolbox-sheet-r170', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r171', 'toolbox-sheet-r171', 'toolbox-col-official-twitter', '"@flyingtulip_"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r171', 'toolbox-sheet-r171', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r173', 'toolbox-sheet-r173', 'toolbox-col-official-twitter', '"@Legiondotcc"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r173', 'toolbox-sheet-r173', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r177', 'toolbox-sheet-r177', 'toolbox-col-official-twitter', '"@alphdotai"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r177', 'toolbox-sheet-r177', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r178', 'toolbox-sheet-r178', 'toolbox-col-official-twitter', '"@TradeGeniusHQ"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r178', 'toolbox-sheet-r178', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r179', 'toolbox-sheet-r179', 'toolbox-col-official-twitter', '"@o1_exchange"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r179', 'toolbox-sheet-r179', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r180', 'toolbox-sheet-r180', 'toolbox-col-official-twitter', '"@AxiomExchange"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r180', 'toolbox-sheet-r180', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r181', 'toolbox-sheet-r181', 'toolbox-col-official-twitter', '"@UniversalXapp"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r181', 'toolbox-sheet-r181', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-twitter-r182', 'toolbox-sheet-r182', 'toolbox-col-official-twitter', '"@fomo"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-token-r182', 'toolbox-sheet-r182', 'toolbox-col-token-status', '"未发币"'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("itemId", "columnId") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "audit_logs" ("id", "action", "targetType", "targetId", "metadata", "createdAt") VALUES
  ('toolbox-enrichment-20260811', 'toolbox.metadata_enriched', 'toolbox.import', '18i-vrpwprwYvRsUIbuJKsiNRCwTuwbtXMokZlili9UM',
   '{"items":162,"officialXMethod":"site-link-and-manual-verification","ratingMethod":"x-evidence-and-influence-tier","tokenMethod":"rootdata-tge-standard"}'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
