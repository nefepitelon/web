-- CreateEnum
CREATE TYPE "ResearchArticleSource" AS ENUM ('INTERNAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "ResearchCommentStatus" AS ENUM ('PUBLISHED', 'HIDDEN');

-- AlterTable
ALTER TABLE "research_articles"
ADD COLUMN "coverImageUrl" TEXT,
ADD COLUMN "sourceType" "ResearchArticleSource" NOT NULL DEFAULT 'INTERNAL',
ADD COLUMN "externalUrl" TEXT,
ADD COLUMN "readingMinutes" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "research_bookmarks" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "research_bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_comments" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "status" "ResearchCommentStatus" NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "research_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "research_articles_sourceType_status_publishedAt_idx" ON "research_articles"("sourceType", "status", "publishedAt");
CREATE UNIQUE INDEX "research_bookmarks_articleId_userId_key" ON "research_bookmarks"("articleId", "userId");
CREATE INDEX "research_bookmarks_userId_createdAt_idx" ON "research_bookmarks"("userId", "createdAt");
CREATE INDEX "research_comments_articleId_status_createdAt_idx" ON "research_comments"("articleId", "status", "createdAt");
CREATE INDEX "research_comments_userId_createdAt_idx" ON "research_comments"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "research_bookmarks" ADD CONSTRAINT "research_bookmarks_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "research_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "research_bookmarks" ADD CONSTRAINT "research_bookmarks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "research_comments" ADD CONSTRAINT "research_comments_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "research_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "research_comments" ADD CONSTRAINT "research_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the three external research selections so they participate in bookmarks,
-- comments, view counts and the same in-site reader as native articles.
INSERT INTO "research_articles" (
  "id", "slug", "title", "excerpt", "body", "coverImageUrl", "category", "access", "status",
  "sourceType", "externalUrl", "readingMinutes", "viewCount", "featured", "publishedAt", "createdAt", "updatedAt"
) VALUES
  (
    'external-binance-etf-flow', 'etf-miner-credit-window',
    'ETF 资金流、矿工储备与下一轮信用窗口',
    '追踪机构现货流入、矿工储备变化与流动性窗口的同步信号。',
    '这是一篇由 welinkBTC Research Desk 精选的外部研究。你可以在本站阅读器中浏览原文，并参与收藏和评论。',
    '/research/research-default.png', 'MARKET NOTE', 'PUBLIC', 'PUBLISHED', 'EXTERNAL',
    'https://app.binance.com/uni-qr/cart/34184548091217?l=zh-CN&r=RO493GFE&uc=web_square_share_link&uco=_VFCufWHFOIV6ADcMT4mEw&us=copylink',
    7, 0, TRUE, '2026-07-18T00:00:00.000Z', '2026-07-18T00:00:00.000Z', '2026-07-18T00:00:00.000Z'
  ),
  (
    'external-binance-lth', 'volatility-long-term-holder-behavior',
    '波动率冲击后，长期持有者行为如何变化',
    '从长期持有者成本与已实现损益判断筹码在剧烈波动后的迁移方向。',
    '这是一篇由 welinkBTC Research Desk 精选的外部研究。你可以在本站阅读器中浏览原文，并参与收藏和评论。',
    '/research/research-default.png', 'ON-CHAIN', 'PUBLIC', 'PUBLISHED', 'EXTERNAL',
    'https://app.binance.com/uni-qr/cart/344242053864049?l=zh-CN&r=RO493GFE&uc=web_square_share_link&uco=_VFCufWHFOIV6ADcMT4mEw&us=copylink',
    6, 0, TRUE, '2026-06-21T00:00:00.000Z', '2026-06-21T00:00:00.000Z', '2026-06-21T00:00:00.000Z'
  ),
  (
    'external-binance-macd', 'macd-ict-pa-reversal-model',
    '胜率极高的 MACD 三重背离与 ICT、PA 共振反转模型',
    '结合动量背离、流动性结构与价格行为，拆解高确定性反转条件。',
    '这是一篇由 welinkBTC Research Desk 精选的外部研究。你可以在本站阅读器中浏览原文，并参与收藏和评论。',
    '/research/research-default.png', 'RISK', 'PUBLIC', 'PUBLISHED', 'EXTERNAL',
    'https://app.binance.com/uni-qr/cart/323691031633937?l=zh-CN&r=RO493GFE&uc=web_square_share_link&uco=_VFCufWHFOIV6ADcMT4mEw&us=copylink',
    9, 0, TRUE, '2026-05-30T00:00:00.000Z', '2026-05-30T00:00:00.000Z', '2026-05-30T00:00:00.000Z'
  )
ON CONFLICT ("slug") DO NOTHING;
