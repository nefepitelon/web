"use client";

import { useState } from "react";
import { isBrowserSupabaseConfigured } from "@/lib/supabase/browser";

type EmailMode = "signin" | "signup" | "magic";

export function LoginForm({ next, initialError = null }: { next: string; initialError?: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [mode, setMode] = useState<EmailMode>("signin");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError);
  const [pending, setPending] = useState(false);
  const configured = isBrowserSupabaseConfigured();

  async function submitEmail(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setPending(true);
    try {
      const endpoint = mode === "magic" ? "/api/auth/email" : "/api/auth/password";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, intent: mode, next, accessCode: accessCode.trim() || undefined })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "暂时无法完成登录");
      if (mode === "magic") {
        setMessage("登录链接已发送。请在你的邮箱收件箱中查看登录链接，如未找到，请在垃圾邮件或所有邮件中检查是否被系统屏蔽！建议开启 VPN，系统部分功能需要科学上网连接。");
      } else if (payload.confirmationRequired) {
        setMessage("注册成功，请前往邮箱完成确认后登录。QQ 邮箱若未在收件箱看到，请检查垃圾邮件或全部邮件。");
      } else {
        window.location.assign(payload.next || next);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "暂时无法完成登录");
    } finally {
      setPending(false);
    }
  }

  function signInWithGoogle() {
    setError(null);
    setPending(true);
    const params = new URLSearchParams({ next });
    if (accessCode.trim()) params.set("accessCode", accessCode.trim());
    window.location.assign(`/api/auth/google?${params.toString()}`);
  }

  return (
    <>
      {!configured ? <div className="form-message">认证服务尚未配置。</div> : null}
      <div className="access-code-capsule">
        <span className="access-code-capsule__badge" aria-hidden="true">30D</span>
        <div className="access-code-capsule__copy"><label htmlFor="login-access-code">Access Code <small>可选，可跳过</small></label><span>有效体验码可开启一个月 Max 全功能。</span></div>
        <input id="login-access-code" type="text" autoCapitalize="characters" autoComplete="off" maxLength={64} placeholder="输入体验码" value={accessCode} onChange={(event) => setAccessCode(event.target.value)} disabled={!configured || pending} />
      </div>
      <button className="button button--outline oauth-button" type="button" onClick={signInWithGoogle} disabled={!configured || pending}><span aria-hidden="true">G</span>使用 Google 继续</button>
      <div className="auth-divider">或使用邮箱</div>
      <div className="auth-mode-tabs" role="tablist" aria-label="邮箱登录方式">
        {([['signin','密码登录'],['signup','注册账户'],['magic','魔法链接']] as const).map(([key,label]) => (
          <button className={mode === key ? "is-active" : ""} type="button" role="tab" aria-selected={mode === key} onClick={() => { setMode(key); setError(null); setMessage(null); }} key={key}>{label}</button>
        ))}
      </div>
      <form onSubmit={submitEmail}>
        <div className="field"><label htmlFor="email">邮箱地址</label><input className="input auth-input" id="email" type="email" autoComplete="email" placeholder="you@qq.com / you@example.com" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={!configured || pending} /><span className="field-hint">支持 QQ 邮箱及其他标准邮箱地址。</span></div>
        {mode !== "magic" ? <div className="field"><label htmlFor="password">密码</label><input className="input auth-input" id="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={8} maxLength={72} required value={password} onChange={(event) => setPassword(event.target.value)} disabled={!configured || pending} /><span className="field-hint">8–72 位，并同时包含字母和数字。</span></div> : null}
        <button className="button button--block" type="submit" disabled={!configured || pending}>{pending ? "正在处理…" : mode === "signin" ? "邮箱密码登录" : mode === "signup" ? "创建 Free 账户" : "发送登录链接"}</button>
      </form>
      {error ? <div className="form-message" role="alert">{error}</div> : null}
      {message ? <div className="form-message form-message--success" role="status">{message}</div> : null}
    </>
  );
}
