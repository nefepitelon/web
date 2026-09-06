"use client";

import { Check, Copy, ExternalLink, Send, Share2 } from "lucide-react";
import { useState } from "react";

type Props = {
  language: "zh" | "en";
  title: string;
  excerpt: string;
  shareUrl: string;
};

export function BstockReportShareActions({ language, title, excerpt, shareUrl }: Props) {
  const [copied, setCopied] = useState(false);
  const isZh = language === "zh";
  const preparedText = `${title}\n\n${excerpt}\n${shareUrl}`;
  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${title} — bStockAlpha`)}&url=${encodeURIComponent(shareUrl)}`;
  const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(`${title}\n${excerpt}`)}`;
  const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;

  async function copy(value = shareUrl) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_800);
    } catch {
      setCopied(false);
    }
  }

  function openBinanceSquare() {
    void copy(preparedText);
    window.open("https://www.binance.com/square/creator-center/home", "_blank", "noopener,noreferrer");
  }

  async function systemShare() {
    try {
      if (navigator.share) await navigator.share({ title, text: excerpt, url: shareUrl });
      else await copy();
    } catch {
      // Closing the native share sheet is an intentional action.
    }
  }

  return (
    <div className="bstock-share-actions" aria-label={isZh ? "分享研报" : "Share report"}>
      <button type="button" onClick={() => void systemShare()}><Share2 aria-hidden="true" />{isZh ? "分享" : "Share"}</button>
      <button type="button" onClick={() => void copy()}>{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied ? (isZh ? "已复制" : "Copied") : (isZh ? "复制链接" : "Copy link")}</button>
      <a href={xUrl} target="_blank" rel="noreferrer"><b>𝕏</b><span>X</span></a>
      <a href={telegramUrl} target="_blank" rel="noreferrer"><Send aria-hidden="true" /><span>Telegram</span></a>
      <a href={linkedInUrl} target="_blank" rel="noreferrer"><b>in</b><span>LinkedIn</span></a>
      <button type="button" onClick={openBinanceSquare}><b className="is-binance">B</b>{isZh ? "币安广场" : "Binance Square"}</button>
      <a href="/bstock-alpha"><ExternalLink aria-hidden="true" />{isZh ? "打开工作台" : "Open terminal"}</a>
    </div>
  );
}
