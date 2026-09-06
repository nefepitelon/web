"use client";

import Image from "next/image";
import { Check, Copy, Globe2, Send, Share2, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function ReferralShareMenu({ handle, referralUrl, imageUrl }: { handle: string; referralUrl: string; imageUrl: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dialogId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const text = `${handle}.welinkBTC 邀请你加入 WELINKBTC：系统跟踪BTC周期和链上信号！从研究、信号、报价到清算，保持同一个工作台。`;
  const encodedText = encodeURIComponent(text);
  const encodedUrl = encodeURIComponent(referralUrl);
  const previewImageUrl = imageUrl.startsWith("http") ? new URL(imageUrl).pathname : imageUrl;

  const recordShare = (platform: string) => {
    void fetch("/api/referrals/share", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ platform }),
      keepalive: true
    });
  };

  const copyPack = async () => {
    try {
      await navigator.clipboard.writeText(`${text}\n${referralUrl}\n品牌图片：${imageUrl}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const nativeShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: "WELINKBTC 邀请", text, url: referralUrl });
        recordShare("system");
      }
      else await copyPack();
    } catch {
      // Closing the operating system share sheet is an intentional user action.
    }
  };

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus();
    };
  }, [open]);

  return (
    <div className="referral-share">
      <button
        ref={triggerRef}
        className="button button--small"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        onClick={() => setOpen(true)}
      >
        <Share2 aria-hidden="true" />
        分享邀请
      </button>
      {open ? createPortal(
        <div
          className="referral-share-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section ref={dialogRef} id={dialogId} className="referral-share-dialog" role="dialog" aria-modal="true" aria-labelledby={`${dialogId}-title`}>
            <header className="referral-share-dialog__header">
              <div>
                <span>SHARE INVITATION</span>
                <h2 id={`${dialogId}-title`}>分享你的专属邀请</h2>
                <p>预览品牌图片、确认邀请文案，再选择社交平台。</p>
              </div>
              <button ref={closeButtonRef} type="button" onClick={() => setOpen(false)} aria-label="关闭分享邀请弹窗"><X aria-hidden="true" /></button>
            </header>
            <div className="referral-share-dialog__content">
              <div className="referral-share-preview">
                <Image src={previewImageUrl} width={1200} height={630} sizes="(max-width: 760px) calc(100vw - 48px), 620px" alt="品牌推荐分享图片预览" unoptimized />
                <div className="referral-invite-copy">
                  <span>专属邀请文案</span>
                  <p>{text}</p>
                  <code>{referralUrl}</code>
                </div>
              </div>
              <div className="referral-share-links" aria-label="选择分享平台">
                <a href={`https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`} target="_blank" rel="noreferrer" onClick={() => recordShare("x")}><b>𝕏</b><span>X / 推特</span></a>
                <a href={`https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`} target="_blank" rel="noreferrer" onClick={() => recordShare("telegram")}><Send aria-hidden="true" /><span>Telegram</span></a>
                <a href={`https://service.weibo.com/share/share.php?url=${encodedUrl}&title=${encodedText}&pic=${encodeURIComponent(imageUrl)}`} target="_blank" rel="noreferrer" onClick={() => recordShare("weibo")}><b>微</b><span>微博</span></a>
                <button type="button" onClick={async () => { recordShare("binance-square"); await copyPack(); window.open("https://www.binance.com/en/square/post", "_blank", "noopener,noreferrer"); }}><b className="is-binance">B</b><span>币安广场</span></button>
                <button type="button" onClick={() => void nativeShare()}><Globe2 aria-hidden="true" /><span>系统分享</span></button>
                <button type="button" onClick={() => void copyPack()}>{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}<span>{copied ? "已复制" : "复制图文与链接"}</span></button>
              </div>
            </div>
          </section>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
