import { updateCommissionStatusAction, updateReferralRulesAction } from "@/app/actions/admin";
import { requireAdmin } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { parseReferralRules } from "@/lib/referrals";

export default async function AdminReferralsPage() {
  await requireAdmin("/admin/referrals");
  const [commissions, setting, referralStats] = await Promise.all([
    prisma.commissionLedger.findMany({ include: { referrer: { select: { email: true } }, referred: { select: { email: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.systemSetting.findUnique({ where: { key: "referral.rules" } }),
    prisma.referral.aggregate({ _count: { _all: true, qualifiedAt: true } })
  ]);
  const rules = parseReferralRules(setting?.value);
  const totals = commissions.reduce<Record<string, number>>((result, item) => {
    result[item.rewardType] = (result[item.rewardType] ?? 0) + item.amountCents;
    return result;
  }, {});
  return (
    <div className="section-stack">
      <section className="panel">
        <div className="panel-header"><div><h2>邀请返佣规则</h2><p>注册奖励、有效用户奖励和两级订阅返佣全部由后台配置；交易返佣保留后续扩展。</p></div></div>
        <div className="panel-body">
          <div className="stat-grid"><div className="stat-card"><span>受邀注册</span><strong>{referralStats._count._all}</strong></div><div className="stat-card"><span>有效用户</span><strong>{referralStats._count.qualifiedAt}</strong></div><div className="stat-card"><span>注册奖励累计</span><strong>{"$"}{((totals.REGISTERED_USER ?? 0)/100).toFixed(2)}</strong></div><div className="stat-card"><span>订阅返佣累计</span><strong>{"$"}{((totals.SUBSCRIPTION ?? 0)/100).toFixed(2)}</strong></div></div>
          <form className="referral-rules-form" action={updateReferralRulesAction}>
            <div className="field"><label>每位注册用户奖励 USDT</label><input className="input" name="registrationReward" type="number" min="0" step="0.01" defaultValue={rules.registrationRewardCents / 100} /></div>
            <div className="field"><label>每位有效用户奖励 USDT</label><input className="input" name="validUserReward" type="number" min="0" step="0.01" defaultValue={rules.validUserRewardCents / 100} /></div>
            <div className="field"><label>一级订阅返佣 %</label><input className="input" name="level1Rate" type="number" min="0" max="100" step="0.1" defaultValue={rules.level1RateBps / 100} /></div>
            <div className="field"><label>二级订阅返佣 %</label><input className="input" name="level2Rate" type="number" min="0" max="100" step="0.1" defaultValue={rules.level2RateBps / 100} /></div>
            <div className="field"><label>订阅佣金等待天数</label><input className="input" name="holdDays" type="number" min="0" max="90" defaultValue={rules.holdDays} /></div>
            <div className="field"><span className="field-label">规则版本</span><button className="button button--light" type="submit">保存返佣规则</button></div>
          </form>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header"><div><h2>邀请返佣流水</h2><p>注册和有效用户奖励自动批准；订阅返佣进入等待期，退款订单可标记 VOID。</p></div></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>推荐人</th><th>受邀用户</th><th>奖励类型</th><th>层级 / 比例</th><th>金额</th><th>状态</th><th>操作</th></tr></thead><tbody>{commissions.map((commission) => (
          <tr key={commission.id}><td>{commission.referrer.email}</td><td>{commission.referred.email}</td><td>{commission.rewardType}</td><td>L{commission.level} · {commission.rateBps ? `${(commission.rateBps / 100).toFixed(1)}%` : "固定奖励"}</td><td>{commission.currency.toUpperCase()} {(commission.amountCents / 100).toFixed(2)}</td><td>{commission.status}</td><td><form className="table-actions" action={updateCommissionStatusAction}><input type="hidden" name="id" value={commission.id} /><select className="select" name="status" defaultValue={commission.status}>{["PENDING", "APPROVED", "PAYABLE", "PAID", "VOID"].map((status) => <option value={status} key={status}>{status}</option>)}</select><button className="button button--small button--light">更新</button></form></td></tr>
        ))}</tbody></table></div>
      </section>
    </div>
  );
}
