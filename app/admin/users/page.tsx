import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { resetUserTwoFactorAction, updateUserRoleAction, updateUserStatusAction } from "@/app/actions/admin";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/membership";

const userTagFilters = [
  { key: "all", label: "全部用户" },
  { key: "twitter", label: "已绑定 X" },
  { key: "wallet", label: "已绑定钱包" },
  { key: "wlb", label: "有 WLB 资产" }
] as const;

type UserTagFilter = (typeof userTagFilters)[number]["key"];

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; tag?: string }> }) {
  await requireAdmin("/admin/users");
  const { q, tag } = await searchParams;
  const query = q?.trim();
  const activeTag: UserTagFilter = userTagFilters.some((option) => option.key === tag) ? tag as UserTagFilter : "all";
  const conditions: Prisma.UserWhereInput[] = [];
  if (query) {
    conditions.push({ OR: [{ email: { contains: query, mode: "insensitive" } }, { profile: { handle: { contains: query, mode: "insensitive" } } }] });
  }
  if (activeTag === "twitter") {
    conditions.push({ socialAccounts: { some: { provider: { in: ["x", "twitter"], mode: "insensitive" } } } });
  } else if (activeTag === "wallet") {
    conditions.push({ wallets: { some: {} } });
  } else if (activeTag === "wlb") {
    conditions.push({
      wlbAccount: {
        is: {
          OR: [
            { availableMilliWlb: { gt: 0n } },
            { pendingWithdrawalMilliWlb: { gt: 0n } }
          ]
        }
      }
    });
  }
  const users = await prisma.user.findMany({
    where: conditions.length ? { AND: conditions } : undefined,
    include: {
      profile: true,
      roles: { include: { role: true } },
      subscriptions: { orderBy: { updatedAt: "desc" }, take: 1 },
      twoFactor: true,
      socialAccounts: { select: { provider: true } },
      wallets: { select: { id: true } },
      wlbAccount: { select: { availableMilliWlb: true, pendingWithdrawalMilliWlb: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 100
  });

  return (
    <section className="panel">
      <div className="panel-header"><div><h2>用户管理</h2><p>查看用户中心、搜索、封禁、角色授权与 2FA 重置。最多显示最近 100 条。</p></div></div>
      <div className="panel-body">
        <div className="admin-toolbar admin-user-toolbar">
          <form className="admin-user-search">
            {activeTag !== "all" ? <input type="hidden" name="tag" value={activeTag} /> : null}
            <input className="input" name="q" defaultValue={query} placeholder="邮箱或用户名" />
            <button className="button button--small button--light">搜索</button>
          </form>
          <nav className="admin-user-filter" aria-label="用户绑定状态筛选">
            {userTagFilters.map((option) => (
              <Link
                className={`admin-user-filter__item ${activeTag === option.key ? "is-active" : ""}`}
                href={adminUsersHref(query, option.key)}
                aria-current={activeTag === option.key ? "page" : undefined}
                key={option.key}
                prefetch={false}
              >{option.label}</Link>
            ))}
          </nav>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>用户</th><th>状态</th><th>角色 / 订阅</th><th>2FA</th><th>加入时间</th><th>操作</th></tr></thead>
            <tbody>{users.map((user) => {
              const role = user.roles.some((item) => item.role.key === "admin")
                ? "admin"
                : user.roles.some((item) => item.role.key === "operator")
                  ? "operator"
                  : user.subscriptions[0]?.planKey ?? "free";
              const hasTwitter = user.socialAccounts.some((account) => ["x", "twitter"].includes(account.provider.toLowerCase()));
              const hasWallet = user.wallets.length > 0;
              const hasWlbAssets = Boolean(user.wlbAccount && (
                user.wlbAccount.availableMilliWlb > 0n || user.wlbAccount.pendingWithdrawalMilliWlb > 0n
              ));
              return (
                <tr key={user.id}>
                  <td>
                    <div className="admin-user-identity-line">
                      <strong>{user.profile?.handle ? `${user.profile.handle}.welinkBTC` : "未设置"}</strong>
                      <span className="admin-user-badges">
                        {hasTwitter ? <span className="admin-user-badge admin-user-badge--twitter" title="已绑定 X / Twitter">X 已绑定</span> : null}
                        {hasWallet ? <span className="admin-user-badge admin-user-badge--wallet" title="已绑定并验证 Web3 钱包">钱包</span> : null}
                        {hasWlbAssets ? <span className="admin-user-badge admin-user-badge--wlb" title="当前拥有可用或提现中的 WLB 资产">WLB 资产</span> : null}
                      </span>
                    </div>
                    <span>{user.email}</span>
                  </td>
                  <td><span className={`status-pill ${user.status === "ACTIVE" ? "" : "status-pill--warn"}`}>{user.status}</span></td>
                  <td>{role} / {user.subscriptions[0]?.status ?? "FREE"}</td>
                  <td>{user.twoFactor?.enabledAt ? "ON" : "OFF"}</td>
                  <td>{user.createdAt.toLocaleDateString("zh-CN")}</td>
                  <td>
                    <div className="table-actions">
                      <Link className="button button--small button--outline" href={`/admin/users/${user.id}`} prefetch={false}>查看中心</Link>
                      <form action={updateUserRoleAction}><input type="hidden" name="userId" value={user.id} /><select className="select" name="role" defaultValue={role}>{managedRoleOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select><button className="button button--small button--light">保存角色</button></form>
                      <form action={updateUserStatusAction}><input type="hidden" name="userId" value={user.id} /><input type="hidden" name="status" value={user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"} /><button className="button button--small button--outline">{user.status === "ACTIVE" ? "封禁" : "解封"}</button></form>
                      {user.twoFactor?.enabledAt ? <form action={resetUserTwoFactorAction}><input type="hidden" name="userId" value={user.id} /><button className="button button--small button--outline">重置 2FA</button></form> : null}
                    </div>
                  </td>
                </tr>
              );
            })}{users.length === 0 ? <tr><td colSpan={6}>没有符合当前搜索和筛选条件的用户。</td></tr> : null}</tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

const managedRoleOptions = ["free", "pro", "max", "operator", "admin"];

function adminUsersHref(query: string | undefined, tag: UserTagFilter) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (tag !== "all") params.set("tag", tag);
  const suffix = params.toString();
  return suffix ? `/admin/users?${suffix}` : "/admin/users";
}
