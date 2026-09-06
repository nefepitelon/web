import { ArrowLeftRight, ShieldCheck } from "lucide-react";

export function MultiExchangeArbitrageSurface() {
  return (
    <main className="contract-assistant-page">
      <header className="contract-assistant-ribbon">
        <div>
          <span className="contract-assistant-icon" aria-hidden="true"><ArrowLeftRight /></span>
          <span>
            <strong>多交易所套利助手</strong>
            <small>PerpDEXList · 资金费率 / 价差 / 多交易所套利</small>
          </span>
        </div>
        <div className="contract-assistant-ribbon-actions">
          <span><ShieldCheck aria-hidden="true" />站内安全嵌套</span>
        </div>
      </header>
      <div className="contract-assistant-viewport">
        <iframe
          className="contract-assistant-frame"
          src="/arbitrage"
          title="多交易所套利助手 PerpDEXList"
          loading="eager"
          referrerPolicy="no-referrer"
          sandbox="allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-scripts"
        />
      </div>
    </main>
  );
}
