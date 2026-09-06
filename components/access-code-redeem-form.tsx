"use client";

import { useActionState } from "react";
import { redeemAccessCodeAction } from "@/app/actions/access-code";

const initialState = { status: "idle" as const, message: "" };

export function AccessCodeRedeemForm() {
  const [state, action, pending] = useActionState(redeemAccessCodeAction, initialState);

  return (
    <form action={action} className="access-code-redeem-form">
      <div className="access-code-redeem-capsule">
        <span className="access-code-capsule__badge" aria-hidden="true">30D</span>
        <div className="access-code-capsule__copy">
          <label htmlFor="account-access-code">兑换 Access Code</label>
          <span>开启一个月 Max 全功能体验，不包含管理员后台。</span>
        </div>
        <input
          id="account-access-code"
          name="accessCode"
          type="text"
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={64}
          placeholder="XXXX-XXXX-XXXX-XXXX"
          required
          disabled={pending}
        />
        <button className="button button--small" type="submit" disabled={pending}>
          {pending ? "验证中…" : "立即兑换"}
        </button>
      </div>
      {state.message ? (
        <div
          className={`form-message ${state.status === "success" ? "form-message--success" : ""}`}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </div>
      ) : null}
    </form>
  );
}
