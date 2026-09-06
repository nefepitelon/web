import { redirect } from "next/navigation";
import { AccessCodeRedeemForm } from "@/components/access-code-redeem-form";
import { CopyButton } from "@/components/copy-button";
import { ReferralShareMenu } from "@/components/referral-share-menu";
import { requireViewer } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { getReferralQualification, getReferralRules } from "@/lib/referrals";

export default async function AccountReferralsPage() {
  const viewer = await requireViewer("/account/referrals");
  if (!viewer.handle) redirect("/onboarding/username");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.welinkbtc-onchainmain.xyz";
  const referralUrl = `${appUrl}/?ref=${viewer.handle}`;
  const imageUrl = `${appUrl}/api/referrals/share-image/${viewer.handle}`;
  const [rules, qualification, referrals, commissions] = await Promise.all([
    getReferralRules(),
    getReferralQualification(viewer.id),
    prisma.referral.findMany({ where: { referrerUserId: viewer.id }, select: { qualifiedAt: true } }),
    prisma.commissionLedger.groupBy({ by: ["rewardType", "level"], where: { referrerUserId: viewer.id, status: { not: "VOID" } }, _sum: { amountCents: true }, _count: true })
  ]);
  const rewardTotal = commissions.reduce((sum, item) => sum + (item._sum.amountCents ?? 0), 0);

  return (
    <div className="section-stack">
      {viewer.accessGrant ? (
        <div className="access-grant-banner">
          <span>ACCESS ACTIVE</span>
          <strong>{viewer.accessGrant.label}</strong>
          <p>Max 全功能体验有效至 {new Date(viewer.accessGrant.endsAt).toLocaleString("zh-CN")}，管理员后台保持关闭。</p>
        </div>
      ) : null}

      <section className="panel">
        <div className="panel-header">
          <div><h2>Access Code 全功能体验</h2><p>登录时可以跳过；获得体验码后可随时在这里兑换。</p></div>
        </div>
        <div className="panel-body">
          <AccessCodeRedeemForm />
          <div className="access-code-rules">
            <span>01 · 每个账户对同一个 Access Code 仅可兑换一次</span>
            <span>02 · 权益按兑换时间起计算 30 天，不改变 Stripe 订阅</span>
            <span>03 · 获得 Max 全功能，但不会获得管理员角色或后台入口</span>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header"><div><h2>邀请返佣进度</h2><p>交易返佣模块已预留，当前启用注册、有效用户与两级订阅返佣。</p></div><strong className="referral-total">累计 {"$"}{(rewardTotal / 100).toFixed(2)}</strong></div>
        <div className="panel-body">
          <div className="stat-grid">
            <div className="stat-card"><span>受邀注册</span><strong>{referrals.length}</strong><small>每位 +{(rules.registrationRewardCents / 100).toFixed(2)}U</small></div>
            <div className="stat-card"><span>有效用户</span><strong>{referrals.filter((item) => item.qualifiedAt).length}</strong><small>每位 +{(rules.validUserRewardCents / 100).toFixed(2)}U</small></div>
            <div className="stat-card"><span>一级订阅</span><strong>{(rules.level1RateBps / 100).toFixed(0)}%</strong><small>直接邀请付费金额</small></div>
            <div className="stat-card"><span>二级订阅</span><strong>{(rules.level2RateBps / 100).toFixed(0)}%</strong><small>下级邀请付费金额</small></div>
          </div>
          <div className="qualification-grid">
            {[
              ["设置用户名", qualification.username],
              ["编辑个人资料", qualification.profile],
              ["分享邀请链接", qualification.shared],
              ["绑定社交账号", qualification.social],
              ["绑定 Web3 钱包", qualification.wallet],
              [`新人指导 ${qualification.guideCompleted}/${qualification.guideTotal}`, qualification.guide]
            ].map(([label, done]) => <div className={done ? "qualification-item is-complete" : "qualification-item"} key={String(label)}><span>{done ? "✓" : "○"}</span><strong>{String(label)}</strong></div>)}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header"><div><h2>邀请返佣链接</h2><p>分享你的专属链接；注册归因由服务端完成。</p></div></div>
        <div className="panel-body">
          <div className="referral-box">
            <code>{referralUrl}</code>
            <CopyButton value={referralUrl} />
            <ReferralShareMenu handle={viewer.handle} referralUrl={referralUrl} imageUrl={imageUrl} />
          </div>
        </div>
      </section>
    </div>
  );
}
