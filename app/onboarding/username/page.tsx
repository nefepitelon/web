import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { setHandleAction } from "@/app/actions/account";
import { AppShell } from "@/components/app-shell";
import { requireViewer } from "@/lib/membership";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "设置专属用户名" };

export default async function UsernameOnboardingPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const viewer = await requireViewer("/onboarding/username", false);
  if (viewer.handle) redirect("/account");
  const { error } = await searchParams;

  return (
    <AppShell viewer={viewer}>
      <main className="auth-page">
        <div className="auth-grid">
          <section className="auth-story">
            <div>
              <p className="eyebrow">ONBOARDING / IDENTITY</p>
              <h1>领取你的 welinkBTC 身份。</h1>
              <p>用户名同时是公开身份前缀和推荐码。为防止冒用，设置后默认不可自行修改。</p>
            </div>
            <div className="auth-signal">
              <div><span>FORMAT</span><strong>lowercase</strong></div>
              <div><span>SUFFIX</span><strong>.welinkBTC</strong></div>
              <div><span>REFERRAL</span><strong>/i/handle</strong></div>
            </div>
          </section>
          <section className="auth-panel">
            <p className="eyebrow">STEP 1 OF 1</p>
            <h2>设置专属用户名</h2>
            <p>只输入前缀。系统会自动添加 <strong>.welinkBTC</strong> 并检查全站唯一性。</p>
            {error ? <div className="form-message" role="alert">{error}</div> : null}
            <form action={setHandleAction}>
              <div className="field">
                <label htmlFor="handle">用户名</label>
                <div className="input-group">
                  <input className="input" id="handle" name="handle" pattern="[a-z]{3,20}" minLength={3} maxLength={20} placeholder="satoshi" autoComplete="off" required />
                  <span className="input-suffix">.welinkBTC</span>
                </div>
                <span className="field-hint">3–20 位小写英文字母，不允许数字、符号或直接输入后缀。</span>
              </div>
              <button className="button button--block" type="submit">确认并生成推荐链接</button>
            </form>
          </section>
        </div>
      </main>
    </AppShell>
  );
}
