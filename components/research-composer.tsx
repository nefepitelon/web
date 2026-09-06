"use client";

import Image from "next/image";
import Link from "next/link";
import { type ClipboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Bold,
  Eye,
  FileText,
  ImagePlus,
  Italic,
  Link2,
  List,
  MessageCircle,
  Quote,
  Send,
  Trash2,
  UploadCloud
} from "lucide-react";
import { createResearchArticleAction, updateResearchArticleAction } from "@/app/actions/research";
import { ResearchBody } from "@/components/research-body";

type UploadedAsset = {
  url: string;
  name: string;
  type: string;
  kind: "image" | "file";
};

type InlineImage = {
  url: string;
  caption: string;
};

type ResearchComposerArticle = {
  id: string;
  title: string;
  slug: string;
  category: string;
  excerpt: string;
  body: string;
  coverImageUrl: string | null;
  access: "PUBLIC" | "FREE" | "PRO" | "MAX";
  status: "DRAFT" | "PUBLISHED";
  sourceType: "INTERNAL" | "EXTERNAL";
  externalUrl: string | null;
  readingMinutes: number;
  featured: boolean;
};

const DRAFT_KEY = "welinkbtc:research-composer-draft";
const markdownImagePattern = /!\[([^\]]*)\]\((https:\/\/[^)\s]+)\)/g;

function inlineImagesFromMarkdown(value: string) {
  return Array.from(value.matchAll(markdownImagePattern), (match) => ({
    url: match[2],
    caption: match[1] || "研究文章配图"
  }));
}

function markdownCaption(value: string) {
  return value.replace(/[\[\]\r\n]/g, " ").trim() || "研究文章配图";
}

type EditorSelection = { start: number; end: number };

function insertMarkdownAtSelection(value: string, markdown: string, selection: EditorSelection) {
  const start = Math.min(Math.max(selection.start, 0), value.length);
  const end = Math.min(Math.max(selection.end, start), value.length);
  const left = value.slice(0, start);
  const right = value.slice(end);
  const before = left.length && !left.endsWith("\n\n") ? (left.endsWith("\n") ? "\n" : "\n\n") : "";
  const after = right.length && !right.startsWith("\n\n") ? (right.startsWith("\n") ? "\n" : "\n\n") : "";
  const insertion = `${before}${markdown.trim()}${after}`;
  return { value: `${left}${insertion}${right}`, caret: left.length + insertion.length };
}

function textAroundSelection(textarea: HTMLTextAreaElement, before: string, after = before) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end) || "输入内容";
  const next = `${textarea.value.slice(0, start)}${before}${selected}${after}${textarea.value.slice(end)}`;
  textarea.value = next;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
  });
}

export function ResearchComposer({ article }: { article?: ResearchComposerArticle }) {
  const storageKey = article ? `${DRAFT_KEY}:${article.id}` : DRAFT_KEY;
  const submitAction = article ? updateResearchArticleAction.bind(null, article.id) : createResearchArticleAction;
  const [title, setTitle] = useState(article?.title ?? "");
  const [excerpt, setExcerpt] = useState(article?.excerpt ?? "");
  const [body, setBody] = useState(article?.body ?? "");
  const [coverImageUrl, setCoverImageUrl] = useState(article?.coverImageUrl ?? "");
  const [sourceType, setSourceType] = useState<"INTERNAL" | "EXTERNAL">(article?.sourceType ?? "INTERNAL");
  const [preview, setPreview] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const assetInputRef = useRef<HTMLInputElement>(null);
  const inlineImages = useMemo(() => inlineImagesFromMarkdown(body), [body]);

  useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(storageKey) ?? "null") as {
        title?: string;
        excerpt?: string;
        body?: string;
        coverImageUrl?: string;
        inlineImages?: InlineImage[];
        sourceType?: "INTERNAL" | "EXTERNAL";
      } | null;
      if (!draft) return;
      setTitle(draft.title ?? "");
      setExcerpt(draft.excerpt ?? "");
      const restoredBody = draft.body ?? "";
      const legacyImageMarkdown = inlineImagesFromMarkdown(restoredBody).length === 0
        ? (draft.inlineImages ?? []).map((image) => `![${markdownCaption(image.caption)}](${image.url})`).join("\n\n")
        : "";
      setBody([restoredBody.trim(), legacyImageMarkdown].filter(Boolean).join("\n\n"));
      setCoverImageUrl(draft.coverImageUrl ?? "");
      setSourceType(draft.sourceType ?? "INTERNAL");
    } catch {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      localStorage.setItem(storageKey, JSON.stringify({ title, excerpt, body, coverImageUrl, sourceType }));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [body, coverImageUrl, excerpt, sourceType, storageKey, title]);

  async function storeAsset(file: File) {
    if (file.size > 4 * 1024 * 1024) {
      throw new Error(`${file.name || "剪贴板图片"} 不能超过 4MB`);
    }
    const data = new FormData();
    data.set("file", file, file.name || `pasted-image-${Date.now()}.png`);
    const response = await fetch("/api/research/upload", { method: "POST", body: data });
    const result = await response.json() as UploadedAsset & { error?: string };
    if (!response.ok) throw new Error(result.error || "上传失败");
    return result;
  }

  function currentSelection(): EditorSelection {
    const textarea = bodyRef.current;
    return textarea ? { start: textarea.selectionStart, end: textarea.selectionEnd } : { start: body.length, end: body.length };
  }

  function insertBodyMarkdown(markdown: string, selection: EditorSelection) {
    let caret = selection.start;
    setBody((current) => {
      const inserted = insertMarkdownAtSelection(current, markdown, selection);
      caret = inserted.caret;
      return inserted.value;
    });
    requestAnimationFrame(() => {
      bodyRef.current?.focus();
      bodyRef.current?.setSelectionRange(caret, caret);
    });
  }

  async function uploadCover(file: File) {
    setUploading(true);
    setUploadMessage("正在上传封面…");
    try {
      const result = await storeAsset(file);
      if (result.kind !== "image") throw new Error("封面必须是图片");
      setCoverImageUrl(result.url);
      setUploadMessage(`${result.name} 已设为封面`);
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  async function uploadBodyAssets(files: File[], selection = currentSelection()) {
    if (!files.length) return;
    setUploading(true);
    setUploadMessage(files.length > 1 ? `正在上传 ${files.length} 个素材…` : "正在上传正文素材…");
    const uploaded: UploadedAsset[] = [];
    try {
      for (const file of files.slice(0, 8)) uploaded.push(await storeAsset(file));
      const markdown = uploaded.map((result) => result.kind === "image"
        ? `![${markdownCaption(result.name)}](${result.url})`
        : `[📎 ${result.name}](${result.url})`
      ).join("\n\n");
      insertBodyMarkdown(markdown, selection);
      setUploadMessage(uploaded.length > 1 ? `${uploaded.length} 个素材已插入到光标位置` : `${uploaded[0].name} 已插入到正文`);
    } catch (error) {
      if (uploaded.length) {
        const markdown = uploaded.map((result) => result.kind === "image"
          ? `![${markdownCaption(result.name)}](${result.url})`
          : `[📎 ${result.name}](${result.url})`
        ).join("\n\n");
        insertBodyMarkdown(markdown, selection);
      }
      setUploadMessage(error instanceof Error ? error.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  function handleBodyPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const images = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (!images.length) return;
    event.preventDefault();
    const selection = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd };
    void uploadBodyAssets(images, selection);
  }

  function updateInlineImageCaption(index: number, caption: string) {
    let imageIndex = -1;
    setBody((current) => current.replace(markdownImagePattern, (token, _oldCaption: string, url: string) => {
      imageIndex += 1;
      return imageIndex === index ? `![${markdownCaption(caption)}](${url})` : token;
    }));
  }

  function deleteInlineImage(index: number) {
    let imageIndex = -1;
    setBody((current) => current.replace(markdownImagePattern, (token) => {
      imageIndex += 1;
      return imageIndex === index ? "" : token;
    }).replace(/\n{3,}/g, "\n\n").trim());
  }

  async function upload(file: File, purpose: "cover" | "asset") {
    if (purpose === "cover") {
      await uploadCover(file);
    } else {
      await uploadBodyAssets([file]);
    }
  }

  function format(before: string, after?: string) {
    if (bodyRef.current) textAroundSelection(bodyRef.current, before, after);
  }

  const publishedBody = body.trim();

  return (
    <section className="research-admin-composer" id="research-editor">
      <form action={submitAction} className="research-x-composer" onSubmit={() => localStorage.removeItem(storageKey)}>
        <header className="research-composer-topbar">
          <div><span>{article ? "编辑" : "草稿"}</span><small>{article ? `正在修改：${article.title}` : "自动保存到当前浏览器"}</small></div>
          <div>
            {article ? <Link className="research-composer-cancel" href="/research#research-archive">取消编辑</Link> : null}
            <button type="button" className="research-composer-preview" onClick={() => setPreview((current) => !current)}><Eye aria-hidden="true" />{preview ? "继续编辑" : "预览"}</button>
            <button className="research-composer-publish" type="submit"><Send aria-hidden="true" />{article ? "保存修改" : "发布 / 保存"}</button>
          </div>
        </header>

        <div className="research-composer-cover">
          {coverImageUrl ? <Image src={coverImageUrl} alt="文章封面预览" fill sizes="(max-width: 980px) 100vw, 1200px" /> : null}
          <button type="button" onClick={() => coverInputRef.current?.click()} disabled={uploading}><ImagePlus aria-hidden="true" /><strong>{coverImageUrl ? "更换封面" : "上传文章封面"}</strong><span>建议 5:2 或 16:9，最大 4MB</span></button>
          <input ref={coverInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, "cover"); event.currentTarget.value = ""; }} />
          <input type="hidden" name="coverImageUrl" value={coverImageUrl} />
        </div>

        <div className="research-composer-writing">
          <input className="research-composer-title" name="title" value={title} onChange={(event) => setTitle(event.target.value)} required minLength={4} maxLength={160} placeholder="添加标题" />
          <textarea className="research-composer-excerpt" name="excerpt" value={excerpt} onChange={(event) => setExcerpt(event.target.value)} required minLength={12} maxLength={600} placeholder="用一两句话概括这篇研究…" />

          <div className="research-composer-toolbar" aria-label="正文编辑工具栏">
            <button type="button" aria-label="加粗" title="加粗" onClick={() => format("**")}><Bold aria-hidden="true" /></button>
            <button type="button" aria-label="斜体" title="斜体" onClick={() => format("*")}><Italic aria-hidden="true" /></button>
            <button type="button" aria-label="引用" title="引用" onClick={() => format("> ", "")}><Quote aria-hidden="true" /></button>
            <button type="button" aria-label="列表" title="列表" onClick={() => format("- ", "")}><List aria-hidden="true" /></button>
            <button type="button" aria-label="链接" title="链接" onClick={() => format("[", "](https://)")}><Link2 aria-hidden="true" /></button>
            <button type="button" aria-label="上传图片或文件" title="上传图片或文件" onClick={() => assetInputRef.current?.click()} disabled={uploading}><UploadCloud aria-hidden="true" /></button>
            <input ref={assetInputRef} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/markdown,.doc,.docx" hidden onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.length) void uploadBodyAssets(files); event.currentTarget.value = ""; }} />
            <span aria-live="polite">{uploadMessage || `${body.length} 个字`}</span>
          </div>
          <small className="research-composer-paste-hint"><ImagePlus aria-hidden="true" />可直接在正文中按 Ctrl/⌘ + V 粘贴剪贴板图片；图片会上传并插入到当前光标位置。</small>

          {inlineImages.length ? (
            <div className="research-composer-inline-images" aria-label="正文图片">
              {inlineImages.map((image, index) => (
                <figure key={`${image.url}-${index}`}>
                  <div><Image src={image.url} alt={image.caption || "研究文章配图预览"} fill sizes="(max-width: 760px) 100vw, 540px" /></div>
                  <figcaption>
                    <label><span>图片说明</span><input value={image.caption} onChange={(event) => updateInlineImageCaption(index, event.target.value)} /></label>
                    <button type="button" onClick={() => deleteInlineImage(index)} aria-label={`删除图片 ${image.caption}`}><Trash2 aria-hidden="true" />删除</button>
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : null}

          {preview ? (
            <div className="research-composer-live-preview">
              <h2>{title || "文章标题"}</h2>
              <p>{excerpt || "文章摘要会显示在这里。"}</p>
              {publishedBody ? <ResearchBody body={publishedBody} /> : <p>正文预览会显示在这里。</p>}
            </div>
          ) : (
            <textarea ref={bodyRef} className="research-composer-body" value={body} onChange={(event) => setBody(event.target.value)} onPaste={handleBodyPaste} readOnly={uploading} aria-busy={uploading} required minLength={40} maxLength={100000} placeholder="开始撰写。支持 ## 小标题、引用、列表、链接；也可以直接粘贴剪贴板图片…" />
          )}
          <input type="hidden" name="body" value={publishedBody} />
        </div>

        <div className="research-composer-settings">
          <label><span>文章来源</span><select name="sourceType" value={sourceType} onChange={(event) => setSourceType(event.target.value as "INTERNAL" | "EXTERNAL")}><option value="INTERNAL">站内原创</option><option value="EXTERNAL">外部精选</option></select></label>
          <label className={sourceType === "EXTERNAL" || Boolean(article?.externalUrl) ? "is-visible" : ""}><span>{sourceType === "EXTERNAL" ? "外部原文 URL" : "导入来源 URL"}</span><input name="externalUrl" type="url" placeholder="https://…" required={sourceType === "EXTERNAL"} defaultValue={article?.externalUrl ?? ""} /></label>
          <label><span>URL 标识</span><input name="slug" maxLength={160} placeholder="留空则根据标题生成" defaultValue={article?.slug ?? ""} /></label>
          <label><span>分类</span><input name="category" required defaultValue={article?.category ?? "ON-CHAIN"} maxLength={40} /></label>
          <label><span>访问级别</span><select name="access" defaultValue={article?.access ?? "PUBLIC"}><option value="PUBLIC">公开</option><option value="FREE">登录用户</option><option value="PRO">Pro</option><option value="MAX">Max</option></select></label>
          <label><span>发布状态</span><select name="status" defaultValue={article?.status ?? "PUBLISHED"}><option value="PUBLISHED">立即发布</option><option value="DRAFT">保存草稿</option></select></label>
          <label><span>预计阅读分钟</span><input name="readingMinutes" type="number" min="0" max="90" defaultValue={article?.readingMinutes ?? 0} /><small>填 0 自动估算</small></label>
          <label className="research-composer-featured"><input name="featured" type="checkbox" defaultChecked={article?.featured ?? false} /><span>设为首页精选</span></label>
        </div>

        <footer className="research-composer-footer">
          <span><MessageCircle aria-hidden="true" />发布后自动开启评论、收藏与热度统计</span>
          <span><FileText aria-hidden="true" />站内和外链文章共用同一研究档案</span>
        </footer>
      </form>
    </section>
  );
}
