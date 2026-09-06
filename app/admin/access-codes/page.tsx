import { toggleAccessCodeAction } from "@/app/actions/admin";
import { AccessCodeAdminForm } from "@/components/access-code-admin-form";
import { requireAdmin } from "@/lib/membership";
import { prisma } from "@/lib/prisma";

const errors: Record<string, string> = {
  invalid: "请填写有效的活动名称和至少 8 位 Access Code。",
  exists: "这个 Access Code 已经存在，请重新生成。",
  expiry: "活动截止时间必须晚于当前时间。"
};

export default async function AdminAccessCodesPage({
  searchParams
}: {
  searchParams: Promise<{ created?: string; error?: string }>;
}) {
  await requireAdmin("/admin/access-codes");
  const [params, accessCodes] = await Promise.all([
    searchParams,
    prisma.accessCode.findMany({ orderBy: { createdAt: "desc" }, take: 100 })
  ]);

  return (
    <div className="section-stack">
      {params.created === "1" ? <div className="form-message form-message--success">Access Code 已创建。原始代码不会在列表中再次显示。</div> : null}
      {params.error ? <div className="form-message" role="alert">{errors[params.error] ?? "Access Code 创建失败。"}</div> : null}

      <section className="panel">
        <div className="panel-header"><div><h2>创建 Access Code</h2><p>为用户发放 30 天 Max 全功能体验；不会授予管理员后台权限。</p></div></div>
        <div className="panel-body"><AccessCodeAdminForm /></div>
      </section>

      <section className="panel">
        <div className="panel-header"><div><h2>Access Code 列表</h2><p>停用只阻止新的兑换，不会提前撤销已经生效的 30 天体验。</p></div></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>活动</th><th>代码摘要</th><th>兑换数</th><th>截止时间</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              {accessCodes.map((code) => (
                <tr key={code.id}>
                  <td><strong>{code.label}</strong><br /><span>30 天 Max</span></td>
                  <td><code>{code.codeHint}</code></td>
                  <td>{code.redemptionCount} / {code.maxRedemptions ?? "∞"}</td>
                  <td>{code.expiresAt ? code.expiresAt.toLocaleString("zh-CN") : "不限"}</td>
                  <td><span className={`status-pill ${code.active ? "" : "status-pill--muted"}`}>{code.active ? "启用" : "停用"}</span></td>
                  <td>
                    <form action={toggleAccessCodeAction}>
                      <input type="hidden" name="id" value={code.id} />
                      <input type="hidden" name="active" value={String(!code.active)} />
                      <button className="button button--small button--outline" type="submit">{code.active ? "停用" : "启用"}</button>
                    </form>
                  </td>
                </tr>
              ))}
              {!accessCodes.length ? <tr><td colSpan={6} className="empty-state">尚未创建 Access Code。</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
