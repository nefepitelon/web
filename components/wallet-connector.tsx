"use client";

import { useState } from "react";

type EthereumProvider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

export function WalletConnector() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function connect() {
    setPending(true);
    setMessage(null);
    try {
      const ethereum = (window as typeof window & { ethereum?: EthereumProvider }).ethereum;
      if (!ethereum) throw new Error("未检测到 EVM 钱包扩展");
      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const address = accounts[0];
      if (!address) throw new Error("钱包没有返回地址");

      const challengeResponse = await fetch("/api/wallets/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chain: "EVM", address })
      });
      const challenge = await challengeResponse.json();
      if (!challengeResponse.ok) throw new Error(challenge.error ?? "无法创建签名请求");

      const signature = (await ethereum.request({
        method: "personal_sign",
        params: [challenge.message, address]
      })) as string;
      const verifyResponse = await fetch("/api/wallets/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: challenge.id, signature })
      });
      const result = await verifyResponse.json();
      if (!verifyResponse.ok) throw new Error(result.error ?? "签名验证失败");
      setMessage("钱包地址已通过签名验证并绑定。");
      window.location.reload();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "钱包连接失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button className="button button--small" type="button" onClick={connect} disabled={pending}>
        {pending ? "等待签名…" : "绑定 EVM 钱包"}
      </button>
      {message ? <p className="field-hint" role="status">{message}</p> : null}
    </div>
  );
}
