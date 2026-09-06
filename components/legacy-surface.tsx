"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";

type Props = {
  src: string;
  title: string;
  mode: "public" | "preview" | "member" | "pro" | "max" | "admin";
  previewHeight?: number;
  message: string;
  upgradeTo?: "login" | "pro" | "max";
};

export function LegacySurface({
  src,
  title,
  mode,
  message,
  upgradeTo = "login"
}: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const preview = mode === "preview";

  const href = upgradeTo === "login" ? "/login" : "/account/subscription";
  const cta = upgradeTo === "login" ? "登录查看完整内容" : upgradeTo === "max" ? "升级 Max" : "升级 Pro";

  const syncFrame = useCallback(() => {
    const target = frame.current?.contentWindow;
    if (!target) return;
    let theme = "dark";
    let language = "zh";
    try {
      theme = localStorage.getItem("welinkbtc-theme") === "light" ? "light" : "dark";
      language = localStorage.getItem("welinkbtc-language") === "en" ? "en" : "zh";
    } catch {
      // Preference sync should still work when storage is unavailable.
    }
    target.postMessage({
      type: "welinkbtc:preferences",
      theme,
      language
    }, window.location.origin);
    if (window.location.hash) {
      target.postMessage(
        { type: "welinkbtc:navigate", hash: window.location.hash },
        window.location.origin
      );
    }
  }, []);

  useEffect(() => {
    window.addEventListener("hashchange", syncFrame);
    window.addEventListener("welinkbtc:preferences", syncFrame);
    return () => {
      window.removeEventListener("hashchange", syncFrame);
      window.removeEventListener("welinkbtc:preferences", syncFrame);
    };
  }, [syncFrame]);

  return (
    <main className="legacy-page">
      <div className="access-ribbon">
        <div className="access-ribbon-copy">
          <span className={`access-dot ${preview ? "access-dot--preview" : ""}`} aria-hidden="true" />
          <span><strong>{title}</strong> · {message}</span>
        </div>
        {preview ? <Link className="ribbon-link" href={href}>{cta}</Link> : null}
      </div>
      <div className={`legacy-viewport ${preview ? "legacy-viewport--preview" : ""}`}>
        <iframe
          ref={frame}
          className="legacy-frame"
          src={`${src}${src.includes("?") ? "&" : "?"}embedded=1`}
          title={title}
          onLoad={syncFrame}
        />
        {preview ? (
          <section className="gate-card" aria-label="会员内容限制">
            <p className="gate-card-kicker">MEMBERSHIP PREVIEW</p>
            <h2>预览到这里，完整信号在会员层。</h2>
            <p>{message} 登录后即可查看基础内容；Pro 与 Max 会继续解锁高级指标、导出、研究额度和 API。</p>
            <div className="gate-actions">
              <Link className="button button--light" href={href}>{cta}</Link>
              <Link className="button button--ghost" href="/account/subscription">比较会员方案</Link>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
