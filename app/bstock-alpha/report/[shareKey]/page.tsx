import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bot, CalendarClock, ShieldCheck, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { BstockReportShareActions } from "@/components/bstock-report-share-actions";
import {
  absoluteBstockReportShareUrl,
  bstockReportExcerpt,
  bstockReportSharePath,
  getBstockReportShare
} from "@/lib/bstock-report-share";
import {
  partitionReportMetricContent,
  type ReportMetricLanguage,
  type ReportMetricTable
} from "@/lib/bstock-report-tables";
import { getViewer } from "@/lib/membership";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ shareKey: string }> };

function ReportDataTables({ tables }: { tables: ReportMetricTable[] }) {
  if (!tables.length) return null;
  return (
    <div className="bstock-report-data-tables">
      {tables.map((table) => (
        <div className={`bstock-report-data-table-wrap ${table.kind}`} key={table.id} tabIndex={0} role="region" aria-label={table.title}>
          <table className="bstock-report-data-table">
            <caption>{table.title}</caption>
            <thead><tr>{table.columns.map((column) => <th scope="col" key={column}>{column}</th>)}</tr></thead>
            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr key={`${table.id}-${rowIndex}`}>
                  {row.map((value, columnIndex) => table.kind === "facts" && columnIndex === 0
                    ? <th scope="row" key={`${columnIndex}-${value}`}>{value}</th>
                    : <td key={`${columnIndex}-${value}`}>{value}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function ReportReadingSection({ section, language }: {
  section: { id: string; title: string; paragraphs: string[]; bullets: string[] };
  language: ReportMetricLanguage;
}) {
  const paragraphs = partitionReportMetricContent(section.paragraphs, language);
  const bullets = partitionReportMetricContent(section.bullets, language);
  return (
    <section className="bstock-report-share-section">
      <h2>{section.title}</h2>
      {paragraphs.remaining.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      <ReportDataTables tables={[...paragraphs.tables, ...bullets.tables]} />
      {bullets.remaining.length ? <ul>{bullets.remaining.map((bullet, index) => <li key={index}>{bullet}</li>)}</ul> : null}
    </section>
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { shareKey } = await params;
  const share = await getBstockReportShare(shareKey);
  if (!share) return { title: "bStockAlpha AI Research" };
  const isZh = share.language === "zh";
  const title = `${share.ticker} · ${share.report.title}`;
  const description = bstockReportExcerpt(share.report.executiveSummary[0] || share.report.conclusion[0], 190)
    || (isZh ? "bStockAlpha Agent Studio AI 投资研报" : "bStockAlpha Agent Studio AI investment research");
  const sharePath = bstockReportSharePath(share.shareKey);
  const imagePath = `${sharePath}/opengraph-image`;
  return {
    title: `${title}｜bStockAlpha`,
    description,
    alternates: { canonical: sharePath },
    openGraph: {
      type: "article",
      siteName: "WELINKBTC · bStockAlpha",
      title,
      description,
      url: absoluteBstockReportShareUrl(share.shareKey),
      publishedTime: (share.completedAt ?? share.createdAt).toISOString(),
      images: [{ url: imagePath, width: 1200, height: 630, alt: `${title}｜bStockAlpha` }]
    },
    twitter: { card: "summary_large_image", title, description, images: [imagePath] }
  };
}

export default async function BstockReportSharePage({ params }: PageProps) {
  const { shareKey } = await params;
  const [viewer, share] = await Promise.all([getViewer(), getBstockReportShare(shareKey)]);
  if (!share) notFound();

  const isZh = share.language === "zh";
  const report = share.report;
  const completedAt = share.completedAt ?? share.createdAt;
  const company = isZh ? share.companyNameZh || share.companyName : share.companyName || share.companyNameZh;
  const title = `${share.ticker} · ${report.title}`;
  const excerpt = bstockReportExcerpt(report.executiveSummary[0] || report.conclusion[0], 220);
  const shareUrl = absoluteBstockReportShareUrl(share.shareKey);
  const metricLanguage: ReportMetricLanguage = isZh ? "zh" : "en";
  const summaryContent = partitionReportMetricContent(report.executiveSummary, metricLanguage);
  const conclusionContent = partitionReportMetricContent(report.conclusion, metricLanguage);

  return (
    <AppShell viewer={viewer}>
      <main className="bstock-report-share-page" lang={isZh ? "zh-CN" : "en"}>
        <article className="bstock-report-share-card">
          <header className="bstock-report-share-brand">
            <Link href="/bstock-alpha" aria-label="bStockAlpha">
              <Image src="/welinkbtc-orbit-brand.webp" width={58} height={58} alt="WELINKBTC" priority />
              <span><strong>bStock<span>Alpha</span></strong><small>AGENTIC PNL TERMINAL · BNB SMART CHAIN</small></span>
            </Link>
            <em><ShieldCheck aria-hidden="true" /> VERIFIED RESEARCH SHARE</em>
          </header>

          <section className="bstock-report-share-hero">
            <div className="bstock-report-share-asset">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/bstock-alpha/brand-icon?symbol=${encodeURIComponent(share.symbol)}`} alt="" />
              <div><span>{share.symbol} · BSC</span><strong>{share.ticker}</strong><p>{company || report.subtitle || "Agent Studio"}</p></div>
            </div>
            <div className="bstock-report-share-language">{isZh ? "中文研报" : "ENGLISH REPORT"}</div>
            <p className="bstock-report-share-kicker"><Sparkles aria-hidden="true" /> AGENT STUDIO · AI RESEARCH READING</p>
            <h1>{report.title}</h1>
            {report.subtitle ? <p className="bstock-report-share-subtitle">{report.subtitle}</p> : null}
            <div className="bstock-report-share-time"><CalendarClock aria-hidden="true" /> {isZh ? "研报完成于" : "Report completed"} <time dateTime={completedAt.toISOString()}>{completedAt.toLocaleString(isZh ? "zh-CN" : "en-US", { hour12: false })}</time></div>
          </section>

          {report.highlights.length ? (
            <dl className="bstock-report-share-highlights">
              {report.highlights.map((item) => <div key={`${item.label}-${item.value}`}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
            </dl>
          ) : null}

          <div className="bstock-report-share-body">
            <section className="bstock-report-share-summary">
              <span>EXECUTIVE SUMMARY</span>
              <h2>{isZh ? "核心摘要" : "Executive summary"}</h2>
              {(summaryContent.remaining.length ? summaryContent.remaining : summaryContent.tables.length ? [] : [isZh ? "原始研报未单列执行摘要。" : "The source report did not provide a separate executive summary."]).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
              <ReportDataTables tables={summaryContent.tables} />
            </section>

            {report.sections.map((section) => <ReportReadingSection section={section} language={metricLanguage} key={section.id} />)}

            <section className="bstock-report-share-conclusion">
              <span>CONCLUSION</span>
              <h2>{isZh ? "综合结论" : "Conclusion"}</h2>
              {conclusionContent.remaining.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
              <ReportDataTables tables={conclusionContent.tables} />
            </section>
            <p className="bstock-report-share-disclaimer"><Bot aria-hidden="true" /> {report.disclaimer}</p>
          </div>

          <footer className="bstock-report-share-footer">
            <div><strong>WELINKBTC · bStockAlpha</strong><span>{isZh ? "研究—决策—风控—执行—PnL 归因" : "Research · Decision · Risk · Execution · PnL attribution"}</span></div>
            <BstockReportShareActions language={share.language} title={title} excerpt={excerpt} shareUrl={shareUrl} />
          </footer>
        </article>
        <p className="bstock-report-share-footnote">{isZh ? "公开分享页只包含去敏后的研报赏析，不包含钱包地址、支付凭据或交易会话。" : "This public page contains only a sanitized report reading—never wallet addresses, payment credentials, or trading sessions."}</p>
      </main>
    </AppShell>
  );
}
