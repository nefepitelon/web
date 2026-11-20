"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type Turnstile = {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  remove(widgetId: string): void;
};

declare global {
  interface Window { turnstile?: Turnstile }
}

const siteKey = process.env.NEXT_PUBLIC_AUTH_CAPTCHA_SITE_KEY;

export function AuthCaptcha({ onToken, refreshKey }: { onToken: (token: string | null) => void; refreshKey: number }) {
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onToken(null);
    if (!siteKey || !ready || !container.current || !window.turnstile) return;
    const widget = window.turnstile.render(container.current, {
      sitekey: siteKey,
      theme: "auto",
      callback: (token: string) => onToken(token),
      "expired-callback": () => onToken(null),
      "error-callback": () => onToken(null)
    });
    return () => { window.turnstile?.remove(widget); };
  }, [ready, onToken, refreshKey]);

  if (!siteKey) return null;
  return (
    <div aria-label="登录安全验证" style={{ minHeight: 72, marginBottom: 12 }}>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={() => setReady(true)} />
      <div ref={container} />
    </div>
  );
}
