"use client";

import Image from "next/image";
import { useState } from "react";
import { createBrowserSupabaseClient, isBrowserSupabaseConfigured } from "@/lib/supabase/browser";

type Enrollment = { factorId: string; qrCode: string; secret: string };

export function TwoFactorManager({
  enabled,
  factorId,
  unusedBackupCodes,
  adminRequired
}: {
  enabled: boolean;
  factorId: string | null;
  unusedBackupCodes: number;
  adminRequired: boolean;
}) {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function startEnrollment() {
    setPending(true);
    setMessage(null);
    try {
      const supabase = createBrowserSupabaseClient();
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "welinkBTC Authenticator",
        issuer: "welinkBTC"
      });
      if (error) throw error;
      setEnrollment({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "无法开始 2FA 设置");
    } finally {
      setPending(false);
    }
  }

  async function verifyEnrollment(event: React.FormEvent) {
    event.preventDefault();
    if (!enrollment) return;
    setPending(true);
    setMessage(null);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollment.factorId, code });
      if (error) throw error;
      const response = await fetch("/api/security/2fa/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factorId: enrollment.factorId })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "无法启用 2FA");
      setBackupCodes(payload.backupCodes);
      setEnrollment(null);
      setMessage("2FA 已启用。请立即保存下方一次性备份码。");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "验证码无效");
    } finally {
      setPending(false);
    }
  }

  async function disableTwoFactor(event: React.FormEvent) {
    event.preventDefault();
    if (!factorId) return;
    setPending(true);
    setMessage(null);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (verifyError) throw verifyError;
      const response = await fetch("/api/security/2fa/disable", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factorId })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "无法关闭 2FA");
      window.location.reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "2FA 关闭失败");
    } finally {
      setPending(false);
    }
  }

  if (!isBrowserSupabaseConfigured()) {
    return <div className="form-message">认证服务尚未配置，无法管理 2FA。</div>;
  }

  return (
    <div className="section-stack">
      {adminRequired && !enabled ? <div className="form-message">管理员进入后台前必须启用 2FA。</div> : null}
      {message ? <div className={`form-message ${message.includes("已启用") ? "form-message--success" : ""}`}>{message}</div> : null}
      {!enabled && !enrollment ? (
        <div>
          <p className="field-hint">使用 Google Authenticator、1Password、Authy 等支持 TOTP 的应用。密钥由认证服务加密保存。</p>
          <button className="button" type="button" onClick={startEnrollment} disabled={pending}>{pending ? "准备中…" : "启用双重验证"}</button>
        </div>
      ) : null}

      {enrollment ? (
        <form onSubmit={verifyEnrollment}>
          <div className="form-row">
            <div>
              <div className="qr-wrap"><Image unoptimized src={enrollment.qrCode} alt="welinkBTC TOTP 二维码" width={210} height={210} /></div>
              <p className="field-hint">无法扫描时，手动输入：<code>{enrollment.secret}</code></p>
            </div>
            <div>
              <div className="field">
                <label htmlFor="enable-code">输入 6 位验证码</label>
                <input className="input" id="enable-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value)} required />
              </div>
              <button className="button" type="submit" disabled={pending}>{pending ? "验证中…" : "验证并启用"}</button>
            </div>
          </div>
        </form>
      ) : null}

      {backupCodes ? (
        <div>
          <p><strong>一次性备份码</strong></p>
          <p className="field-hint">这些代码只显示一次，每个只能使用一次。请保存到密码管理器，不要截图上传到公共云盘。</p>
          <div className="code-grid">{backupCodes.map((backupCode) => <code className="backup-code" key={backupCode}>{backupCode}</code>)}</div>
        </div>
      ) : null}

      {enabled ? (
        <div>
          <div className="status-line">
            <div className="status-copy"><strong>TOTP 双重验证</strong><span>登录后需要验证器中的 6 位动态验证码。</span></div>
            <span className="status-pill">已启用</span>
          </div>
          <div className="status-line">
            <div className="status-copy"><strong>可用备份码</strong><span>每个代码使用后立即失效。</span></div>
            <span className={`status-pill ${unusedBackupCodes < 3 ? "status-pill--warn" : ""}`}>{unusedBackupCodes} 个</span>
          </div>
          <form onSubmit={disableTwoFactor}>
            <div className="field">
              <label htmlFor="disable-code">关闭 2FA 前重新输入当前验证码</label>
              <input className="input" id="disable-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value)} required />
            </div>
            <button className="button button--danger" type="submit" disabled={pending || adminRequired}>{pending ? "验证中…" : adminRequired ? "管理员不可关闭 2FA" : "验证并关闭 2FA"}</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
