import { updateContentGateAction } from "@/app/actions/admin";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/membership";

export default async function AdminContentGatesPage() {
  await requireAdmin("/admin/content-gates");
  const gates = await prisma.contentGate.findMany({ orderBy: { key: "asc" } });
  return (
    <section className="panel">
      <div className="panel-header"><div><h2>内容权限配置</h2><p>定义功能最低会员层、访客预览与预览条数。服务端 API 仍以 entitlement 为最终安全边界。</p></div></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>功能</th><th>最低方案</th><th>访客预览</th><th>预览条数</th><th>启用</th><th>操作</th></tr></thead><tbody>{gates.map((gate) => (
        <tr key={gate.id}><td><strong>{gate.label}</strong><br /><span>{gate.key}</span></td><td colSpan={5}><form className="table-actions" action={updateContentGateAction}><input type="hidden" name="id" value={gate.id} /><select className="select" name="minimumPlan" defaultValue={gate.minimumPlan}><option value="guest">guest</option><option value="free">free</option><option value="pro">pro</option><option value="max">max</option></select><label><input type="checkbox" name="guestPreview" defaultChecked={gate.guestPreview} /> 预览</label><input className="input" style={{ width: 72, minHeight: 34 }} name="previewLimit" type="number" min="0" max="100" defaultValue={gate.previewLimit ?? 0} /><label><input type="checkbox" name="enabled" defaultChecked={gate.enabled} /> 启用</label><button className="button button--small button--light">保存</button></form></td></tr>
      ))}</tbody></table></div>
    </section>
  );
}
