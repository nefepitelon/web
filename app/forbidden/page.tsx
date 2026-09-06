import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getViewer } from "@/lib/membership";

export const dynamic = "force-dynamic";

export default async function ForbiddenPage() {
  const viewer = await getViewer();
  return (
    <AppShell viewer={viewer}>
      <main className="forbidden-page">
        <section className="forbidden-card">
          <p className="eyebrow">403 / ACCESS CONTROL</p>
          <h1>当前账户没有此权限。</h1>
          <p>权限在服务端校验。若你需要高级数据，请升级会员；管理员区域只对已授权且完成 2FA 的账户开放。</p>
          <div className="gate-actions">
            <Link className="button" href="/account/subscription">查看会员方案</Link>
            <Link className="button button--outline" href="/">返回首页</Link>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
