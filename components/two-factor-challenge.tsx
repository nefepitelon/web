"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function TwoFactorChallenge({ next }: { next: string }) {
  const [code, setCode] = useState("");
  const [backupMode, setBackupMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      if (backupMode) {
        const response = await fetch("/api/security/2fa/backup-verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "备份码无效");
      } else {
        const supabase = createBrowserSupabaseClient();
        const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
        if (factorsError) throw factorsError;
        const factor = factors.totp.find((item) => item.status === "verified");
        if (!factor) throw new Error("未找到已验证的 TOTP 因子");
        const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
        if (verifyError) throw verifyError;
      }
      window.location.href = next;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "验证失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label htmlFor="two-factor-code">{backupMode ? "一次性备份码" : "6 位动态验证码"}</label>
        <input
          className="input"
          id="two-factor-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          inputMode={backupMode ? "text" : "numeric"}
          autoComplete="one-time-code"
          placeholder={backupMode ? "XXXXX-XXXXX" : "000000"}
          required
        />
      </div>
      <button className="button button--block" type="submit" disabled={pending}>{pending ? "正在验证…" : "验证并继续"}</button>
      <button className="button button--block button--ghost" type="button" onClick={() => { setBackupMode(!backupMode); setCode(""); setError(null); }}>
        {backupMode ? "使用验证器" : "改用备份码"}
      </button>
      {error ? <div className="form-message">{error}</div> : null}
    </form>
  );
}
