import Link from "next/link";
import { redirect } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { ReferralShareMenu } from "@/components/referral-share-menu";
import { prisma } from "@/lib/prisma";
import { quotaFor } from "@/lib/entitlements";
import { requireViewer } from "@/lib/membership";

export default async function AccountOverviewPage() {
  const viewer = await requireViewer("/account");
  if (!viewer.handle) redirect("/onboarding/username");

  const [referrals, commissions, socialCount, walletCount] = await Promise.all([
    prisma.referral.count({ where: { referrerUserId: viewer.id } }),
    prisma.commissionLedger.aggregate({
      where: { referrerUserId: viewer.id, status: { in: ["APPROVED", "PAYABLE", "PAID"] } },
      _sum: { amountCents: true }
    }),
    prisma.socialAccount.count({ where: { userId: viewer.id } }),
    prisma.wallet.count({ where: { userId: viewer.id } })
  ]);
  const quota = quotaFor(viewer);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.welinkbtc-onchainmain.xyz";
  const referralUrl = `${appUrl}/?ref=${viewer.handle}`;
  const imageUrl = `${appUrl}/api/referrals/share-image/${viewer.handle}`;

  return (
    <div className="section-stack">
      {viewer.accessGrant ? (
        <div className="access-grant-banner">
          <span>ACCESS ACTIVE</span>
          <strong>{viewer.accessGrant.label} · Max 全功能体验</strong>
          <p>有效至 {new Date(viewer.accessGrant.endsAt).toLocaleString("zh-CN")}；管理员后台保持关闭。</p>
        </div>
      ) : null}
      <section className="panel">
        <div className="panel-header">
          <div><h2>账户概览</h2><p>{viewer.username} · {viewer.role === "admin" ? "ADMIN 全站权益" : `${viewer.plan.toUpperCase()} 权益`}</p></div>
          <Link className="button button--small" href="/account/profile">编辑资料</Link>
        </div>
        <div className="panel-body">
          <div className="stat-grid">
            <div className="stat-card"><span>当前方案</span><strong>{viewer.role === "admin" ? "Admin" : viewer.plan.toUpperCase()}</strong></div>
            <div className="stat-card"><span>AI 深研 / 月</span><strong>{quota.aiResearchMonthly}</strong></div>
            <div className="stat-card"><span>成功邀请</span><strong>{referrals}</strong></div>
            <div className="stat-card"><span>累计返佣</span><strong>${((commissions._sum.amountCents ?? 0) / 100).toFixed(2)}</strong></div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header"><div><h2>邀请返佣链接</h2><p>用户名设置完成后自动生成；注册归因由服务端完成。</p></div><Link className="button button--small button--outline" href="/account/referrals">体验码与推荐</Link></div>
        <div className="panel-body">
          <div className="referral-box">
            <code>{referralUrl}</code>
            <CopyButton value={referralUrl} />
            <ReferralShareMenu handle={viewer.handle} referralUrl={referralUrl} imageUrl={imageUrl} />
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header"><div><h2>账户完整度</h2><p>完成绑定与安全设置，为未来社区权益和链上身份做好准备。</p></div></div>
        <div className="panel-body">
          <div className="status-line">
            <div className="status-copy"><strong>邮箱身份</strong><span>{viewer.email}</span></div>
            <span className="status-pill">已验证</span>
          </div>
          <div className="status-line">
            <div className="status-copy"><strong>社交账户</strong><span>X / Discord OAuth 验证绑定</span></div>
            <span className={`status-pill ${socialCount ? "" : "status-pill--muted"}`}>{socialCount ? `${socialCount} 个已绑定` : "未绑定"}</span>
          </div>
          <div className="status-line">
            <div className="status-copy"><strong>Web3 钱包</strong><span>仅用于地址身份与未来链上权益，不用于登录</span></div>
            <span className={`status-pill ${walletCount ? "" : "status-pill--muted"}`}>{walletCount ? `${walletCount} 个已验证` : "未绑定"}</span>
          </div>
          <div className="status-line">
            <div className="status-copy"><strong>双重验证</strong><span>TOTP 与一次性备份码</span></div>
            <span className={`status-pill ${viewer.twoFactorEnabled ? "" : "status-pill--warn"}`}>{viewer.twoFactorEnabled ? "已启用" : "建议启用"}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
