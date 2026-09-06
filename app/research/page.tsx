import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { Prisma } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { ResearchArchiveFilters } from "@/components/research-archive-filters";
import { ResearchCard } from "@/components/research-card";
import { ResearchComposer } from "@/components/research-composer";
import { ResearchImporter } from "@/components/research-importer";
import { getViewer } from "@/lib/membership";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "On-Chain Main Research",
  description: "welinkBTC 宏观周期、BTC 链上指标与市场结构研究档案。"
};

const accessLabels = { PUBLIC: "公开", FREE: "Free", PRO: "Pro", MAX: "Max" } as const;

type ResearchPageProps = {
  searchParams: Promise<{ edit?: string; imported?: string; importMethod?: string; deleted?: string; unpublished?: string; error?: string; q?: string; category?: string; sort?: string }>;
};

const researchSorts = {
  newest: [{ publishedAt: "desc" }, { createdAt: "desc" }],
  popular: [{ viewCount: "desc" }, { publishedAt: "desc" }],
  quick: [{ readingMinutes: "asc" }, { publishedAt: "desc" }],
  deep: [{ readingMinutes: "desc" }, { publishedAt: "desc" }],
  oldest: [{ publishedAt: "asc" }, { createdAt: "asc" }]
} satisfies Record<string, Prisma.ResearchArticleOrderByWithRelationInput[]>;

function isResearchSort(value: string): value is keyof typeof researchSorts {
  return value in researchSorts;
}

export default async function ResearchPage({ searchParams }: ResearchPageProps) {
  const query = await searchParams;
  const viewer = await getViewer();
  const isAdmin = viewer?.role === "admin";
  const now = new Date();
  const searchQuery = query.q?.trim().slice(0, 100) ?? "";
  const selectedCategory = query.category?.trim().slice(0, 80) ?? "";
  const selectedSort: keyof typeof researchSorts = query.sort && isResearchSort(query.sort) ? query.sort : "newest";
  const visibilityWhere: Prisma.ResearchArticleWhereInput = isAdmin ? {} : { status: "PUBLISHED", publishedAt: { lte: now } };
  const articleWhere: Prisma.ResearchArticleWhereInput = {
    AND: [
      visibilityWhere,
      selectedCategory ? { category: selectedCategory } : {},
      searchQuery ? {
        OR: [
          { title: { contains: searchQuery, mode: "insensitive" } },
          { excerpt: { contains: searchQuery, mode: "insensitive" } },
          { category: { contains: searchQuery, mode: "insensitive" } }
        ]
      } : {}
    ]
  };
  const [articles, categoryGroups, publishedCount, bookmarkRows, editingArticle] = await Promise.all([
    prisma.researchArticle.findMany({
      where: articleWhere,
      orderBy: researchSorts[selectedSort],
      include: {
        _count: {
          select: {
            bookmarks: true,
            comments: { where: { status: "PUBLISHED" } }
          }
        }
      }
    }),
    prisma.researchArticle.groupBy({
      by: ["category"],
      where: visibilityWhere,
      _count: { _all: true },
      orderBy: { category: "asc" }
    }),
    prisma.researchArticle.count({ where: { status: "PUBLISHED", publishedAt: { lte: now } } }),
    viewer ? prisma.researchBookmark.findMany({ where: { userId: viewer.id }, select: { articleId: true } }) : Promise.resolve([]),
    isAdmin && query.edit ? prisma.researchArticle.findUnique({ where: { id: query.edit } }) : Promise.resolve(null)
  ]);
  const bookmarkedIds = new Set(bookmarkRows.map((item) => item.articleId));
  const totalHeat = articles.reduce((sum, article) => sum + article.viewCount + article._count.bookmarks * 6 + article._count.comments * 10, 0);
  const categories = categoryGroups.map((item) => ({ name: item.category, count: item._count._all }));

  return (
    <AppShell viewer={viewer}>
      <main className="research-page">
        <section className="research-page-hero">
          <div className="research-page-intro">
            <span className="research-page-pill"><i /> EXPERT INSIGHTS</span>
            <p className="research-page-kicker">WELINKBTC RESEARCH DESK</p>
            <h1><span>WELINKBTC</span> ON-CHAIN MAIN RESEARCH</h1>
            <p className="research-page-lead">深度拆解宏观周期、BTC 链上指标与市场结构，为严肃市场参与者提供持续更新的研究档案。</p>
            <div className="research-page-stats">
              <div><strong>8,000+</strong><span>SUBSCRIBERS</span></div>
              <div><strong>{71 + publishedCount}</strong><span>ARTICLES</span></div>
              <div><strong>{new Intl.NumberFormat("zh-CN", { notation: "compact" }).format(totalHeat)}</strong><span>RESEARCH HEAT</span></div>
            </div>
          </div>
          <aside className="research-subscription-card">
            <p className="research-page-kicker">WEEKLY SIGNAL</p>
            <h2>Never miss an article</h2>
            <p>加入专业订阅者，第一时间收到更锐利的市场分析。</p>
            <ul><li>完整文章访问</li><li>收藏与站内评论</li><li>外部研究站内浏览</li></ul>
            <Link className="research-subscribe-button" href={viewer ? "/account/subscription" : "/login"} prefetch={false}>
              {viewer ? "管理研究权限 →" : "登录 / 订阅 →"}
            </Link>
          </aside>
        </section>

        {isAdmin ? (
          <>
            {query.unpublished === "1" ? <p className="research-admin-notice" role="status">文章已下架并转为草稿，同时已从首页精选中移除。</p> : null}
            {query.imported === "1" && query.importMethod === "x_oembed" ? <p className="research-admin-notice" role="status">已通过 X 官方嵌入接口建立站内草稿。若帖子指向 X 长文章，请从原页面复制获授权的正文并粘贴到编辑器后再发布。</p> : null}
            {query.imported === "1" && query.importMethod === "manual_paste" ? <p className="research-admin-notice" role="status">授权正文已转换为站内草稿。请核对标题、段落、图片和来源后再发布。</p> : null}
            {query.imported === "1" && !["x_oembed", "manual_paste"].includes(query.importMethod || "") ? <p className="research-admin-notice" role="status">外链文章已抓取为站内草稿。请核对正文、图片和授权信息后再发布。</p> : null}
            {query.deleted === "1" ? <p className="research-admin-notice" role="status">研究草稿及其未发布数据已永久删除。</p> : null}
            {query.error === "article-not-found" ? <p className="research-admin-notice is-error" role="alert">没有找到要操作的研究文章，请刷新后重试。</p> : null}
            {query.error === "published-delete-blocked" ? <p className="research-admin-notice is-error" role="alert">已发布文章不能直接删除，请先执行下架，再删除草稿。</p> : null}
            <ResearchImporter />
            <ResearchComposer
              key={editingArticle?.id ?? "new"}
              article={editingArticle ? {
                id: editingArticle.id,
                title: editingArticle.title,
                slug: editingArticle.slug,
                category: editingArticle.category,
                excerpt: editingArticle.excerpt,
                body: editingArticle.body,
                coverImageUrl: editingArticle.coverImageUrl,
                access: editingArticle.access,
                status: editingArticle.status,
                sourceType: editingArticle.sourceType,
                externalUrl: editingArticle.externalUrl,
                readingMinutes: editingArticle.readingMinutes,
                featured: editingArticle.featured
              } : undefined}
            />
          </>
        ) : null}

        <section className="research-archive-section" id="research-archive">
          <div className="research-section-heading">
            <div><p className="research-page-kicker">RESEARCH ARCHIVE</p><h2>让研究内容像产品一样可信。</h2></div>
            <p><strong>站内原创</strong>与<strong>外部精选</strong>统一沉淀；收藏、评论和阅读热度都保留在 welinkBTC。</p>
          </div>
          <Suspense fallback={<div className="research-archive-controls is-loading" aria-hidden="true" />}>
            <ResearchArchiveFilters
              key={`${searchQuery}:${selectedCategory}:${selectedSort}`}
              query={searchQuery}
              category={selectedCategory}
              sort={selectedSort}
              resultCount={articles.length}
              categories={categories}
            />
          </Suspense>
          <div className="research-article-grid">
            {articles.map((article) => (
              <ResearchCard
                key={article.id}
                canManage={isAdmin}
                article={{
                  id: article.id,
                  slug: article.slug,
                  title: article.title,
                  excerpt: article.excerpt,
                  category: article.category,
                  coverImageUrl: article.coverImageUrl,
                  sourceType: article.sourceType,
                  externalUrl: article.externalUrl,
                  accessLabel: accessLabels[article.access],
                  draft: article.status === "DRAFT",
                  readingMinutes: article.readingMinutes,
                  publishedAt: article.publishedAt ?? article.createdAt,
                  viewCount: article.viewCount,
                  bookmarkCount: article._count.bookmarks,
                  commentCount: article._count.comments,
                  heatScore: article.viewCount + article._count.bookmarks * 6 + article._count.comments * 10,
                  bookmarked: bookmarkedIds.has(article.id)
                }}
              />
            ))}
          </div>
          {!articles.length ? <p className="research-empty-state">没有找到符合条件的研究文章。请尝试其他关键词或分类。</p> : null}
        </section>
      </main>
    </AppShell>
  );
}
