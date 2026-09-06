import { AdminSidebar } from "@/components/admin-sidebar";
import { AppShell } from "@/components/app-shell";
import { requireAdmin } from "@/lib/membership";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireAdmin("/admin");
  return (
    <AppShell viewer={viewer}>
      <main className="admin-page">
        <div className="page-container">
          <div className="page-heading">
            <div><p className="eyebrow">OPERATIONS CONTROL</p><h1>管理后台</h1><p>用户、订阅、推荐返佣、内容 Gate 与审计日志的统一运营界面。</p></div>
            <span className="plan-badge plan-badge--admin">ADMIN · AAL2</span>
          </div>
          <div className="admin-layout">
            <AdminSidebar viewer={viewer} />
            <div className="admin-main">{children}</div>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
