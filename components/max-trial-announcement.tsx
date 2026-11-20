"use client";

import { useEffect, useRef, useState } from "react";

export function MaxTrialAnnouncement({ endsAt }: { endsAt: string }) {
  const [open, setOpen] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    dialog?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  const expiryLabel = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Shanghai"
  }).format(new Date(endsAt));

  async function acknowledge() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/account/max-welcome/acknowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acknowledged: true })
      });
      if (!response.ok) throw new Error("暂时无法保存公告状态，请稍后再试。");
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "暂时无法保存公告状态，请稍后再试。");
    } finally {
      setPending(false);
    }
  }

  return (
    <dialog ref={dialogRef} className="max-gift-dialog" aria-labelledby="max-gift-title" aria-describedby="max-gift-copy" onCancel={(event) => { event.preventDefault(); void acknowledge(); }}>
      <section className="max-gift-dialog__panel">
        <div className="max-gift-dialog__halo" aria-hidden="true"><span>MAX</span></div>
        <p className="eyebrow">WELCOME GIFT · WELINKBTC</p>
        <h2 id="max-gift-title">三个月 MAX 权益已到账</h2>
        <p id="max-gift-copy">欢迎加入 welinkBTC。我们已为你的账户免费开通三个月 MAX 权限。体验期内，你可以完整使用高级链上指标、Alpha Radar、AI 研究与交易工作台等 MAX 功能，帮助你更从容地建立自己的研究与执行节奏。</p>
        <div className="max-gift-dialog__details">
          <span>权益有效期至</span>
          <strong>{expiryLabel}</strong>
        </div>
        <p className="max-gift-dialog__note">赠送权益到期后，将按账户原有会员方案继续提供服务，本次赠送不会产生自动扣费。</p>
        {error ? <p className="max-gift-dialog__error" role="alert">{error}</p> : null}
        <button className="button button--block" type="button" onClick={acknowledge} disabled={pending} autoFocus>
          {pending ? "正在开启…" : "开始体验 MAX"}
        </button>
      </section>
    </dialog>
  );
}
