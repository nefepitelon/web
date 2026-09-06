"use client";

import { useState } from "react";

export function ApiKeyManager() {
  const [name, setName] = useState("Primary API key");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function createKey(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "无法创建 API Key");
      setCreatedKey(payload.key);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法创建 API Key");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <form className="form-row" onSubmit={createKey}>
        <div className="field"><label htmlFor="key-name">名称</label><input className="input" id="key-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} /></div>
        <div className="field"><span className="field-label">创建</span><button className="button" type="submit" disabled={pending}>{pending ? "创建中…" : "生成新 Key"}</button></div>
      </form>
      {createdKey ? (
        <div className="form-message form-message--success"><strong>只显示一次：</strong><br /><code>{createdKey}</code><br />请立即保存到安全的密钥管理器。</div>
      ) : null}
      {error ? <div className="form-message">{error}</div> : null}
    </div>
  );
}
