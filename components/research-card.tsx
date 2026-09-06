import Image from "next/image";
import Link from "next/link";
import { ArchiveX, Bookmark, Clock3, ExternalLink, Flame, MessageCircle, PencilLine, Radio } from "lucide-react";
import { toggleResearchBookmarkAction, unpublishResearchArticleAction } from "@/app/actions/research";
import { ResearchDraftDelete } from "@/components/research-draft-delete";
import { ResearchShareMenu } from "@/components/research-share-menu";
import { absoluteResearchShareUrl, researchArticlePath, researchSharePath } from "@/lib/research-routing";

type ResearchCardProps = {
  canManage?: boolean;
  article: {
    id: string;
    slug: string;
    title: string;
    excerpt: string;
    category: string;
    coverImageUrl: string | null;
    sourceType: "INTERNAL" | "EXTERNAL";
    externalUrl: string | null;
    accessLabel: string;
    draft: boolean;
    readingMinutes: number;
    publishedAt: Date;
    viewCount: number;
    bookmarkCount: number;
    commentCount: number;
    heatScore: number;
    bookmarked: boolean;
  };
};

const numberFormatter = new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 });

export function ResearchCard({ article, canManage = false }: ResearchCardProps) {
  const bookmarkAction = toggleResearchBookmarkAction.bind(null, article.id);
  const unpublishAction = unpublishResearchArticleAction.bind(null, article.id);
  const coverImage = article.coverImageUrl || "/research/research-default.png";
  const sourceLabel = article.sourceType === "EXTERNAL" ? "外部精选" : article.externalUrl ? "站内导入" : "站内原创";
  const articlePath = researchArticlePath(article.slug);
  const sharePath = researchSharePath(article.slug);
  const shareUrl = absoluteResearchShareUrl(article.slug);
  const coverShareUrl = new URL(coverImage, process.env.NEXT_PUBLIC_APP_URL ?? "https://www.welinkbtc-onchainmain.xyz").toString();

  return (
    <article className={`research-story-card${article.sourceType === "EXTERNAL" ? " research-story-card--external" : ""}`}>
      <div className="research-story-media">
        <Link href={articlePath} aria-label={`阅读：${article.title}`} prefetch={false}>
          <Image
            src={coverImage}
            alt={`${article.title}文章缩略图`}
            fill
            sizes="(max-width: 760px) 100vw, (max-width: 1080px) 50vw, 33vw"
            className="research-story-image"
          />
        </Link>
        <span className="research-source-badge">
          {article.sourceType === "INTERNAL" && !article.externalUrl ? <Radio aria-hidden="true" /> : <ExternalLink aria-hidden="true" />}
          {sourceLabel}
        </span>
        <div className="research-media-actions">
          {!article.draft ? (
            <ResearchShareMenu
              compact
              title={article.title}
              excerpt={article.excerpt}
              coverImageUrl={coverShareUrl}
              shareUrl={shareUrl}
              sharePath={sharePath}
            />
          ) : null}
          <form action={bookmarkAction} className="research-bookmark-form">
            <button
              className={`research-bookmark-button${article.bookmarked ? " is-saved" : ""}`}
              type="submit"
              aria-label={article.bookmarked ? `取消收藏 ${article.title}` : `收藏 ${article.title}`}
              aria-pressed={article.bookmarked}
              title={article.bookmarked ? "取消收藏" : "收藏文章"}
            >
              <Bookmark aria-hidden="true" fill={article.bookmarked ? "currentColor" : "none"} />
            </button>
          </form>
        </div>
      </div>

      <div className="research-story-content">
        <div className="research-story-labels">
          <span>{article.category}</span>
          <em>{article.accessLabel}{article.draft ? " · 草稿" : ""}</em>
        </div>
        <div className="research-story-time">
          <time dateTime={article.publishedAt.toISOString()}>{article.publishedAt.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })}</time>
          <span><Clock3 aria-hidden="true" /> {article.readingMinutes} 分钟阅读</span>
        </div>
        <Link className="research-story-link" href={articlePath} prefetch={false}>
          <h3>{article.title}</h3>
          <p>{article.excerpt}</p>
        </Link>
        {canManage ? (
          <div className="research-story-admin-actions" aria-label="管理员文章操作">
            <Link href={`/research?edit=${encodeURIComponent(article.id)}#research-editor`} prefetch={false}>
              <PencilLine aria-hidden="true" />修改编辑
            </Link>
            {article.draft ? (
              <>
                <span><ArchiveX aria-hidden="true" />已下架，可编辑后重新发布</span>
                <ResearchDraftDelete articleId={article.id} title={article.title} />
              </>
            ) : (
              <form action={unpublishAction}>
                <button type="submit"><ArchiveX aria-hidden="true" />下架</button>
              </form>
            )}
          </div>
        ) : null}
        <footer>
          <div className="research-story-signals" aria-label="文章热度数据">
            <span title="综合热度"><Flame aria-hidden="true" /> {numberFormatter.format(article.heatScore)}</span>
            <span title="评论"><MessageCircle aria-hidden="true" /> {numberFormatter.format(article.commentCount)}</span>
            <span title="收藏"><Bookmark aria-hidden="true" /> {numberFormatter.format(article.bookmarkCount)}</span>
          </div>
          <Link href={articlePath} prefetch={false}>
            {article.sourceType === "EXTERNAL" ? "站内浏览 ↗" : "阅读全文 →"}
          </Link>
        </footer>
      </div>
    </article>
  );
}
