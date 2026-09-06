"use client";

import { useState } from "react";
import { createAccessCodeAction } from "@/app/actions/admin";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateAccessCode() {
  const values = new Uint32Array(16);
  crypto.getRandomValues(values);
  const characters = Array.from(values, (value) => alphabet[value % alphabet.length]);
  return [0, 4, 8, 12].map((start) => characters.slice(start, start + 4).join("")).join("-");
}

export function AccessCodeAdminForm() {
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);

  function generate() {
    setCode(generateAccessCode());
    setCopied(false);
  }

  async function copy() {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
  }

  return (
    <form action={createAccessCodeAction} className="admin-form">
      <div className="form-row">
        <div className="field">
          <label htmlFor="access-code-label">活动名称</label>
          <input className="input" id="access-code-label" name="label" placeholder="例如：首批内测体验" maxLength={80} required />
        </div>
        <div className="field">
          <label htmlFor="admin-access-code">Access Code</label>
          <div className="access-code-admin-input">
            <input className="input" id="admin-access-code" name="code" value={code} onChange={(event) => { setCode(event.target.value); setCopied(false); }} placeholder="生成或输入至少 8 位体验码" maxLength={80} required />
            <button className="button button--small button--outline" type="button" onClick={generate}>生成</button>
            <button className="button button--small button--outline" type="button" onClick={copy} disabled={!code}>{copied ? "已复制" : "复制"}</button>
          </div>
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="access-code-limit">总兑换上限（可选）</label>
          <input className="input" id="access-code-limit" name="maxRedemptions" type="number" min="1" max="1000000" placeholder="留空表示不限制" />
        </div>
        <div className="field">
          <label htmlFor="access-code-expiry">活动截止时间（可选）</label>
          <input className="input" id="access-code-expiry" name="expiresAt" type="datetime-local" />
        </div>
      </div>
      <p className="field-hint">每次兑换固定获得 30 天 Max 权益。系统只保存代码摘要，创建前请复制并妥善保管原始代码。</p>
      <button className="button button--light" type="submit">创建 Access Code</button>
    </form>
  );
}
