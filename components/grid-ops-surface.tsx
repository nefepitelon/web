"use client";

import {
  ArrowRightLeft,
  Check,
  Copy,
  Download,
  FileWarning,
  HardDrive,
  RefreshCw,
  Server,
  ShieldCheck,
  TerminalSquare,
  WifiOff
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const ENGINE_URL = "http://127.0.0.1:8080";
const ENGINE_VERSION = "2.3.1";
const CONSOLE_API_VERSION = 8;
const MIN_COMPATIBLE_ENGINE_VERSION = "1.2.3";
const START_COMMAND = 'cd /d "%USERPROFILE%\\Documents\\welinkbtc-main" && npm run grid:start';
const DOWNLOAD_URL = "/downloads/启动AI网格交易Ops.bat";
const RUN_MODE_STORAGE_KEY = "welinkbtc-grid-ops-run-mode-v1";

type EngineStatus = "checking" | "online" | "offline" | "outdated";
type RunMode = "local" | "hosted";
type EngineHealth = {
  ok?: boolean;
  version?: string;
  consoleApiVersion?: number;
  networkReady?: boolean;
};

function parseSemver(value?: string): [number, number, number] | null {
  const match = String(value || "").match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export function isCompatibleEngine(result: EngineHealth) {
  // Protocol capability is authoritative. Engine and website patch releases
  // can be deployed independently without a newer engine being mislabeled old.
  if (result.consoleApiVersion != null) return result.consoleApiVersion === CONSOLE_API_VERSION;

  // Older engines did not publish a protocol version. Keep them usable when
  // they are on the same major release and meet the last known safe minimum.
  const version = parseSemver(result.version);
  const minimum = parseSemver(MIN_COMPATIBLE_ENGINE_VERSION);
  if (!version || !minimum || version[0] !== minimum[0]) return false;
  return version[1] > minimum[1]
    || (version[1] === minimum[1] && version[2] >= minimum[2]);
}

function RunModeChoice({ onChoose }: { onChoose: (mode: RunMode) => void }) {
  return (
    <main className="grid-ops-page">
      <div className="grid-ops-ribbon">
        <div>
          <span className="grid-ops-status-dot grid-ops-status-dot--checking" aria-hidden="true" />
          <strong>AI网格交易Ops</strong>
          <span>请选择运行方式</span>
        </div>
        <span>之后可随时切换</span>
      </div>

      <section className="grid-ops-mode-choice" aria-labelledby="grid-ops-mode-title">
        <div className="grid-ops-mode-choice-inner">
          <div className="grid-ops-mode-heading">
            <span>RUN MODE</span>
            <h1 id="grid-ops-mode-title">选择交易引擎运行方式</h1>
            <p>两种方式均默认从模拟盘开始。选择只保存在当前浏览器，进入控制台后仍可随时切换。</p>
          </div>

          <div className="grid-ops-mode-options">
            <article className="grid-ops-mode-option">
              <div className="grid-ops-mode-option-icon"><HardDrive size={28} aria-hidden="true" /></div>
              <span className="grid-ops-mode-option-pill">隐私优先</span>
              <h2>启动本地交易引擎</h2>
              <p>交易所密钥、签名私钥与运行状态只留在你的电脑。首次使用需要下载一键启动文件，并保持本地引擎窗口开启。</p>
              <ul>
                <li>支持 AI 助手、多账号和 12 个交易场所</li>
                <li>浏览器通过 127.0.0.1 连接本机控制台</li>
              </ul>
              <button type="button" onClick={() => onChoose("local")}>
                使用本地交易引擎 <HardDrive size={16} aria-hidden="true" />
              </button>
            </article>

            <article className="grid-ops-mode-option grid-ops-mode-option--hosted">
              <div className="grid-ops-mode-option-icon"><Server size={28} aria-hidden="true" /></div>
              <span className="grid-ops-mode-option-pill">免下载 · 持续运行</span>
              <h2>线上服务器托管运行</h2>
              <p>无需下载项目或安装 Node.js。由 welinkBTC 的 Durable Workflow 托管十二交易所 AI 网格与 AI 对冲策略，关闭网页后仍会继续运行。</p>
              <ul>
                <li>支持 AI网格交易Ops、AI对冲交易Ops 与多账号</li>
                <li>配置经 AES-256-GCM 加密，状态可恢复并持续运行</li>
              </ul>
              <button type="button" onClick={() => onChoose("hosted")}>
                使用线上服务器托管 <Server size={16} aria-hidden="true" />
              </button>
            </article>
          </div>

          <div className="grid-ops-mode-risk-note">
            <ShieldCheck size={17} aria-hidden="true" />
            <span>本地模式不上传交易凭据；托管模式会保存加密的服务器运行副本。实盘均需使用禁止提现的专用交易密钥并完成二次确认。</span>
          </div>
        </div>
      </section>
    </main>
  );
}

function HostedGridOpsSurface({ onSwitchMode }: { onSwitchMode: () => void }) {
  return (
    <div className="grid-ops-hosted-shell">
      <div className="grid-ops-mode-switcher">
        <div><Server size={14} aria-hidden="true" /><strong>线上服务器托管运行</strong><span>无需下载 · 关闭网页后继续运行</span></div>
        <button type="button" onClick={onSwitchMode}><ArrowRightLeft size={13} aria-hidden="true" />切换运行方式</button>
      </div>
      <iframe
        className="grid-ops-frame grid-ops-hosted-frame"
        src="/grid-ops-hosted-console?embedded=1"
        title="AI网格交易Ops 与 AI对冲交易Ops 线上托管控制台"
      />
    </div>
  );
}

export function GridOpsSurface({ storageScope }: { storageScope: string }) {
  const storageKey = `${RUN_MODE_STORAGE_KEY}:${storageScope}`;
  const [mode, setMode] = useState<RunMode | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved === "local" || saved === "hosted") setMode(saved);
    } catch {
      // Storage may be disabled in privacy-restricted browsers. The chooser
      // remains fully usable for the current page session.
    }
  }, [storageKey]);

  function chooseMode(nextMode: RunMode) {
    try { window.localStorage.setItem(storageKey, nextMode); } catch { /* session-only fallback */ }
    setMode(nextMode);
  }

  function switchMode() {
    try { window.localStorage.removeItem(storageKey); } catch { /* session-only fallback */ }
    setMode(null);
  }

  if (mode === "local") return <LocalGridOpsSurface onSwitchMode={switchMode} />;
  if (mode === "hosted") return <HostedGridOpsSurface onSwitchMode={switchMode} />;
  return <RunModeChoice onChoose={chooseMode} />;
}

function LocalGridOpsSurface({ onSwitchMode }: { onSwitchMode: () => void }) {
  const [status, setStatus] = useState<EngineStatus>("checking");
  const [copied, setCopied] = useState(false);
  const [frameVersion, setFrameVersion] = useState(0);

  const checkEngine = useCallback(async (showProgress = true) => {
    if (!showProgress && document.hidden) return false;
    if (showProgress) setStatus("checking");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`${ENGINE_URL}/api/health?webVersion=${ENGINE_VERSION}`, {
        cache: "no-store",
        mode: "cors",
        signal: controller.signal
      });
      const result = await response.json() as EngineHealth;
      // Local service health and exchange network health are intentionally
      // separate. The console must remain available so the user can repair IP
      // settings even while every external route is unavailable.
      const isHealthy = response.ok && result.ok === true;
      const isOnline = isHealthy && isCompatibleEngine(result);
      setStatus(isOnline ? "online" : isHealthy ? "outdated" : "offline");
      return isOnline;
    } catch {
      setStatus("offline");
      return false;
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    void checkEngine();
    const poller = window.setInterval(() => void checkEngine(false), 3000);
    return () => window.clearInterval(poller);
  }, [checkEngine]);

  async function copyStartCommand() {
    try {
      await navigator.clipboard.writeText(START_COMMAND);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  const online = status === "online";
  const checking = status === "checking";
  const outdated = status === "outdated";

  if (online) {
    return (
      <main className="grid-ops-page">
        <div className="grid-ops-ribbon">
          <div>
            <span className="grid-ops-status-dot grid-ops-status-dot--online" aria-hidden="true" />
            <strong>AI网格交易Ops</strong>
            <span>本地引擎已连接 · Decibel / Extended / RISEx / Binance / Ondo Perps / Phoenix / Nado / OKX / GRVT / Arcus / Entropy / RHC Lighter</span>
          </div>
          <div className="grid-ops-ribbon-actions">
            <button type="button" onClick={() => setFrameVersion((version) => version + 1)}>
              刷新控制台 <RefreshCw size={12} aria-hidden="true" />
            </button>
            <button type="button" onClick={onSwitchMode}><ArrowRightLeft size={12} aria-hidden="true" />切换运行方式</button>
          </div>
        </div>
        <iframe
          key={frameVersion}
          className="grid-ops-frame"
          src={`${ENGINE_URL}/?embedded=1&webVersion=${ENGINE_VERSION}&reload=${frameVersion}`}
          title="AI网格交易Ops 本地控制台"
        />
      </main>
    );
  }

  return (
    <main className="grid-ops-page">
      <div className="grid-ops-ribbon">
        <div>
          <span className={`grid-ops-status-dot ${online ? "grid-ops-status-dot--online" : checking ? "grid-ops-status-dot--checking" : ""}`} aria-hidden="true" />
          <strong>AI网格交易Ops</strong>
          <span>{checking ? "正在检测本地引擎" : outdated ? "本地引擎版本过旧" : online ? "本地引擎已就绪" : "未检测到本地引擎"}</span>
        </div>
        <div className="grid-ops-ribbon-actions">
          <span>私钥只保存在你的电脑</span>
          <button type="button" onClick={onSwitchMode}><ArrowRightLeft size={12} aria-hidden="true" />切换运行方式</button>
        </div>
      </div>

      <section className="grid-ops-connection" aria-live="polite">
        <div className="grid-ops-connect-card">
          <div className="grid-ops-connect-icon" aria-hidden="true">
            <WifiOff size={30} />
          </div>
          <div className="grid-ops-engine-pill">
            <span aria-hidden="true" />
            {checking ? "检测中" : outdated ? "本地引擎需要更新" : "本地引擎未启动"}
          </div>

          <h1>{outdated ? "先更新本地交易引擎" : "先启动本地交易引擎"}</h1>
          <p className="grid-ops-connect-lead">
            线上页面不能替你启动电脑上的交易程序。这样设计可以保证交易所密钥、签名私钥和运行状态始终留在你的电脑，不上传到云端。
          </p>
          <p className="grid-ops-connect-detail">
            {outdated
              ? "请先关闭正在运行的旧版引擎命令窗口，再下载并双击最新版一键启动文件。"
              : "下载并双击一键启动文件。页面每 3 秒自动检测一次；即使交易所网络尚未配置，控制台也会先载入，方便进入“IP 配置”修复网络。"}
          </p>

          <div className="grid-ops-steps">
            <div>
              <span>01</span>
              <p><strong>下载启动文件</strong>点击下方“下载一键启动文件”，保存到电脑。</p>
            </div>
            <div>
              <span>02</span>
              <p><strong>双击运行</strong>自动从 welinkBTC 服务器安装最新版引擎，无需访问 GitHub 或手动下载源码。</p>
            </div>
            <div>
              <span>03</span>
              <p><strong>保持窗口开启</strong>看到本地引擎已启动后，不要关闭命令窗口。</p>
            </div>
            <div>
              <span>04</span>
              <p><strong>当前页面自动进入</strong>默认使用 10,000 USDC 模拟盘，不会动用真实资金。</p>
            </div>
          </div>

          <div className="grid-ops-command">
            <TerminalSquare size={18} aria-hidden="true" />
            <code>{START_COMMAND}</code>
            <button type="button" onClick={copyStartCommand} aria-label="复制 CMD 启动命令">
              {copied ? <Check size={16} /> : <Copy size={16} />}
              <span>{copied ? "已复制" : "复制"}</span>
            </button>
          </div>

          <div className="grid-ops-cmd-note">
            <TerminalSquare size={17} aria-hidden="true" />
            <span>打开 CMD（命令提示符）：<strong>按下键盘上的 Win + R 键，在弹出的“运行”窗口中输入 cmd，然后按回车键</strong>；然后复制上边的命令，粘贴后执行！</span>
          </div>

          <div className="grid-ops-error-note">
            <FileWarning size={17} aria-hidden="true" />
            <span>出现 ENOENT 是因为在 <code>C:\Windows\System32</code> 等错误目录运行了 npm；上面的完整命令会先进入项目目录再启动。</span>
          </div>

          <div className="grid-ops-connect-actions">
            <a className="grid-ops-action grid-ops-action--primary" href={DOWNLOAD_URL} download="启动AI网格交易Ops.bat">
              <Download size={17} aria-hidden="true" />
              下载一键启动文件
            </a>
            <button className="grid-ops-action" type="button" onClick={() => void checkEngine()} disabled={checking}>
              <RefreshCw className={checking ? "grid-ops-spin" : ""} size={17} aria-hidden="true" />
              {checking ? "正在检测" : "重新检测"}
            </button>
          </div>

          <div className="grid-ops-security-note">
            <ShieldCheck size={17} aria-hidden="true" />
            <span>本地服务仅监听 127.0.0.1，不向局域网或公网开放。</span>
          </div>
        </div>
      </section>
    </main>
  );
}
