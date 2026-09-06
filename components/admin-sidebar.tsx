import Link from "next/link";
import type { Viewer } from "@/lib/membership";

const links = [
  ["/admin", "运营总览"],
  ["/admin/users", "用户管理"],
  ["/admin/subscriptions", "订阅管理"],
  ["/admin/assets", "WLB 资产"],
  ["/admin/crypto-payments", "Crypto 收款"],
  ["/admin/referrals", "推荐返佣"],
  ["/admin/access-codes", "Access Code"],
  ["/admin/content-gates", "内容权限"],
  ["/toolbox", "百宝箱工具台"],
  ["/admin/audit-logs", "审计日志"]
] as const;

export function AdminSidebar({ viewer }: { viewer: Viewer }) {
  return (
    <aside className="admin-sidebar">
      <div className="account-identity">
        <span className="plan-badge plan-badge--admin">2FA ADMIN</span>
        <strong>{viewer.username ?? viewer.email}</strong>
        <span>所有写入操作均记录审计日志</span>
      </div>
      <nav className="account-nav" aria-label="管理后台导航">
        {links.map(([href, label]) => <Link href={href} key={href} prefetch={false}>{label}</Link>)}
        <Link href="/account" prefetch={false}>返回个人中心</Link>
      </nav>
    </aside>
  );
}
