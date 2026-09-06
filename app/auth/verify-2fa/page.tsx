import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { TwoFactorChallenge } from "@/components/two-factor-challenge";
import { getViewer } from "@/lib/membership";

export const dynamic = "force-dynamic";

export default async function VerifyTwoFactorPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const viewer = await getViewer();
  const requestedNext = (await searchParams).next;
  const next = requestedNext?.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/account";
  if (!viewer) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!viewer.needsSecondFactor) redirect(next);

  return (
    <AppShell viewer={viewer}>
      <main className="auth-page">
        <div className="auth-grid">
          <section className="auth-story">
            <div><p className="eyebrow">SECURITY CHECK</p><h1>再验证一次，保护你的情报账户。</h1><p>该账户已启用双重验证。通过验证器或一次性备份码完成本次会话校验。</p></div>
            <div className="auth-signal"><div><span>SESSION</span><strong>AAL1</strong></div><div><span>TARGET</span><strong>AAL2</strong></div><div><span>EXPIRES</span><strong>12H</strong></div></div>
          </section>
          <section className="auth-panel">
            <p className="eyebrow">TWO-FACTOR AUTHENTICATION</p>
            <h2>输入安全验证码</h2>
            <p>验证码每 30 秒刷新。连续失败会触发请求限速。</p>
            <TwoFactorChallenge next={next} />
          </section>
        </div>
      </main>
    </AppShell>
  );
}
