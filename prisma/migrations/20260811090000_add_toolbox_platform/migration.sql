-- CreateTable
CREATE TABLE "toolbox_categories" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "color" TEXT NOT NULL DEFAULT '#4BA3D8',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isPublic" BOOLEAN NOT NULL DEFAULT TRUE,
  "isCollapsed" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "toolbox_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "toolbox_items" (
  "id" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" VARCHAR(1000),
  "officialUrl" TEXT,
  "loginAccount" VARCHAR(1000),
  "isPublished" BOOLEAN NOT NULL DEFAULT FALSE,
  "rating" INTEGER,
  "financing" TEXT,
  "tutorial" VARCHAR(2000),
  "isPublic" BOOLEAN NOT NULL DEFAULT TRUE,
  "rowColor" TEXT NOT NULL DEFAULT 'none',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdBy" UUID,
  "updatedBy" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "toolbox_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "toolbox_columns" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'text',
  "width" INTEGER NOT NULL DEFAULT 160,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isSystem" BOOLEAN NOT NULL DEFAULT FALSE,
  "isVisible" BOOLEAN NOT NULL DEFAULT TRUE,
  "isPublic" BOOLEAN NOT NULL DEFAULT TRUE,
  "isSensitive" BOOLEAN NOT NULL DEFAULT FALSE,
  "isEditable" BOOLEAN NOT NULL DEFAULT TRUE,
  "isRequired" BOOLEAN NOT NULL DEFAULT FALSE,
  "options" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "toolbox_columns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "toolbox_cell_values" (
  "id" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "columnId" TEXT NOT NULL,
  "value" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "toolbox_cell_values_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "toolbox_favorites" (
  "id" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "itemId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "toolbox_favorites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "toolbox_columns_key_key" ON "toolbox_columns"("key");
CREATE INDEX "toolbox_categories_sortOrder_idx" ON "toolbox_categories"("sortOrder");
CREATE INDEX "toolbox_items_categoryId_sortOrder_idx" ON "toolbox_items"("categoryId", "sortOrder");
CREATE INDEX "toolbox_items_isPublic_isPublished_idx" ON "toolbox_items"("isPublic", "isPublished");
CREATE INDEX "toolbox_columns_sortOrder_idx" ON "toolbox_columns"("sortOrder");
CREATE UNIQUE INDEX "toolbox_cell_values_itemId_columnId_key" ON "toolbox_cell_values"("itemId", "columnId");
CREATE INDEX "toolbox_cell_values_columnId_idx" ON "toolbox_cell_values"("columnId");
CREATE UNIQUE INDEX "toolbox_favorites_userId_itemId_key" ON "toolbox_favorites"("userId", "itemId");
CREATE INDEX "toolbox_favorites_userId_createdAt_idx" ON "toolbox_favorites"("userId", "createdAt");

ALTER TABLE "toolbox_items" ADD CONSTRAINT "toolbox_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "toolbox_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "toolbox_cell_values" ADD CONSTRAINT "toolbox_cell_values_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "toolbox_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "toolbox_cell_values" ADD CONSTRAINT "toolbox_cell_values_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "toolbox_columns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "toolbox_favorites" ADD CONSTRAINT "toolbox_favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "toolbox_favorites" ADD CONSTRAINT "toolbox_favorites_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "toolbox_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "toolbox_categories" ("id", "name", "description", "color", "sortOrder", "isPublic", "isCollapsed", "createdAt", "updatedAt") VALUES
  ('toolbox-cat-socialfi', 'SocialFi 社交类', '社交协议、内容分发与社区增长平台', '#3BA6D8', 10, TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-cat-identity', '身份认证', '钱包身份、社交图谱与社区验证', '#8B7CF6', 20, TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-cat-analytics', '咨询数据分析平台', '市场、链上数据、资讯与研究工具', '#2AA876', 30, TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "toolbox_columns" ("id", "key", "title", "type", "width", "sortOrder", "isSystem", "isVisible", "isPublic", "isSensitive", "isEditable", "isRequired", "createdAt", "updatedAt") VALUES
  ('toolbox-col-category', 'category', '分类', 'category', 170, 10, TRUE, TRUE, TRUE, FALSE, FALSE, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-col-order', 'sortOrder', '序号', 'number', 76, 20, TRUE, TRUE, TRUE, FALSE, FALSE, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-col-name', 'name', '名称', 'text', 190, 30, TRUE, TRUE, TRUE, FALSE, TRUE, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-col-description', 'description', '简要描述', 'text', 260, 40, TRUE, TRUE, TRUE, FALSE, TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-col-url', 'officialUrl', '官网链接', 'url', 250, 50, TRUE, TRUE, TRUE, FALSE, TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-col-login', 'loginAccount', '登录账号', 'text', 210, 60, TRUE, TRUE, FALSE, TRUE, TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-col-published', 'isPublished', '是否发布', 'boolean', 116, 70, TRUE, TRUE, FALSE, FALSE, TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-col-rating', 'rating', '评分', 'rating', 100, 80, TRUE, TRUE, TRUE, FALSE, TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-col-financing', 'financing', '融资', 'text', 140, 90, TRUE, TRUE, TRUE, FALSE, TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-col-tutorial', 'tutorial', '空投交互教程', 'url_text', 220, 100, TRUE, TRUE, TRUE, FALSE, TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-col-public', 'isPublic', '是否公开', 'boolean', 116, 110, TRUE, TRUE, FALSE, FALSE, TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "toolbox_items" ("id", "categoryId", "name", "description", "officialUrl", "loginAccount", "isPublished", "rating", "financing", "tutorial", "isPublic", "rowColor", "sortOrder", "createdAt", "updatedAt") VALUES
  ('toolbox-firefly', 'toolbox-cat-socialfi', 'Firefly', '多信息流社交聚合与加密社区发现', 'https://firefly.social', '推特、谷歌邮箱', TRUE, 7, '未公布', '多信息流社交聚合', TRUE, 'green', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-tako', 'toolbox-cat-socialfi', 'tako', '开放社交图谱与内容发现', 'https://app.tako.so', '谷歌邮箱', TRUE, 5, '200万', '社交发帖', TRUE, 'yellow', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-farcaster', 'toolbox-cat-socialfi', 'farcaster', '去中心化社交协议与客户端生态', 'https://farcaster.xyz', '独立钱包、app', TRUE, 8, '1.8亿', '社交发帖', TRUE, 'green', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-giverep', 'toolbox-cat-socialfi', 'giverep', 'SocialFi 声誉与贡献激励', 'https://giverep.com', '推特、slush钱包', TRUE, 6, '未公布', '推特发帖', TRUE, 'none', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-reddit', 'toolbox-cat-socialfi', 'reddit', '全球社区与话题讨论平台', 'https://www.reddit.com', '谷歌账号', TRUE, 8, NULL, NULL, TRUE, 'none', 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-virtuals', 'toolbox-cat-socialfi', 'virtuals', 'AI Agent 资产与社交生态', 'https://app.virtuals.io', 'OKX / 小狐狸钱包', TRUE, 7, NULL, NULL, TRUE, 'green', 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-soul', 'toolbox-cat-socialfi', 'soul', '链上社交身份与关系网络', 'https://app.soul.io', NULL, TRUE, 5, NULL, NULL, TRUE, 'none', 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-glider', 'toolbox-cat-socialfi', 'glider', '社交交易与任务平台', 'https://glider.fi', 'OKX / 小狐狸钱包', TRUE, 6, NULL, NULL, TRUE, 'none', 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-river', 'toolbox-cat-socialfi', 'river', '链上社区协议', 'https://app.river.inc', 'OKX / 小狐狸钱包', TRUE, 7, NULL, NULL, TRUE, 'none', 9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-wallchain', 'toolbox-cat-socialfi', 'wallchain', '社交增长和社区任务工具', 'https://app.wallchain.xyz', '推特账号', TRUE, 7, NULL, NULL, TRUE, 'none', 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-ethos', 'toolbox-cat-socialfi', 'ethos', 'Web3 声誉与信任评分', 'https://app.ethos.network', 'OKX / 小狐狸钱包', TRUE, 6, NULL, NULL, TRUE, 'none', 11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-x', 'toolbox-cat-socialfi', '推特', '加密行业实时资讯与社区运营主阵地', 'https://x.com', 'https://x.com/welinkBNB', TRUE, 9, NULL, '关注、发帖与 Space', TRUE, 'yellow', 12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-binance-square', 'toolbox-cat-socialfi', '币安广场', '币安生态内容与社区广场', 'https://www.binance.com/square', '币安', TRUE, 8, NULL, '内容发布', TRUE, 'yellow', 13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-kaito', 'toolbox-cat-socialfi', 'kaito', '加密注意力市场与 Yaps 影响力积分', 'https://yaps.kaito.ai', '推特', TRUE, 8, NULL, '发布优质加密内容', TRUE, 'red', 14, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-base', 'toolbox-cat-socialfi', 'Base 钱包', 'Base 生态钱包与社交入口', 'https://base.app', 'Base 钱包', TRUE, 7, NULL, NULL, TRUE, 'green', 15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-matrica', 'toolbox-cat-identity', 'matrica', 'Discord 社区钱包身份认证', 'https://matrica.io', 'Phantom 钱包', TRUE, 6, NULL, NULL, TRUE, 'none', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-cmc', 'toolbox-cat-analytics', 'CoinMarketCap', '加密资产行情、市值与基础资料', 'https://coinmarketcap.com', '谷歌邮箱', TRUE, 8, NULL, NULL, TRUE, 'none', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-coingecko', 'toolbox-cat-analytics', 'CoinGecko', '市场行情、分类与代币追踪', 'https://www.coingecko.com/zh', NULL, TRUE, 8, NULL, NULL, TRUE, 'none', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-livecoinwatch', 'toolbox-cat-analytics', 'LiveCoinWatch', '实时币价与自选组合', 'https://www.livecoinwatch.com', '谷歌邮箱、推特', TRUE, 7, NULL, NULL, TRUE, 'none', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-arkm', 'toolbox-cat-analytics', 'Arkham', '链上实体标签与资金流分析', 'https://arkm.com', NULL, TRUE, 9, NULL, '地址与实体追踪', TRUE, 'none', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-dune', 'toolbox-cat-analytics', 'Dune', '社区驱动的链上 SQL 数据看板', 'https://dune.com', 'Dune 账号', TRUE, 9, NULL, '查询与看板教程', TRUE, 'yellow', 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-nansen', 'toolbox-cat-analytics', 'Nansen', '聪明钱标签与链上资金流分析', 'https://app.nansen.ai', 'OKX / 小狐狸钱包', TRUE, 9, NULL, NULL, TRUE, 'yellow', 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-dlnews', 'toolbox-cat-analytics', 'DL News', '加密行业深度新闻', 'https://www.dlnews.com/articles', NULL, TRUE, 7, NULL, NULL, TRUE, 'none', 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-glassnode', 'toolbox-cat-analytics', 'Glassnode', '比特币和加密资产链上指标', 'https://studio.glassnode.com', '谷歌邮箱', TRUE, 9, NULL, '指标方法论', TRUE, 'yellow', 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-treeofalpha', 'toolbox-cat-analytics', 'Tree of Alpha', '实时市场新闻与事件流', 'https://news.treeofalpha.com', 'Discord 账号', TRUE, 8, NULL, NULL, TRUE, 'yellow', 9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-panewslab', 'toolbox-cat-analytics', 'PANewsLab 财经日历', '加密行业事件和财经日历', 'https://www.panewslab.com/zh/calendar', NULL, TRUE, 7, NULL, NULL, TRUE, 'yellow', 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-chainalert', 'toolbox-cat-analytics', 'ChainAlert 币链快报', '行情异动和链上快报', 'https://app.chainalert.me', NULL, TRUE, 7, NULL, NULL, TRUE, 'yellow', 11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('toolbox-foresight', 'toolbox-cat-analytics', 'Foresight News 财经日历', '行业会议、解锁与重要日历', 'https://foresightnews.pro/calendar', NULL, TRUE, 7, NULL, NULL, TRUE, 'yellow', 12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "system_settings" ("key", "value", "description", "updatedAt") VALUES
  ('toolbox.settings', '{"showActions":true,"operatorCanCreate":true,"operatorCanDelete":false,"operatorCanBulk":true}'::jsonb, '百宝箱操作列与操作员权限', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
