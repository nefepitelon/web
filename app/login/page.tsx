import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { LoginForm } from "@/components/login-form";
import { getViewer } from "@/lib/membership";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "登录 / 注册" };

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string; error?: string; auth_error?: string }>;
}) {
  const viewer = await getViewer();
  if (viewer) redirect(viewer.handle ? "/account" : "/onboarding/username");

  const params = await searchParams;
  const requestedNext = params.next;
  const next = requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
    ? requestedNext
    : "/account";
  const errorMessages: Record<string, string> = {
    not_configured: "认证服务尚未配置，请联系管理员。",
    oauth_start_failed: "无法启动 Google 登录，请稍后重试。",
    provider_failed: "Google 没有完成授权，请重新选择账号并允许登录。",
    link_expired: "登录链接已过期或已经使用。请重新发送登录链接，并只点击最新一封邮件中的链接。",
    callback_failed: "登录回调已失效或无法建立会话，请重新登录。",
    invalid_access_code: "Access Code 无效、尚未生效、已过期或已达到使用上限。你也可以清空后跳过。"
  };
  const errorKey = params.auth_error ?? params.error;
  const initialError = errorKey ? errorMessages[errorKey] ?? "登录失败，请重新尝试。" : null;

  return (
    <AppShell viewer={null}>
      <main className="auth-page">
        <div className="auth-grid auth-grid--login">
          <section className="auth-story auth-story--login">
            <div>
              <p className="eyebrow">IDENTITY LAYER / PHASE 1</p>
              <h1>系统跟踪BTC周期和链上信号!</h1>
            </div>
            <div className="auth-brand-motion" aria-hidden="true">
              <span className="auth-brand-orbit auth-brand-orbit--outer" />
              <span className="auth-brand-orbit auth-brand-orbit--inner" />
              <span className="auth-brand-beacon auth-brand-beacon--one" />
              <span className="auth-brand-beacon auth-brand-beacon--two" />
              <div className="auth-brand-emblem">
                <Image src="/welinkbtc-orbit-brand.webp" width={148} height={148} sizes="148px" alt="" priority />
              </div>
              <span className="auth-brand-motion__caption">WELINKBTC · IDENTITY ORBIT</span>
            </div>
            <div className="auth-signal" aria-label="账户体系能力">
              <div><span>SESSION</span><strong>安全 Cookie</strong></div>
              <div><span>ACCESS</span><strong>服务端权限</strong></div>
              <div><span>SECURITY</span><strong>可选 2FA</strong></div>
            </div>
          </section>
          <section className="auth-panel auth-panel--login">
            <p className="eyebrow">WELCOME TO WELINKBTC</p>
            <h2>登录或创建账户</h2>
            <p>首次验证成功会自动创建 Free 账户，随后设置你的专属用户名。</p>
            <LoginForm next={next} initialError={initialError} />
            <p className="legal-note">继续即表示你同意 welinkBTC 的服务条款与隐私政策。我们不会要求钱包助记词或私钥。</p>
          </section>
        </div>
      </main>
    </AppShell>
  );
}
