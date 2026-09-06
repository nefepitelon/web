import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getViewer } from "@/lib/membership";

export const dynamic = "force-dynamic";

export default async function SuspendedPage() {
  const viewer = await getViewer();
  return (
    <AppShell viewer={viewer}>
      <main className="forbidden-page">
        <section className="forbidden-card">
          <p className="eyebrow">ACCOUNT STATUS</p>
          <h1>账户当前不可用。</h1>
          <p>该账户已被暂停。公开内容仍可查看；如需复核，请通过 welinkBTC 官方支持渠道联系管理员。</p>
          <div className="gate-actions"><Link className="button" href="/">返回公开首页</Link><Link className="button button--outline" href="/logout">退出登录</Link></div>
        </section>
      </main>
    </AppShell>
  );
}
