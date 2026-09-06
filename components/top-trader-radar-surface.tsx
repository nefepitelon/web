"use client";

import { Radar, ShieldCheck } from "lucide-react";
import { useEffect, useRef } from "react";

const EMBED_THEME_COOKIE = "welinkbtc_top_trader_theme";

export function TopTraderRadarSurface() {
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    function rememberEmbeddedTheme(event: MessageEvent) {
      if (event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type !== "welinkbtc:top-trader-theme") return;
      if (event.data.theme !== "dark" && event.data.theme !== "light") return;

      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${EMBED_THEME_COOKIE}=${event.data.theme}; Path=/top-trader-radar; Max-Age=31536000; SameSite=Lax${secure}`;
    }

    window.addEventListener("message", rememberEmbeddedTheme);
    return () => window.removeEventListener("message", rememberEmbeddedTheme);
  }, []);

  return (
    <main className="contract-assistant-page">
      <header className="contract-assistant-ribbon">
        <div>
          <span className="contract-assistant-icon" aria-hidden="true"><Radar /></span>
          <span>
            <strong>TopTrader策略雷达</strong>
            <small>TradingRadar · 顶级交易员策略 / 仓位信号 / 市场雷达</small>
          </span>
        </div>
        <div className="contract-assistant-ribbon-actions">
          <span><ShieldCheck aria-hidden="true" />固定来源 · 站内嵌套</span>
        </div>
      </header>
      <div className="contract-assistant-viewport">
        <iframe
          ref={frameRef}
          className="contract-assistant-frame"
          src="/top-trader-radar/embed/"
          title="TopTrader策略雷达 TradingRadar"
          loading="eager"
          referrerPolicy="no-referrer"
          sandbox="allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-scripts"
        />
      </div>
    </main>
  );
}
