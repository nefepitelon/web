import { adminSetSubscriptionAction } from "@/app/actions/admin";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/membership";

export default async function AdminSubscriptionsPage() {
  await requireAdmin("/admin/subscriptions");
  const subscriptions = await prisma.subscription.findMany({ include: { user: { include: { profile: true } } }, orderBy: { updatedAt: "desc" }, take: 100 });
  return (
    <section className="panel">
      <div className="panel-header"><div><h2>订阅管理</h2><p>查看 Stripe 同步状态，必要时进行有审计记录的人工补单。</p></div></div>
      <div className="table-wrap"><table className="data-table">
        <thead><tr><th>用户</th><th>Provider</th><th>方案</th><th>状态</th><th>周期结束</th><th>操作</th></tr></thead>
        <tbody>{subscriptions.map((subscription) => (
          <tr key={subscription.id}>
            <td>{subscription.user.profile?.handle ?? subscription.user.email}</td><td>{subscription.provider}</td><td>{subscription.planKey}</td><td>{subscription.status}</td><td>{subscription.currentPeriodEnd?.toLocaleDateString("zh-CN") ?? "—"}</td>
            <td><form className="table-actions" action={adminSetSubscriptionAction}><input type="hidden" name="userId" value={subscription.userId} /><select className="select" name="planKey" defaultValue={subscription.planKey}><option value="free">free</option><option value="pro">pro</option><option value="max">max</option></select><select className="select" name="status" defaultValue={subscription.status}><option value="FREE">FREE</option><option value="ACTIVE">ACTIVE</option><option value="PAST_DUE">PAST_DUE</option><option value="CANCELED">CANCELED</option></select><button className="button button--small button--light">保存</button></form></td>
          </tr>
        ))}</tbody>
      </table></div>
    </section>
  );
}
