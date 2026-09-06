"use client";

import Link from "next/link";
import { Check, Copy, ExternalLink, Globe2, Link2, Send, Share2, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

type ResearchShareMenuProps = {
  title: string;
  excerpt: string;
  coverImageUrl: string;
  shareUrl: string;
  sharePath: string;
  compact?: boolean;
};

function encoded(value: string) {
  return encodeURIComponent(value);
}

export function ResearchShareMenu({ title, excerpt, coverImageUrl, shareUrl, sharePath, compact = false }: ResearchShareMenuProps) {
  const [copied, setCopied] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const dialogId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const preparedText = `${title}\n\n${excerpt}\n${shareUrl}`;
  const xUrl = `https://twitter.com/intent/tweet?text=${encoded(`${title} — WELINKBTC Research`)}&url=${encoded(shareUrl)}`;
  const weiboUrl = `https://service.weibo.com/share/share.php?url=${encoded(shareUrl)}&title=${encoded(`${title}｜WELINKBTC Research`)}&pic=${encoded(coverImageUrl)}`;
  const telegramUrl = `https://t.me/share/url?url=${encoded(shareUrl)}&text=${encoded(`${title}\n${excerpt}`)}`;
  const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encoded(shareUrl)}`;

  async function copyShareText(value = shareUrl) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  function openBinanceSquare() {
    window.open("https://www.binance.com/square/creator-center/home", "_blank", "noopener,noreferrer");
    void copyShareText(preparedText);
  }

  async function openSystemShare() {
    try {
      if (navigator.share) {
        await navigator.share({ title, text: excerpt, url: shareUrl });
        return;
      }
      await copyShareText();
    } catch {
      // Closing the native share sheet is an intentional user action.
    }
  }

  useEffect(() => {
    if (!isDialogOpen) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : triggerRef.current;
    closeButtonRef.current?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsDialogOpen(false);
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      previouslyFocused?.focus();
    };
  }, [isDialogOpen]);

  const sharePanel = (
    <div className={`research-share-popover${compact ? " research-share-popover--dialog" : ""}`} role={compact ? undefined : "group"} aria-label="选择分享平台">
      <div className="research-share-popover-heading">
        <div>
          <span>SHARE RESEARCH</span>
          <strong id={compact ? `${dialogId}-title` : undefined}>分享这篇研究</strong>
        </div>
        {compact ? (
          <button ref={closeButtonRef} className="research-share-close" type="button" onClick={() => setIsDialogOpen(false)} aria-label="关闭分享菜单">
            <X aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="research-share-platforms">
        <a href={xUrl} target="_blank" rel="noreferrer"><b>𝕏</b><span>推特 / X</span></a>
        <button type="button" onClick={openBinanceSquare}><b className="is-binance">B</b><span>币安广场</span></button>
        <a href={weiboUrl} target="_blank" rel="noreferrer"><b>微</b><span>微博</span></a>
        <a href={telegramUrl} target="_blank" rel="noreferrer"><Send aria-hidden="true" /><span>Telegram</span></a>
        <a href={linkedInUrl} target="_blank" rel="noreferrer"><b>in</b><span>LinkedIn</span></a>
        <button type="button" onClick={() => void openSystemShare()}><Globe2 aria-hidden="true" /><span>更多平台</span></button>
      </div>
      <div className="research-share-actions">
        <button type="button" onClick={() => void copyShareText()}>{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied ? "已复制" : "复制链接"}</button>
        <Link href={sharePath} prefetch={false}><ExternalLink aria-hidden="true" />品牌分享页</Link>
      </div>
      <p><Link2 aria-hidden="true" /> 币安广场会复制标题、摘要与本站链接后打开创作者页面。</p>
    </div>
  );

  if (compact) {
    return (
      <>
        <div className="research-share-menu is-compact">
          <button
            ref={triggerRef}
            type="button"
            aria-label={`分享 ${title}`}
            aria-haspopup="dialog"
            aria-expanded={isDialogOpen}
            aria-controls={dialogId}
            title="分享文章"
            onClick={() => setIsDialogOpen(true)}
          >
            <Share2 aria-hidden="true" />
            <span className="sr-only">分享</span>
          </button>
        </div>
        {isDialogOpen ? createPortal(
          <div
            className="research-share-dialog-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setIsDialogOpen(false);
            }}
          >
            <section id={dialogId} className="research-share-dialog" role="dialog" aria-modal="true" aria-labelledby={`${dialogId}-title`}>
              {sharePanel}
            </section>
          </div>,
          document.body,
        ) : null}
      </>
    );
  }

  return (
    <details className="research-share-menu">
      <summary aria-label={`分享 ${title}`} title="分享文章">
        <Share2 aria-hidden="true" />
        <span>分享</span>
      </summary>
      {sharePanel}
    </details>
  );
}
