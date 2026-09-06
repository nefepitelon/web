import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Bookmark, Clock3, ExternalLink, Eye, Flame, MessageCircle, Radio } from "lucide-react";
import { createResearchCommentAction, toggleResearchBookmarkAction } from "@/app/actions/research";
import { AppShell } from "@/components/app-shell";
import { ResearchBody } from "@/components/research-body";
import { ReadingProgressBar, ResearchViewTracker } from "@/components/research-engagement";
import { ResearchExternalReader } from "@/components/research-external-reader";
import { getViewer } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { researchArticlePath, researchSlugCandidates } from "@/lib/research-routing";

export const dynamic = "force-dynamic";

const getResearchArticle = cache((slug: string) => prisma.researchArticle.findFirst({
  where: { slug: { in: researchSlugCandidates(slug) } },
  include: {
    _count: { select: { bookmarks: true, comments: { where: { status: "PUBLISHED" } } } },
    comments: {
      where: { status: "PUBLISHED" },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { user: { select: { email: true, profile: { select: { displayName: true, handle: true } } } } }
    }
  }
}));

function canRead(access: "PUBLIC" | "FREE" | "PRO" | "MAX", viewer: Awaited<ReturnType<typeof getViewer>>) {
  if (access === "PUBLIC" || viewer?.role === "admin") return true;
  if (!viewer) return false;
  if (access === "FREE") return true;
  if (access === "PRO") return viewer.plan === "pro" || viewer.plan === "max";
  return viewer.plan === "max";
}

function displayCommentAuthor(comment: { user: { email: string; profile: { displayName: string | null; handle: string | null } | null } }) {
  return comment.user.profile?.displayName || (comment.user.profile?.handle ? `${comment.user.profile.handle}.welinkBTC` : comment.user.email.split("@")[0]);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = await getResearchArticle(slug);
  if (!article) return { title: "研究文章" };
  return {
    title: article.title,
    description: article.excerpt,
    openGraph: article.coverImageUrl ? { images: [{ url: article.coverImageUrl, alt: article.title }] } : undefined
  };
}

export default async function ResearchArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [viewer, article] = await Promise.all([getViewer(), getResearchArticle(slug)]);
  if (!article || (article.status !== "PUBLISHED" && viewer?.role !== "admin")) notFound();

  const allowed = canRead(article.access, viewer);
  const accessLabel = { PUBLIC: "公开研究", FREE: "登录用户", PRO: "Pro 研究", MAX: "Max 研究" }[article.access];
  const bookmarked = viewer
    ? Boolean(await prisma.researchBookmark.findUnique({ where: { articleId_userId: { articleId: article.id, userId: viewer.id } }, select: { id: true } }))
    : false;
  const bookmarkAction = toggleResearchBookmarkAction.bind(null, article.id);
  const commentAction = createResearchCommentAction.bind(null, article.id);
  const heatScore = article.viewCount + article._count.bookmarks * 6 + article._count.comments * 10;
  const publishedAt = article.publishedAt ?? article.createdAt;
  const coverImage = article.coverImageUrl || "/research/research-default.png";
  const articlePath = researchArticlePath(article.slug);

  return (
    <AppShell viewer={viewer}>
      <ReadingProgressBar />
      {article.status === "PUBLISHED" ? <ResearchViewTracker articleId={article.id} /> : null}
      <main className="research-article-page">
        <Link className="research-back-link" href="/research" prefetch={false}>← 返回研究档案</Link>
        <article className="research-article-shell">
          <header className="research-article-header">
            <div className="research-article-meta">
              <span>{article.category}</span>
              <span>{accessLabel}</span>
              <span>{article.sourceType === "INTERNAL" && !article.externalUrl ? <Radio aria-hidden="true" /> : <ExternalLink aria-hidden="true" />}{article.sourceType === "EXTERNAL" ? "外部精选" : article.externalUrl ? "站内导入" : "站内原创"}</span>
              {article.status === "DRAFT" ? <span>草稿预览</span> : null}
            </div>
            <h1>{article.title}</h1>
            <p>{article.excerpt}</p>
            <div className="research-article-byline">
              <time dateTime={publishedAt.toISOString()}>{publishedAt.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })}</time>
              <span><Clock3 aria-hidden="true" />{article.readingMinutes} 分钟阅读</span>
              <span><Eye aria-hidden="true" />{article.viewCount} 次阅读</span>
              <span><Flame aria-hidden="true" />热度 {heatScore}</span>
              <span><MessageCircle aria-hidden="true" />{article._count.comments} 条评论</span>
              <form action={bookmarkAction}><button type="submit" className={bookmarked ? "is-saved" : ""}><Bookmark aria-hidden="true" fill={bookmarked ? "currentColor" : "none"} />{bookmarked ? "已收藏" : "收藏"}</button></form>
            </div>
            {article.sourceType === "INTERNAL" && article.externalUrl ? <a className="research-import-source" href={article.externalUrl} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" />查看导入原文与来源</a> : null}
          </header>

          <figure className="research-article-cover">
            <Image src={coverImage} alt={`${article.title}封面`} fill priority sizes="(max-width: 980px) 100vw, 1100px" />
          </figure>

          {allowed ? (
            article.sourceType === "EXTERNAL" && article.externalUrl
              ? <ResearchExternalReader title={article.title} url={article.externalUrl} />
              : <ResearchBody body={article.body} />
          ) : (
            <section className="research-article-lock">
              <p className="research-page-kicker">MEMBERSHIP ACCESS</p>
              <h2>这篇文章需要 {accessLabel} 权限</h2>
              <p>文章正文只在服务端确认权限后返回。升级后即可阅读完整研究内容。</p>
              <Link className="research-subscribe-button" href={viewer ? "/account/subscription" : `/login?next=${encodeURIComponent(articlePath)}`} prefetch={false}>
                {viewer ? "查看会员方案 →" : "登录继续 →"}
              </Link>
            </section>
          )}
        </article>

        {allowed ? (
          <section className="research-comments" id="comments">
            <div className="research-comments-heading"><div><p className="research-page-kicker">RESEARCH DISCUSSION</p><h2>研究讨论</h2></div><span>{article._count.comments} 条评论</span></div>
            {viewer ? (
              <form action={commentAction} className="research-comment-form">
                <span aria-hidden="true">{(viewer.displayName || viewer.handle || viewer.email).slice(0, 1).toUpperCase()}</span>
                <label><textarea name="comment" required minLength={2} maxLength={2000} placeholder="分享你的判断、补充数据或提出问题…" /><button type="submit">发表评论</button></label>
              </form>
            ) : (
              <Link className="research-comment-login" href={`/login?next=${encodeURIComponent(`${articlePath}#comments`)}`} prefetch={false}>登录后参与研究讨论 →</Link>
            )}
            <div className="research-comment-list">
              {article.comments.map((comment) => {
                const author = displayCommentAuthor(comment);
                return (
                  <article key={comment.id}>
                    <span aria-hidden="true">{author.slice(0, 1).toUpperCase()}</span>
                    <div><header><strong>{author}</strong><time>{comment.createdAt.toLocaleDateString("zh-CN")}</time></header><p>{comment.body}</p></div>
                  </article>
                );
              })}
              {!article.comments.length ? <p className="research-empty-state">还没有评论。成为第一个留下研究判断的人。</p> : null}
            </div>
          </section>
        ) : null}
      </main>
    </AppShell>
  );
}
