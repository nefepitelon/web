"use client";

import { useState } from "react";
import { ClipboardPaste, FileDown, Link2, ShieldCheck } from "lucide-react";

type ImportResult = {
  ok?: boolean;
  articleId?: string;
  importedImageCount?: number;
  skippedImageCount?: number;
  importMethod?: "AUTO_HTML" | "X_OEMBED" | "MANUAL_PASTE";
  warning?: string;
  code?: string;
  manualImport?: boolean;
  error?: string;
};

export function ResearchImporter() {
  const [url, setUrl] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [importing, setImporting] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualBody, setManualBody] = useState("");
  const [manualHtml, setManualHtml] = useState("");

  function openImportedDraft(result: ImportResult) {
    const method = result.importMethod?.toLowerCase() ?? "auto_html";
    window.location.assign(`/research?edit=${encodeURIComponent(result.articleId!)}&imported=1&importMethod=${encodeURIComponent(method)}#research-editor`);
  }

  async function importArticle() {
    if (!rightsConfirmed) {
      setMessage("请先确认你拥有转载、转载授权或内容使用权。");
      return;
    }
    setImporting(true);
    setMessage("正在识别正文并同步可用图片，请稍候…");
    try {
      const response = await fetch("/api/research/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "auto", url, rightsConfirmed })
      });
      const result = await response.json() as ImportResult;
      if (!response.ok || !result.articleId) {
        if (result.manualImport) {
          setManualOpen(true);
          setMessage(result.error || "来源不允许自动抓取，请改用授权粘贴导入。");
          window.requestAnimationFrame(() => document.querySelector("#research-manual-import")?.scrollIntoView({ behavior: "smooth", block: "center" }));
          return;
        }
        throw new Error(result.error || "文章导入失败");
      }
      const imageNote = result.skippedImageCount
        ? `已同步 ${result.importedImageCount ?? 0} 张图片，${result.skippedImageCount} 张未通过安全或大小校验。`
        : `已同步 ${result.importedImageCount ?? 0} 张图片。`;
      setMessage(result.warning || `导入完成，已保存为站内草稿。${imageNote}`);
      openImportedDraft(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "文章导入失败");
    } finally {
      setImporting(false);
    }
  }

  async function importPastedArticle() {
    if (!rightsConfirmed) {
      setMessage("请先确认你拥有转载、转载授权或内容使用权。");
      return;
    }
    if (manualTitle.trim().length < 4 || manualBody.trim().length < 40) {
      setMessage("请填写文章标题，并粘贴至少 40 个字符的完整正文。");
      return;
    }
    setImporting(true);
    setMessage("正在把授权正文转换为可编辑的站内草稿…");
    try {
      const response = await fetch("/api/research/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "manual",
          url,
          title: manualTitle,
          body: manualHtml || manualBody,
          bodyFormat: manualHtml ? "html" : "markdown",
          rightsConfirmed
        })
      });
      const result = await response.json() as ImportResult;
      if (!response.ok || !result.articleId) throw new Error(result.error || "粘贴导入失败");
      setMessage(result.warning || "正文已保存为站内草稿。");
      openImportedDraft(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "粘贴导入失败");
    } finally {
      setImporting(false);
    }
  }

  return (
    <section className="research-importer" aria-labelledby="research-importer-title">
      <div className="research-importer-copy">
        <span><FileDown aria-hidden="true" /> URL IMPORTER</span>
        <h2 id="research-importer-title">一键抓取为站内草稿</h2>
        <p>识别标题、摘要、正文结构与文章图片；导入后不会立即发布，可先预览、修改分类和访问权限。</p>
      </div>
      <div className="research-importer-form">
        <label className="research-importer-url">
          <Link2 aria-hidden="true" />
          <span className="sr-only">精品文章 URL</span>
          <input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="粘贴已获授权的原文 URL…" required />
          <button type="button" onClick={() => void importArticle()} disabled={importing || !url.trim()}>{importing ? "抓取中…" : "抓取为草稿"}</button>
        </label>
        <label className="research-importer-rights">
          <input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} />
          <ShieldCheck aria-hidden="true" />
          <span>我确认拥有转载、授权导入或内容使用权；系统会遵守来源站点的抓取规则。</span>
        </label>
        <button className="research-importer-manual-toggle" type="button" onClick={() => setManualOpen((current) => !current)} aria-expanded={manualOpen} aria-controls="research-manual-import">
          <ClipboardPaste aria-hidden="true" />
          {manualOpen ? "收起授权粘贴导入" : "来源禁止抓取？改用授权粘贴导入"}
        </button>
        {message ? <p className="research-importer-status" role="status">{message}</p> : null}
      </div>
      {manualOpen ? (
        <section className="research-manual-import" id="research-manual-import" aria-labelledby="research-manual-import-title">
          <div>
            <span><ClipboardPaste aria-hidden="true" /> MANUAL FALLBACK</span>
            <h3 id="research-manual-import-title">从浏览器复制正文后粘贴</h3>
            <p>适用于 robots.txt、登录态或动态页面。系统读取剪贴板中的富文本并转换标题、段落、列表、链接和图片位置，不会绕过来源网站限制。</p>
          </div>
          <label>
            <span>文章标题</span>
            <input value={manualTitle} onChange={(event) => setManualTitle(event.target.value)} maxLength={160} placeholder="填写获授权文章的标题" />
          </label>
          <label className="research-manual-import-body">
            <span>正文内容 {manualHtml ? <em>已识别富文本结构</em> : null}</span>
            <textarea
              value={manualBody}
              onChange={(event) => {
                setManualBody(event.target.value);
                setManualHtml("");
              }}
              onPaste={(event) => {
                const html = event.clipboardData.getData("text/html");
                const text = event.clipboardData.getData("text/plain");
                if (!html) return;
                event.preventDefault();
                setManualHtml(html);
                setManualBody(text);
              }}
              rows={10}
              placeholder="在原页面复制已获授权的完整正文，然后粘贴到这里…"
            />
          </label>
          <button type="button" onClick={() => void importPastedArticle()} disabled={importing || !url.trim() || manualTitle.trim().length < 4 || manualBody.trim().length < 40}>
            {importing ? "正在保存…" : "保存粘贴内容为草稿"}
          </button>
        </section>
      ) : null}
    </section>
  );
}
