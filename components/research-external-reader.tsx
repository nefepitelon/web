import { ExternalLink, ShieldCheck } from "lucide-react";

export function ResearchExternalReader({ title, url }: { title: string; url: string }) {
  const hostname = (() => {
    try { return new URL(url).hostname; } catch { return "外部来源"; }
  })();

  return (
    <section className="research-external-reader">
      <header>
        <div><ShieldCheck aria-hidden="true" /><span><strong>站内安全浏览</strong><small>{hostname}</small></span></div>
        <a href={url} target="_blank" rel="noopener noreferrer">无法显示？打开原文 <ExternalLink aria-hidden="true" /></a>
      </header>
      <iframe
        src={url}
        title={`${title}外部原文`}
        loading="eager"
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
      />
      <p>部分来源可能禁止网页嵌入；遇到空白或登录限制时，请使用右上角“打开原文”。收藏、评论和热度仍保留在 welinkBTC。</p>
    </section>
  );
}
