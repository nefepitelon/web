import { redirect } from "next/navigation";
import { ApiKeyManager } from "@/components/api-key-manager";
import { configuredAccess } from "@/lib/content-gates";
import { requireViewer } from "@/lib/membership";
import { prisma } from "@/lib/prisma";

export default async function ApiKeysPage() {
  const viewer = await requireViewer("/account/api-keys");
  const access = await configuredAccess(viewer, "api.keys");
  if (!access.allowed) redirect("/account/subscription");
  const keys = await prisma.apiKey.findMany({ where: { userId: viewer.id }, orderBy: { createdAt: "desc" } });
  return (
    <div className="section-stack">
      <section className="panel"><div className="panel-header"><div><h2>API Key</h2><p>Max 专属访问凭证。原始密钥只在创建时显示一次，数据库仅保存摘要。</p></div></div><div className="panel-body"><ApiKeyManager /></div></section>
      <section className="panel"><div className="panel-header"><div><h2>现有凭证</h2><p>撤销后立即失效。</p></div></div><div className="panel-body">{keys.length ? keys.map((key) => (
        <div className="status-line" key={key.id}><div className="status-copy"><strong>{key.name}</strong><span>{key.prefix}•••• · 创建于 {key.createdAt.toLocaleDateString("zh-CN")}</span></div><form action={`/api/keys/${key.id}`} method="post"><button className="button button--small button--outline" disabled={Boolean(key.revokedAt)}>{key.revokedAt ? "已撤销" : "撤销"}</button></form></div>
      )) : <div className="empty-state">尚未创建 API Key。</div>}</div></section>
    </div>
  );
}
