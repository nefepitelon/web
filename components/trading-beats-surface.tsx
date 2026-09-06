import { Crosshair, ShieldCheck } from "lucide-react";

const TRADING_BEATS_URL = "https://www.tradingbeats.xyz/";

export function TradingBeatsSurface() {
  return (
    <main className="contract-assistant-page">
      <header className="contract-assistant-ribbon">
        <div>
          <span className="contract-assistant-icon" aria-hidden="true"><Crosshair /></span>
          <span>
            <strong>TradingBeats交易阻击台</strong>
            <small>TradingBeats · 链上永续合约 / 地址追踪 / 钱包分析</small>
          </span>
        </div>
        <div className="contract-assistant-ribbon-actions">
          <span><ShieldCheck aria-hidden="true" />固定来源 · 站内嵌套</span>
        </div>
      </header>
      <div className="contract-assistant-viewport">
        <iframe
          className="contract-assistant-frame"
          src={TRADING_BEATS_URL}
          title="TradingBeats交易阻击台"
          loading="eager"
          referrerPolicy="no-referrer"
          sandbox="allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-top-navigation-by-user-activation"
        />
      </div>
    </main>
  );
}
