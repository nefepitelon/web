import { Newspaper, ShieldCheck } from "lucide-react";

const CRYPTO_BAIXIAOSHENG_URL = "https://info.qianyuwing.com/";

export function CryptoBaixiaoshengSurface() {
  return (
    <main className="contract-assistant-page">
      <header className="contract-assistant-ribbon">
        <div>
          <span className="contract-assistant-icon" aria-hidden="true"><Newspaper /></span>
          <span>
            <strong>币圈百晓生</strong>
            <small>实时币圈资讯 / 每日早报 / 市场日历</small>
          </span>
        </div>
        <div className="contract-assistant-ribbon-actions">
          <span><ShieldCheck aria-hidden="true" />固定来源 · 站内嵌套</span>
        </div>
      </header>
      <div className="contract-assistant-viewport">
        <iframe
          className="contract-assistant-frame"
          src={CRYPTO_BAIXIAOSHENG_URL}
          title="币圈百晓生"
          loading="eager"
          referrerPolicy="no-referrer"
          sandbox="allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-top-navigation-by-user-activation"
        />
      </div>
    </main>
  );
}
