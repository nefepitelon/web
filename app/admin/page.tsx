import { requireAdmin } from "@/lib/membership";
import { prisma } from "@/lib/prisma";

const DAY = 24 * 60 * 60 * 1000;

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function changeRate(current: number, previous: number) {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

export default async function AdminOverviewPage() {
  await requireAdmin("/admin");
  const now = new Date();
  const start14 = new Date(now.getTime() - 13 * DAY);
  start14.setUTCHours(0, 0, 0, 0);
  const start30 = new Date(now.getTime() - 30 * DAY);
  const [registeredUsers, activeUsers, visits, paidUsers, referredUsers, pendingReviews, pendingCommissions, recentLogs, newUsers, recentEvents, newPaid, newReferrals] = await Promise.all([
    prisma.user.count(),
    prisma.analyticsEvent.findMany({ where: { userId: { not: null }, createdAt: { gte: start30 } }, distinct: ["userId"], select: { userId: true } }),
    prisma.analyticsEvent.count({ where: { eventType: "PAGE_VIEW" } }),
    prisma.subscription.findMany({ where: { planKey: { in: ["pro", "max"] }, status: { in: ["ACTIVE", "TRIALING"] } }, distinct: ["userId"], select: { userId: true } }),
    prisma.referral.count(),
    prisma.cryptoPayment.count({ where: { status: "REVIEW" } }),
    prisma.commissionLedger.aggregate({ where: { status: "PENDING" }, _count: true, _sum: { amountCents: true } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { actor: { select: { email: true } } } }),
    prisma.user.findMany({ where: { createdAt: { gte: start14 } }, select: { createdAt: true } }),
    prisma.analyticsEvent.findMany({ where: { createdAt: { gte: start14 } }, select: { day: true, userId: true, sessionId: true } }),
    prisma.subscription.findMany({ where: { createdAt: { gte: start14 }, planKey: { in: ["pro", "max"] }, status: { in: ["ACTIVE", "TRIALING"] } }, select: { createdAt: true, userId: true } }),
    prisma.referral.findMany({ where: { createdAt: { gte: start14 } }, select: { createdAt: true } })
  ]);

  const days = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(start14.getTime() + index * DAY);
    return { key: dayKey(date), label: date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" }), registered: 0, active: 0, visits: 0, paid: 0, referred: 0 };
  });
  const byDay = new Map(days.map((day) => [day.key, day]));
  newUsers.forEach((item) => { const row = byDay.get(dayKey(item.createdAt)); if (row) row.registered += 1; });
  newPaid.forEach((item) => { const row = byDay.get(dayKey(item.createdAt)); if (row) row.paid += 1; });
  newReferrals.forEach((item) => { const row = byDay.get(dayKey(item.createdAt)); if (row) row.referred += 1; });
  const activeSets = new Map<string, Set<string>>();
  recentEvents.forEach((event) => {
    const key = dayKey(event.day);
    const row = byDay.get(key);
    if (!row) return;
    row.visits += 1;
    const identity = event.userId ?? event.sessionId;
    const set = activeSets.get(key) ?? new Set<string>();
    set.add(identity);
    activeSets.set(key, set);
  });
  days.forEach((row) => { row.active = activeSets.get(row.key)?.size ?? 0; });
  const previousWeek = days.slice(0, 7);
  const currentWeek = days.slice(7);
  const trendMetrics = [
    { label: "注册用户", current: sum(currentWeek.map((item) => item.registered)), previous: sum(previousWeek.map((item) => item.registered)) },
    { label: "活跃用户", current: sum(currentWeek.map((item) => item.active)), previous: sum(previousWeek.map((item) => item.active)) },
    { label: "访问次数", current: sum(currentWeek.map((item) => item.visits)), previous: sum(previousWeek.map((item) => item.visits)) },
    { label: "付费新增", current: sum(currentWeek.map((item) => item.paid)), previous: sum(previousWeek.map((item) => item.paid)) },
    { label: "推荐新增", current: sum(currentWeek.map((item) => item.referred)), previous: sum(previousWeek.map((item) => item.referred)) }
  ];
  const maxVisits = Math.max(1, ...days.map((item) => item.visits));

  return (
    <div className="section-stack">
      <section className="panel admin-overview-hero">
        <div className="panel-header"><div><p className="eyebrow">OPERATIONS OVERVIEW</p><h2>平台全览图</h2><p>身份、访问、付费、推荐与人工付款审核的统一实时摘要。</p></div><span className="status-pill">LIVE</span></div>
        <div className="panel-body"><div className="admin-kpi-grid">
          <div className="stat-card"><span>注册用户数</span><strong>{registeredUsers}</strong><small>累计身份账户</small></div>
          <div className="stat-card"><span>30 日活跃用户</span><strong>{activeUsers.length}</strong><small>登录访问去重</small></div>
          <div className="stat-card"><span>平台访问次数</span><strong>{visits}</strong><small>页面 / 会话 / 日去重</small></div>
          <div className="stat-card"><span>付费用户数</span><strong>{paidUsers.length}</strong><small>Pro + Max 有效订阅</small></div>
          <div className="stat-card"><span>推荐用户数</span><strong>{referredUsers}</strong><small>服务端归因</small></div>
          <div className="stat-card"><span>付款待审核</span><strong>{pendingReviews}</strong><small>4 小时审核队列</small></div>
          <div className="stat-card"><span>待结算返佣</span><strong>{pendingCommissions._count}</strong><small>{"$"}{((pendingCommissions._sum.amountCents ?? 0) / 100).toFixed(2)}</small></div>
        </div></div>
      </section>

      <section className="panel">
        <div className="panel-header"><div><h2>数据趋势 · 最近 14 天</h2><p>按日记录访问和新增，按周比较增长次数与增长率。</p></div></div>
        <div className="panel-body">
          <div className="weekly-growth-grid">{trendMetrics.map((metric) => {
            const rate = changeRate(metric.current, metric.previous);
            return <div className="weekly-growth-card" key={metric.label}><span>{metric.label}</span><strong>{metric.current}</strong><small className={rate >= 0 ? "is-positive" : "is-negative"}>{rate >= 0 ? "+" : ""}{rate.toFixed(1)}% / 周</small><em>上周 {metric.previous}</em></div>;
          })}</div>
          <div className="admin-traffic-chart" aria-label="最近 14 天访问趋势">{days.map((day) => <div className="admin-traffic-bar" key={day.key}><span style={{ height: `${Math.max(4, day.visits / maxVisits * 100)}%` }} title={`${day.label}: ${day.visits} 次访问`} /><small>{day.label}</small></div>)}</div>
        </div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>日期</th><th>注册</th><th>活跃</th><th>访问</th><th>付费</th><th>推荐</th></tr></thead><tbody>{days.slice().reverse().map((day) => <tr key={day.key}><td>{day.key}</td><td>{day.registered}</td><td>{day.active}</td><td>{day.visits}</td><td>{day.paid}</td><td>{day.referred}</td></tr>)}</tbody></table></div>
      </section>

      <section className="panel">
        <div className="panel-header"><div><h2>最近管理员操作</h2><p>收款审核、返佣结算与权限变更均进入不可由普通后台删除的审计日志。</p></div></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>时间</th><th>管理员</th><th>操作</th><th>对象</th></tr></thead><tbody>{recentLogs.map((log) => <tr key={log.id}><td>{log.createdAt.toLocaleString("zh-CN")}</td><td>{log.actor?.email ?? "system"}</td><td>{log.action}</td><td>{log.targetType} · {log.targetId ?? "—"}</td></tr>)}</tbody></table></div>
      </section>
    </div>
  );
}
