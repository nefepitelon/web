import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/membership";

export default async function AdminAuditLogsPage({ searchParams }: { searchParams: Promise<{ action?: string }> }) {
  await requireAdmin("/admin/audit-logs");
  const { action } = await searchParams;
  const logs = await prisma.auditLog.findMany({
    where: action ? { action: { contains: action, mode: "insensitive" } } : undefined,
    include: { actor: { select: { email: true } } }, orderBy: { createdAt: "desc" }, take: 200
  });
  return (
    <section className="panel">
      <div className="panel-header"><div><h2>审计日志</h2><p>管理员关键操作、对象、IP 与客户端信息。后台不提供删除能力。</p></div></div>
      <div className="panel-body"><form className="admin-toolbar"><input className="input" name="action" defaultValue={action} placeholder="按操作名筛选" /><button className="button button--small button--light">筛选</button></form></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>时间</th><th>管理员</th><th>操作</th><th>对象</th><th>IP</th></tr></thead><tbody>{logs.map((log) => (
        <tr key={log.id}><td>{log.createdAt.toLocaleString("zh-CN")}</td><td>{log.actor?.email ?? "system"}</td><td>{log.action}</td><td>{log.targetType} · {log.targetId ?? "—"}</td><td>{log.ipAddress ?? "—"}</td></tr>
      ))}</tbody></table></div>
    </section>
  );
}
