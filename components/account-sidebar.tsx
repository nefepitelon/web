import Link from "next/link";
import type { Viewer } from "@/lib/membership";

const links = [
  ["/account", "账户总览"],
  ["/account/assets", "资产管理"],
  ["/account/profile", "个人资料"],
  ["/account/connections", "绑定账户"],
  ["/account/security", "安全设置"],
  ["/account/getting-started", "新人指导"],
  ["/account/referrals", "推荐与体验码"],
  ["/account/subscription", "订阅管理"]
] as const;

export function AccountSidebar({ viewer }: { viewer: Viewer }) {
  return (
    <aside className="account-sidebar">
      <div className="account-identity">
        {viewer.avatarUrl ? <img className="account-avatar-image" src={viewer.avatarUrl} alt="" width="42" height="42" /> : <span className="header-avatar" aria-hidden="true">{(viewer.handle ?? viewer.email).slice(0, 1)}</span>}
        <strong>{viewer.username ?? "尚未设置用户名"}</strong>
        <span>{viewer.email}</span>
      </div>
      <nav className="account-nav" aria-label="个人中心导航">
        {links.map(([href, label]) => <Link href={href} key={href} prefetch={false}>{label}</Link>)}
        {viewer.plan === "max" || viewer.role === "admin" ? <Link href="/account/api-keys" prefetch={false}>API 访问</Link> : null}
        {viewer.role === "admin" ? <Link href="/admin" prefetch={false}>管理后台</Link> : null}
        <Link href="/logout" prefetch={false}>退出登录</Link>
      </nav>
    </aside>
  );
}
