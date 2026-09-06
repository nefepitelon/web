import { AccountSidebar } from "@/components/account-sidebar";
import { AppShell } from "@/components/app-shell";
import { requireViewer } from "@/lib/membership";

export const dynamic = "force-dynamic";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer("/account");
  return (
    <AppShell viewer={viewer}>
      <main className="account-page">
        <div className="page-container">
          <div className="page-heading">
            <div>
              <p className="eyebrow">MEMBER CENTER</p>
              <h1>个人中心</h1>
              <p>管理身份、连接、安全、推荐与订阅。账户权益以服务端记录为准。</p>
            </div>
            <span className={`plan-badge plan-badge--${viewer.role}`}>{viewer.role}</span>
          </div>
          <div className="account-layout">
            <AccountSidebar viewer={viewer} />
            <div className="account-main">{children}</div>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
