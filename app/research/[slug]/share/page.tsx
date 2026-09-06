import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock3, Radio, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ResearchShareMenu } from "@/components/research-share-menu";
import { getPublishedResearchArticle } from "@/lib/research-data";
import { getViewer } from "@/lib/membership";
import { absoluteResearchShareUrl, researchArticlePath, researchSharePath } from "@/lib/research-routing";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublishedResearchArticle(slug);
  if (!article) return { title: "研究分享页" };
  const sharePath = researchSharePath(article.slug);
  const imagePath = `${sharePath}/preview-image`;
  return {
    title: `${article.title}｜WELINKBTC Research`,
    description: article.excerpt,
    alternates: { canonical: sharePath },
    openGraph: {
      type: "article",
      siteName: "WELINKBTC Research",
      title: article.title,
      description: article.excerpt,
      url: absoluteResearchShareUrl(article.slug),
      publishedTime: (article.publishedAt ?? article.createdAt).toISOString(),
      images: [{ url: imagePath, width: 1200, height: 630, alt: `${article.title}｜WELINKBTC Research` }]
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.excerpt,
      images: [imagePath]
    }
  };
}

export default async function ResearchSharePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [viewer, article] = await Promise.all([getViewer(), getPublishedResearchArticle(slug)]);
  if (!article) notFound();

  const coverImage = article.coverImageUrl || "/research/research-default.png";
  const coverShareUrl = new URL(coverImage, process.env.NEXT_PUBLIC_APP_URL ?? "https://www.welinkbtc-onchainmain.xyz").toString();
  const articlePath = researchArticlePath(article.slug);
  const sharePath = researchSharePath(article.slug);
  const shareUrl = absoluteResearchShareUrl(article.slug);
  const publishedAt = article.publishedAt ?? article.createdAt;

  return (
    <AppShell viewer={viewer}>
      <main className="research-share-page">
        <section className="research-share-card">
          <div className="research-share-brand">
            <Image src="/welinkbtc-orbit-brand.webp" width={62} height={62} alt="WELINKBTC 品牌标识" />
            <div><span>WELINKBTC</span><strong>ON-CHAIN MAIN · RESEARCH</strong></div>
            <em><ShieldCheck aria-hidden="true" /> VERIFIED SHARE</em>
          </div>
          <div className="research-share-cover">
            <Image src={coverImage} alt={`${article.title}分享封面`} fill priority sizes="(max-width: 900px) 100vw, 760px" />
            <span><Radio aria-hidden="true" /> {article.sourceType === "INTERNAL" ? "站内原创" : "外部精选"}</span>
          </div>
          <div className="research-share-copy">
            <p className="research-page-kicker">{article.category} · RESEARCH BRIEF</p>
            <h1>{article.title}</h1>
            <p>{article.excerpt}</p>
            <div className="research-share-meta">
              <time dateTime={publishedAt.toISOString()}>{publishedAt.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })}</time>
              <span><Clock3 aria-hidden="true" /> {article.readingMinutes} 分钟阅读</span>
            </div>
            <div className="research-share-cta">
              <Link href={articlePath} prefetch={false}>在 WELINKBTC 阅读全文 →</Link>
              <ResearchShareMenu title={article.title} excerpt={article.excerpt} coverImageUrl={coverShareUrl} shareUrl={shareUrl} sharePath={sharePath} />
            </div>
          </div>
        </section>
        <p className="research-share-footnote">WELINKBTC Research · 把周期、链上数据与市场结构连接到同一个工作台。</p>
      </main>
    </AppShell>
  );
}
