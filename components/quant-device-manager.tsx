"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, Download, ExternalLink, Laptop, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { QUANT_ENGINES } from "@/lib/quant-suite/catalog";
import styles from "./quant-devices.module.css";

type Device = {id: string; name: string; engines: string[]; createdAt: string; lastSeenAt?: string | null; revokedAt?: string | null; online?: boolean};
export function QuantDeviceManager({canOperate}: {canOperate: boolean}) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [name, setName] = useState("我的 Windows 交易电脑");
  const [engines, setEngines] = useState<string[]>([...QUANT_ENGINES.map(engine => engine.id)]);
  const [pairing, setPairing] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [language, setLanguage] = useState("zh");
  const l = (zh: string, en: string) => language === "en" ? en : zh;
  useEffect(() => {const sync = () => setLanguage(document.documentElement.dataset.language ?? "zh"); sync(); const observer = new MutationObserver(sync); observer.observe(document.documentElement, {attributes: true, attributeFilter: ["data-language"]}); return () => observer.disconnect();}, []);
  const refresh = useCallback(async () => {
    if (!canOperate) return;
    try {const response = await fetch("/api/quant-suite/devices", {cache: "no-store"}); const data = await response.json(); if (!response.ok) throw new Error(data.message); setDevices(data.devices ?? []);} catch (error) {setNotice(error instanceof Error ? error.message : "Could not load devices");}
  }, [canOperate]);
  useEffect(() => {void refresh(); const timer = window.setInterval(() => {if (!document.hidden) void refresh();}, 15000); return () => clearInterval(timer);}, [refresh]);
  async function pair() {
    setBusy(true); setNotice(""); setPairing("");
    try {const response = await fetch("/api/quant-suite/devices", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({name, engines})}); const data = await response.json(); if (!response.ok) throw new Error(data.message); setPairing(JSON.stringify(data.pairing)); await refresh();} catch (error) {setNotice(error instanceof Error ? error.message : "Pairing failed");} finally {setBusy(false);}
  }
  async function revoke(device: Device) {
    if (!window.confirm(l(`解除“${device.name}”的设备授权？这不会自动平仓或停止本机已经运行的交易进程。`, `Revoke ${device.name}? This does not close positions or stop already-running local trading processes.`))) return;
    setBusy(true); setNotice("");
    try {const response = await fetch("/api/quant-suite/devices", {method: "DELETE", headers: {"Content-Type": "application/json"}, body: JSON.stringify({deviceId: device.id})}); const data = await response.json(); if (!response.ok) throw new Error(data.message); setPairing(""); await refresh();} catch (error) {setNotice(error instanceof Error ? error.message : "Could not revoke device");} finally {setBusy(false);}
  }
  async function copy() {try {await navigator.clipboard.writeText(pairing); setCopied(true); window.setTimeout(() => setCopied(false), 1800);} catch {setNotice(l("请在文本框中手动复制配对信息。", "Copy the pairing information from the text field."));}}
  return <main className={styles.root} data-native-i18n="react"><Link className={styles.back} href="/quant-suite">← {l("量化交易集", "Quant Suite")}</Link><header><div className={styles.icon}><Laptop size={31}/></div><div><span>LOCAL ENGINE / CLOUD DISPATCH</span><h1>{l("本地交易执行器", "Local trading worker")}</h1><p>{l("原生引擎运行在你的电脑，网站与 Supabase 管理调度和记录。", "Native engines run on your computer. The website and Supabase manage dispatch and records.")}</p></div></header>
    <ol className={styles.steps}><li><b>1</b><div><h2>{l("下载并启动", "Download and launch")}</h2><p>{l("双击 .bat，启动本地控制台。Windows 64 位；原生引擎需要 Docker Desktop / Linux 容器。", "Double-click the .bat to start the local console. Requires 64-bit Windows and Docker Desktop with Linux containers.")}</p><a href="/downloads/启动量化交易集.bat" download><Download size={15}/>{l("下载本地交易引擎 .bat", "Download local engine .bat")}</a><a className={styles.minor} href="/downloads/welinkbtc-quant-runtime.zip" download>{l("完整源码包 ZIP", "Full source package ZIP")}</a></div></li><li><b>2</b><div><h2>{l("配对这台电脑", "Pair your computer")}</h2><p>{l("生成下方配对信息，粘贴到本地控制台。它只授权当前账户与所选引擎。", "Generate pairing information below and paste it into the local console. It authorizes only this account and the selected engines.")}</p></div></li><li><b>3</b><div><h2>{l("安装并验证引擎", "Install and verify")}</h2><p>{l("在本地选择原生引擎，配置交易所并验证策略，然后回到站内管理运行。", "Select and install native engines locally, configure the exchange and verify the strategy, then manage execution from the site.")}</p><a href="http://127.0.0.1:8790" target="_blank" rel="noopener noreferrer"><ExternalLink size={14}/>{l("打开本地控制台", "Open local console")}</a></div></li></ol>
    {notice && <div className={styles.notice} role="alert">{notice}</div>}
    <div className={styles.columns}><section><h2><ShieldCheck size={19}/>{l("创建设备配对", "Create device pairing")}</h2>{!canOperate ? <p>{l("请使用已完成账户验证的 Max 或管理员账户登录后配对。", "Sign in with a verified Max or administrator account to pair a device.")} <Link href="/login?next=%2Fquant-suite%2Fdevices">{l("登录", "Sign in")}</Link></p> : <form onSubmit={event => {event.preventDefault(); void pair();}}><label>{l("设备名称", "Device name")}<input value={name} onChange={event => setName(event.target.value)} maxLength={80} required disabled={busy}/></label><fieldset><legend>{l("这台设备负责的引擎", "Engines assigned to this device")}</legend>{QUANT_ENGINES.map(engine => <label key={engine.id}><input type="checkbox" checked={engines.includes(engine.id)} disabled={busy} onChange={event => setEngines(previous => event.target.checked ? [...previous, engine.id] : previous.filter(id => id !== engine.id))}/>{engine.name}</label>)}</fieldset><button type="submit" disabled={busy || !engines.length}>{busy ? l("处理中…", "Working…") : l("生成一次性显示的配对信息", "Generate pairing information")}</button><small>{l("同一账户的每个引擎只能分配给一台有效设备。配对凭据仅显示一次；交易所密钥在本机配置。", "Each engine can be assigned to one active device per account. The pairing credential is shown once. Exchange credentials are configured locally.")}</small></form>}
    {pairing && <div className={styles.pairing}><strong>{l("复制到本地控制台后关闭此信息", "Copy into the local console, then dismiss")}</strong><textarea aria-label={l("设备配对信息", "Device pairing information")} readOnly value={pairing} spellCheck={false}/><div><button onClick={() => void copy()}>{copied ? <Check size={14}/> : <Copy size={14}/>} {copied ? l("已复制", "Copied") : l("复制配对信息", "Copy pairing")}</button><button onClick={() => setPairing("")}>{l("已完成，隐藏", "Done, hide")}</button></div></div>}</section>
    <section><div className={styles.sectionHeading}><h2>{l("已配对设备", "Paired devices")}</h2><button onClick={() => void refresh()} disabled={!canOperate} aria-label={l("刷新设备", "Refresh devices")}><RefreshCw size={15}/></button></div>{!devices.length ? <div className={styles.empty}><Laptop size={26}/><p>{l("尚无已配对设备", "No paired devices")}</p><small>{l("启动本地控制台并完成配对后，这里会显示实际心跳。", "Actual heartbeats appear here after the local console connects.")}</small></div> : devices.map(device => <article key={device.id} className={styles.device}><div><strong>{device.name}</strong><span data-online={device.online && !device.revokedAt}>{device.revokedAt ? l("已撤销", "Revoked") : device.online ? l("在线", "Online") : l("离线", "Offline")}</span></div><p>{device.engines.map(id => QUANT_ENGINES.find(engine => engine.id === id)?.name ?? id).join(" · ")}</p><small>{device.lastSeenAt ? `${l("最近心跳", "Last heartbeat")} ${new Date(device.lastSeenAt).toLocaleString()}` : l("尚未收到心跳", "No heartbeat received")}</small>{!device.revokedAt && <button disabled={busy} onClick={() => void revoke(device)}><Trash2 size={13}/> {l("解除配对", "Revoke pairing")}</button>}</article>)}</section></div>
    <p className={styles.foot}>{l("电脑需保持开机、联网并运行执行器。断开配对不等于停止交易；已有仓位和挂单需在原生引擎中核对。Jesse 实盘仍需你自己的有效插件许可。", "Keep the computer powered on, connected and running the worker. Disconnecting pairing does not stop trading; reconcile positions and orders in the native engine. Jesse live trading still requires your own valid plugin license.")}</p>
  </main>;
}
