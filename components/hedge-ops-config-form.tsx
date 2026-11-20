"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { RefreshCw, Save } from "lucide-react";
import type { HedgeEngine } from "@/lib/hedge-ops/protocol";

const engineLabels: Record<HedgeEngine, string> = {
  lighter: "Arcus <> RHC Lighter", entropy: "Entropy <> Arcus", binance: "Binance <> Lighter Core",
  binance_okx: "Binance <> OKX", binance_hyperliquid: "Binance <> Hyperliquid", hyperliquid_lighter: "Hyperliquid <> Lighter Core",
  ondoperps_entropy: "Ondoperps <> Entropy", ondoperps_ondoperps: "Ondoperps <> Ondoperps（A / B）",
};

type EngineConfig = {
  engine: HedgeEngine;
  values: Record<string, string>;
  fields: Array<{ key: string; label: string; secret: boolean; type: "text" | "number" | "boolean"; configured: boolean }>;
  running: boolean;
  dryRun: boolean;
};

async function readConfigResponse(response: Response): Promise<EngineConfig> {
  const body = await response.json() as Partial<EngineConfig> & { error?: string; message?: string };
  if (!response.ok) throw new Error(body.error || body.message || `配置请求失败（${response.status}）`);
  if (!Array.isArray(body.fields) || !body.values || typeof body.values !== "object") throw new Error("引擎配置暂不可用，请检查服务连接。");
  return body as EngineConfig;
}

export function HedgeOpsConfigForm({ engine, open, onSaved }: { engine: HedgeEngine; open: boolean; onSaved: () => void }) {
  const [config, setConfig] = useState<EngineConfig | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [liveAcknowledged, setLiveAcknowledged] = useState(false);
  const [retry, setRetry] = useState(0);
  const [tab, setTab] = useState<"account" | "network" | "strategy">("account");
  const [clear, setClear] = useState<string[]>([]);
  const [networkBusy, setNetworkBusy] = useState(false);
  const [networkResult, setNetworkResult] = useState("");

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setConfig(null);
    setError("");
    setSaved(false);
    setLiveAcknowledged(false);
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    void fetch(`/api/hedge-ops/config?engine=${engine}`, { cache: "no-store", signal: controller.signal })
      .then(readConfigResponse)
      .then((next) => {
        if (!cancelled) {
          setConfig(next);
          setValues(next.values);
          setClear([]);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error && caught.name !== "AbortError" ? caught.message : "读取配置超时，请检查引擎服务。");
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timeout); };
  }, [engine, open, retry]);

  const dryRun = values.DRY_RUN === undefined ? config?.dryRun !== false : !["false", "0", "no"].includes(values.DRY_RUN.trim().toLowerCase());

  function updateValue(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    setSaved(false);
    if (key === "DRY_RUN") setLiveAcknowledged(false);
  }

  async function saveConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || config?.running) return;
    setError("");
    setSaved(false);
    if (!dryRun && !liveAcknowledged) {
      setError("请先确认实盘交易授权，或开启演练模式。");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/hedge-ops/config?engine=${engine}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values, clear, liveAcknowledged: !dryRun && liveAcknowledged }),
        signal: AbortSignal.timeout(30_000),
      });
      const next = await readConfigResponse(response);
      setConfig(next);
      setValues(next.values);
      setClear([]);
      setSaved(true);
      setLiveAcknowledged(false);
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error && caught.name !== "TimeoutError" ? caught.message : "保存请求超时，请重新读取配置确认结果。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="hedge-ops-config" aria-labelledby="hedge-ops-config-title">
      <div className="hedge-ops-config-heading"><h3 id="hedge-ops-config-title">{engineLabels[engine]} 环境配置</h3><span>当前账户加密保存</span></div>
      <div className="hedge-ops-config-tabs" role="group" aria-label="配置分类">{([ ["account", "账户与 API"], ["network", "IP / 代理"], ["strategy", "运行与风控"] ] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</div>
      {loading ? <p className="hedge-ops-config-loading" role="status"><RefreshCw size={14} className="hedge-ops-spin" aria-hidden="true" />正在读取配置…</p> : null}
      {error ? <div className="hedge-ops-config-error" role="alert">{error}{!config && !loading ? <button type="button" onClick={() => setRetry((value) => value + 1)}>重新读取</button> : null}</div> : null}
      {config && !loading ? (
        <form onSubmit={(event) => void saveConfig(event)}>
          {config.running ? <p className="hedge-ops-config-warning">引擎正在运行。修改配置前，请先处理持仓并停止任务，再重新打开设置。</p> : null}
          <fieldset className="hedge-ops-config-fields" disabled={saving || config.running}>
            <legend className="hedge-ops-sr-only">{engine} 配置参数</legend>
            {config.fields.filter(field => tab === "network" ? field.key.endsWith("_PROXY") : tab === "account" ? /ADDRESS|ACCOUNT_INDEX|API_KEY|API_SECRET|PRIVATE_KEY/.test(field.key) : !field.key.endsWith("_PROXY") && !/ADDRESS|ACCOUNT_INDEX|API_KEY|API_SECRET|PRIVATE_KEY/.test(field.key)).map((field) => (
              <div key={field.key} className={`hedge-ops-config-field${field.type === "boolean" ? " is-boolean" : ""}`}>
                <label htmlFor={`hedge-${engine}-${field.key}`}>{field.label || field.key}{field.secret && field.configured ? <small>已保存</small> : null}</label>
                {field.type === "boolean" ? (
                  <input id={`hedge-${engine}-${field.key}`} type="checkbox" checked={["true", "1", "yes"].includes(values[field.key]?.trim().toLowerCase() || "")} onChange={(event) => updateValue(field.key, String(event.target.checked))} />
                ) : (
                  <input id={`hedge-${engine}-${field.key}`} type={field.secret ? "password" : field.type === "number" ? "number" : "text"} readOnly={engine === "ondoperps_ondoperps" && field.key === "MIN_NET_FUNDING_BPS_H"} step={field.type === "number" ? "any" : undefined} autoComplete={field.secret ? "new-password" : "off"} spellCheck={false} value={values[field.key] ?? ""} placeholder={field.secret && field.configured ? "已保存，留空保持原值" : field.key} onChange={(event) => updateValue(field.key, event.target.value)} onPaste={(event) => {
                    if (field.key !== "ARCUS_API_PRIVATE_KEY") return;
                    const pasted = event.clipboardData.getData("text").trim().replace(/\r\n?/g, "\n");
                    if (pasted.startsWith("-----BEGIN PRIVATE KEY-----")) {
                      // Password inputs strip line breaks; retain the complete PEM in form state.
                      event.preventDefault();
                      updateValue(field.key, pasted);
                    }
                  }} />
                )}
                {field.key === "ARCUS_API_PRIVATE_KEY" ? <small className="hedge-ops-key-hint">{values[field.key]?.startsWith("-----BEGIN PRIVATE KEY-----") ? "已录入完整 PEM 私钥" : "支持十六进制私钥或粘贴完整 PEM 内容"}</small> : null}
                {field.key === "LIGHTER_API_PRIVATE_KEY" ? <small className="hedge-ops-key-hint">Lighter API 私钥为 80 位十六进制（40 字节），可带 0x；请复制当前交易实例 API Keys 页的 Private Key。</small> : null}
                {/^ONDOPERPS(?:_[AB])?_API_(KEY_ID|SECRET)$/.test(field.key) ? <small className="hedge-ops-key-hint">复制 Ondoperps API Keys 页的完整值并保留 ondoKeyId_ / ondoApiSecret_ 前缀；使用读取和交易权限。{engine === "ondoperps_ondoperps" ? "A、B 必须属于两个独立资金账户。" : ""}</small> : null}
                {field.secret && field.configured ? <label className="hedge-ops-clear"><input type="checkbox" checked={clear.includes(field.key)} onChange={event => setClear(current => event.target.checked ? [...current, field.key] : current.filter(key => key !== field.key))} />清除已保存值</label> : null}
              </div>
            ))}
          </fieldset>
          {tab === "network" ? <div className="hedge-ops-network"><p>共用代理留空即直连；单所代理留空则使用共用代理。支持 HTTP/HTTPS CONNECT 代理（包含端口）；本地模式另支持 SOCKS5 和本机代理。代理密码隐藏保存。</p><button type="button" disabled={networkBusy || saving} onClick={async () => {
            setNetworkBusy(true); setNetworkResult("正在检测已保存的网络配置…");
            try { const response = await fetch(`/api/hedge-ops/network?engine=${engine}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.timeout(50_000) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "检测失败"); setNetworkResult(result.checks.map((check: { venue: string; ok: boolean; latencyMs?: number; error?: string; status?: number; proxy?: string; target?: string }) => `${check.venue} · ${check.proxy || "直连"} · ${check.target || ""}\n${check.ok ? `已连接 · ${check.latencyMs} ms` : check.error || `HTTP ${check.status}`}`).join("\n\n")); }
            catch (caught) { setNetworkResult(caught instanceof Error ? caught.message : "检测失败"); } finally { setNetworkBusy(false); }
          }}>检测已保存的 IP / 代理</button><pre role="status">{networkResult}</pre></div> : null}
          {engine === "ondoperps_entropy" ? <p className="hedge-ops-config-warning">Entropy 固定使用 Hyperliquid 的 io HIP-3 交易所，逐仓永续；请填写资金账户地址和已授权专用 agent 私钥。</p> : engine === "ondoperps_ondoperps" ? <p className="hedge-ops-config-warning">此控制台执行双账户对冲轮换。A / B 资金费相互抵消，仍产生交易手续费，不属于资金费套利。</p> : null}
          {!dryRun ? <label className="hedge-ops-live-confirm"><input type="checkbox" checked={liveAcknowledged} disabled={saving || config.running} onChange={(event) => setLiveAcknowledged(event.target.checked)} /><span>我确认关闭演练模式后，引擎会真实下单并产生资金风险。实盘仅允许已通过双重验证的管理员使用。</span></label> : null}
          <div className="hedge-ops-config-footer"><span role="status">{saved ? "配置已保存；点击顶部「启动」运行引擎。" : "密钥留空保持原值，填写新值可替换。"}</span><button type="submit" disabled={saving || config.running || (!dryRun && !liveAcknowledged)}><Save size={13} aria-hidden="true" />{saving ? "保存中…" : "保存配置"}</button></div>
        </form>
      ) : null}
    </section>
  );
}
