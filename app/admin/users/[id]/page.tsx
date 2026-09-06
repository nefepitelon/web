import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { onboardingTasks } from "@/lib/onboarding-tasks";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/membership";

const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const usableSubscriptionStatuses = new Set(["ACTIVE", "TRIALING"]);

export default async function AdminUserCenterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin(`/admin/users/${id}`);
  if (!USER_ID_PATTERN.test(id)) notFound();

  const now = new Date();
  const [user, commissions, qualifiedReferrals, pageViews] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        profile: {
          select: {
            handle: true,
            displayName: true,
            bio: true,
            avatarUrl: true,
            region: true,
            website: true,
            profileCompletedAt: true
          }
        },
        roles: { select: { role: { select: { key: true, name: true } } } },
        subscriptions: {
          orderBy: { updatedAt: "desc" },
          take: 5,
          select: {
            id: true,
            provider: true,
            planKey: true,
            billingInterval: true,
            amountCents: true,
            status: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
            createdAt: true
          }
        },
        accessRedemptions: {
          where: { startsAt: { lte: now }, endsAt: { gt: now } },
          orderBy: { endsAt: "desc" },
          take: 1,
          select: {
            startsAt: true,
            endsAt: true,
            source: true,
            accessCode: { select: { label: true } }
          }
        },
        twoFactor: { select: { enabledAt: true, updatedAt: true } },
        socialAccounts: {
          orderBy: { createdAt: "asc" },
          select: { provider: true, username: true, profileUrl: true, createdAt: true, updatedAt: true }
        },
        wallets: {
          orderBy: { createdAt: "asc" },
          select: { chain: true, address: true, label: true, verifiedAt: true }
        },
        onboardingTasks: { select: { taskKey: true, completedAt: true } },
        _count: {
          select: {
            referralsMade: true,
            researchArticles: true,
            researchBookmarks: true,
            researchComments: true
          }
        }
      }
    }),
    prisma.commissionLedger.aggregate({
      where: { referrerUserId: id, status: { in: ["APPROVED", "PAYABLE", "PAID"] } },
      _sum: { amountCents: true }
    }),
    prisma.referral.count({ where: { referrerUserId: id, qualifiedAt: { not: null } } }),
    prisma.analyticsEvent.count({ where: { userId: id, eventType: "PAGE_VIEW" } })
  ]);

  if (!user) notFound();

  const roleKeys = user.roles.map((item) => item.role.key);
  const activeGrant = user.accessRedemptions[0] ?? null;
  const activeSubscriptions = user.subscriptions.filter((subscription) => {
    if (!usableSubscriptionStatuses.has(subscription.status)) return false;
    return !subscription.currentPeriodEnd || subscription.currentPeriodEnd > now;
  });
  const plan = activeGrant
    ? "max"
    : activeSubscriptions.some((subscription) => subscription.planKey === "max")
      ? "max"
      : activeSubscriptions.some((subscription) => subscription.planKey === "pro")
        ? "pro"
        : "free";
  const role = roleKeys.includes("admin") ? "admin" : roleKeys.includes("operator") ? "operator" : plan;
  const completedTaskKeys = new Set(user.onboardingTasks.map((task) => task.taskKey));
  const completedTasks = onboardingTasks.filter((task) => completedTaskKeys.has(task.key)).length;
  const username = user.profile?.handle ? `${user.profile.handle}.welinkBTC` : "未设置用户名";
  const avatarUrl = trustedAvatarUrl(user.profile?.avatarUrl);
  const avatarLabel = (user.profile?.displayName || user.profile?.handle || user.email).slice(0, 1).toUpperCase();

  return (
    <div className="section-stack admin-user-center">
      <section className="panel">
        <div className="panel-header admin-user-center__header">
          <div className="admin-user-center__identity">
            {avatarUrl ? (
              <Image className="admin-user-center__avatar" src={avatarUrl} alt="" width={68} height={68} />
            ) : (
              <span className="admin-user-center__avatar admin-user-center__avatar--fallback" aria-hidden="true">{avatarLabel}</span>
            )}
            <div>
              <p className="eyebrow">ADMIN READ-ONLY VIEW</p>
              <h2>{username}</h2>
              <p>{user.email} · 用户 ID {user.id}</p>
            </div>
          </div>
          <div className="admin-user-center__actions">
            <span className="status-pill status-pill--muted">仅查看，不会切换身份</span>
            <Link className="button button--small button--outline" href="/admin/users" prefetch={false}>返回用户管理</Link>
          </div>
        </div>
        <div className="panel-body">
          <div className="stat-grid">
            <div className="stat-card"><span>当前权限</span><strong>{role.toUpperCase()}</strong><small>{activeGrant ? "Access Code 全功能体验" : "按有效订阅与角色计算"}</small></div>
            <div className="stat-card"><span>成功邀请</span><strong>{user._count.referralsMade}</strong><small>其中 {qualifiedReferrals} 位有效用户</small></div>
            <div className="stat-card"><span>累计返佣</span><strong>{formatMoney(commissions._sum.amountCents ?? 0)}</strong><small>已批准、可支付或已支付</small></div>
            <div className="stat-card"><span>新人任务</span><strong>{completedTasks} / {onboardingTasks.length}</strong><small>累计页面访问 {pageViews} 次</small></div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header"><div><h2>个人资料与账户状态</h2><p>对应用户个人中心中的资料、身份和安全信息。</p></div></div>
        <div className="panel-body admin-user-center__columns">
          <div>
            <InfoLine label="显示名称" value={user.profile?.displayName || "未填写"} />
            <InfoLine label="个人简介" value={user.profile?.bio || "未填写"} multiline />
            <InfoLine label="地区" value={user.profile?.region || "未填写"} />
            <InfoLine label="网站" value={user.profile?.website || "未填写"} />
            <InfoLine label="资料完成时间" value={formatDate(user.profile?.profileCompletedAt)} />
          </div>
          <div>
            <StatusLine label="账户状态" detail={`最后更新 ${formatDate(user.updatedAt)}`} value={user.status} tone={user.status === "ACTIVE" ? "success" : "warn"} />
            <StatusLine label="邮箱身份" detail={user.email} value={user.emailVerifiedAt ? "已验证" : "未验证"} tone={user.emailVerifiedAt ? "success" : "warn"} />
            <StatusLine label="双重验证" detail={user.twoFactor?.enabledAt ? `启用于 ${formatDate(user.twoFactor.enabledAt)}` : "未配置 TOTP"} value={user.twoFactor?.enabledAt ? "已启用" : "未启用"} tone={user.twoFactor?.enabledAt ? "success" : "muted"} />
            <StatusLine label="加入时间" detail={`最后登录 ${formatDate(user.lastLoginAt)}`} value={formatDate(user.createdAt, false)} tone="muted" />
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header"><div><h2>绑定账户</h2><p>仅展示账号标识和验证状态；OAuth 凭据、钱包签名与安全密钥均不向后台页面返回。</p></div></div>
        <div className="panel-body admin-user-center__columns">
          <div>
            <h3 className="admin-user-center__subheading">社交账户</h3>
            {user.socialAccounts.length ? user.socialAccounts.map((account) => (
              <StatusLine
                key={account.provider}
                label={socialProviderLabel(account.provider)}
                detail={account.username ? `@${account.username}` : "账号已通过 OAuth 验证"}
                value="已绑定"
                tone="success"
              />
            )) : <p className="admin-user-center__empty">暂未绑定社交账户</p>}
          </div>
          <div>
            <h3 className="admin-user-center__subheading">Web3 钱包</h3>
            {user.wallets.length ? user.wallets.map((wallet) => (
              <StatusLine
                key={`${wallet.chain}-${wallet.address}`}
                label={`${wallet.chain}${wallet.label ? ` · ${wallet.label}` : ""}`}
                detail={wallet.address}
                detailClassName="admin-user-center__wallet-address"
                value="已验证"
                tone="success"
              />
            )) : <p className="admin-user-center__empty">暂未绑定钱包</p>}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header"><div><h2>订阅与体验权益</h2><p>当前有效方案为 {plan.toUpperCase()}，下方保留最近 5 条订阅记录。</p></div></div>
        <div className="panel-body">
          {activeGrant ? (
            <div className="access-grant-banner admin-user-center__grant">
              <span>ACCESS ACTIVE</span>
              <strong>{activeGrant.accessCode.label} · Max 全功能体验</strong>
              <p>{formatDate(activeGrant.startsAt)} 至 {formatDate(activeGrant.endsAt)} · 来源 {activeGrant.source}</p>
            </div>
          ) : null}
          {user.subscriptions.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>方案</th><th>状态</th><th>支付方式</th><th>周期</th><th>金额</th><th>权益截止</th></tr></thead>
                <tbody>{user.subscriptions.map((subscription) => (
                  <tr key={subscription.id}>
                    <td><strong>{subscription.planKey.toUpperCase()}</strong></td>
                    <td>{subscription.status}{subscription.cancelAtPeriodEnd ? " · 到期取消" : ""}</td>
                    <td>{subscription.provider}</td>
                    <td>{subscription.billingInterval}</td>
                    <td>{formatMoney(subscription.amountCents)}</td>
                    <td>{formatDate(subscription.currentPeriodEnd, false)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className="admin-user-center__empty">暂无订阅记录</p>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header"><div><h2>新人指导与内容参与</h2><p>快速检查用户是否已完成平台的核心使用路径。</p></div></div>
        <div className="panel-body">
          <div className="admin-user-center__task-grid">
            {onboardingTasks.map((task, index) => {
              const completion = user.onboardingTasks.find((item) => item.taskKey === task.key);
              return (
                <div className={`admin-user-center__task ${completion ? "is-complete" : ""}`} key={task.key}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div><strong>{task.title}</strong><small>{completion ? `完成于 ${formatDate(completion.completedAt)}` : task.description}</small></div>
                  <b>{completion ? "已完成" : "未完成"}</b>
                </div>
              );
            })}
          </div>
          <div className="stat-grid admin-user-center__content-stats">
            <div className="stat-card"><span>研究文章</span><strong>{user._count.researchArticles}</strong></div>
            <div className="stat-card"><span>文章收藏</span><strong>{user._count.researchBookmarks}</strong></div>
            <div className="stat-card"><span>研究评论</span><strong>{user._count.researchComments}</strong></div>
            <div className="stat-card"><span>社交 / 钱包</span><strong>{user.socialAccounts.length} / {user.wallets.length}</strong></div>
          </div>
        </div>
      </section>
    </div>
  );
}

function InfoLine({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className={`admin-user-center__info ${multiline ? "is-multiline" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusLine({ label, detail, detailClassName, value, tone }: { label: string; detail: string; detailClassName?: string; value: string; tone: "success" | "warn" | "muted" }) {
  const toneClass = tone === "warn" ? "status-pill--warn" : tone === "muted" ? "status-pill--muted" : "";
  return (
    <div className="status-line">
      <div className="status-copy"><strong>{label}</strong><span className={detailClassName}>{detail}</span></div>
      <span className={`status-pill ${toneClass}`}>{value}</span>
    </div>
  );
}

function formatDate(value: Date | null | undefined, withTime = true) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {})
  }).format(value);
}

function formatMoney(amountCents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amountCents / 100);
}

function socialProviderLabel(provider: string) {
  if (["x", "twitter"].includes(provider.toLowerCase())) return "X / Twitter";
  if (provider.toLowerCase() === "discord") return "Discord";
  return provider;
}

function trustedAvatarUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".public.blob.vercel-storage.com") ? value : null;
  } catch {
    return null;
  }
}
