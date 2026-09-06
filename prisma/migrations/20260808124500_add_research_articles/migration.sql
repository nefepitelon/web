-- CreateEnum
CREATE TYPE "ResearchArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "ResearchArticleAccess" AS ENUM ('PUBLIC', 'FREE', 'PRO', 'MAX');

-- CreateTable
CREATE TABLE "research_articles" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" VARCHAR(600) NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'ON-CHAIN',
    "access" "ResearchArticleAccess" NOT NULL DEFAULT 'PUBLIC',
    "status" "ResearchArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "authorUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_articles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "research_articles_slug_key" ON "research_articles"("slug");

-- CreateIndex
CREATE INDEX "research_articles_status_publishedAt_idx" ON "research_articles"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "research_articles_category_publishedAt_idx" ON "research_articles"("category", "publishedAt");

-- AddForeignKey
ALTER TABLE "research_articles" ADD CONSTRAINT "research_articles_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
