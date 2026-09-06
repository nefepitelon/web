import { ChartCandlestick, ShieldCheck } from "lucide-react";

export function ContractTradingAssistantSurface() {
  return (
    <main className="contract-assistant-page">
      <header className="contract-assistant-ribbon">
        <div>
          <span className="contract-assistant-icon" aria-hidden="true"><ChartCandlestick /></span>
          <span>
            <strong>合约交易助手</strong>
            <small>TcTool · 合约分析 / 数据监控 / 指标共振</small>
          </span>
        </div>
        <div className="contract-assistant-ribbon-actions">
          <span><ShieldCheck aria-hidden="true" />站内安全嵌套</span>
        </div>
      </header>
      <div className="contract-assistant-viewport">
        <iframe
          className="contract-assistant-frame"
          src="/contract-trading-assistant/embed"
          title="合约交易助手 TcTool"
          loading="eager"
          referrerPolicy="no-referrer"
          sandbox="allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-scripts"
        />
      </div>
    </main>
  );
}
