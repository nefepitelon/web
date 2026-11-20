"""Authenticated, tenant-isolated host for the embedded hedge engines.

This process is deliberately separate from Next.js: closing a browser or a web
request must not stop a hedge. Engine processes and their databases are private
to one authenticated platform owner and one exchange pair. No request starts an
engine implicitly. Run one gateway worker per data directory.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import contextlib
import hmac
import json
import math
import os
from pathlib import Path
import re
from secret_redaction import redact_text
import secrets
import signal
import socket
import subprocess
import sys
import time
from dataclasses import dataclass
from typing import Any

import httpx
from dotenv import dotenv_values
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, Response

HERE = Path(__file__).resolve().parent
from paired_hedge.config import PAIRS, NAMES, defaults as pair_defaults, KEYS
NATIVE_ENGINES = {"binance", *PAIRS}
ENGINES = {**{k: " × ".join(NAMES[v] for v in pair) for k,pair in PAIRS.items()}, "lighter": "Arcus × RHC Lighter", "entropy": "Entropy × Arcus", "binance": "Binance × Lighter Core"}
OWNER_RE = re.compile(r"^[0-9a-f]{64}$")
ASSET_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$")
BLOCKED_KEYS = {
    "HOST", "PORT", "ARCUS_API_URL", "LIGHTER_BASE_URL", "HYPERLIQUID_API_URL",
    "ARCUS_API_PRIVATE_KEY_FILE",
    "ONDOPERPS_API_URL", "ONDOPERPS_A_API_URL", "ONDOPERPS_B_API_URL",
}
BOOLEAN_KEYS = {"DRY_RUN", "ARCUS_MAKER"}
INTEGER_LIMITS = {
    "ARCUS_ACCOUNT_INDEX": (0, 9), "LIGHTER_ACCOUNT_INDEX": (0, 2**53 - 1),
    "LIGHTER_API_KEY_INDEX": (0, 255),
}
NUMBER_LIMITS = {
    "MAX_OPEN_BASIS_BPS": (1, 300), "MIN_NET_FUNDING_BPS_H": (0, 100),
    "MAX_TASK_NOTIONAL": (5, 1000000), "MARGIN_BUFFER": (1, 10),
    "FUNDING_REFRESH_SECONDS": (5, 3600), "FUNDING_STALE_MAX_SECONDS": (5, 86400),
    "FUNDING_TIMEOUT_SECONDS": (1, 120), "ENGINE_CYCLE_SECONDS": (5, 3600),
    "MAKER_WAIT_SECONDS": (1, 3600), "REOPEN_COOLDOWN_SECONDS": (0, 86400),
    "LIQUIDATION_WARN_DISTANCE_PCT": (0.01, 100), "MIN_CORRIDOR_PCT": (0.01, 100),
    "CLOSE_CORRIDOR_PCT": (0.01, 100), "ORDER_SLIPPAGE_BPS": (0, 1000),
}
LABELS = {
    "ONDOPERPS_API_KEY_ID":"Ondoperps API Key ID（含 ondoKeyId_ 前缀）",
    "ONDOPERPS_API_SECRET":"Ondoperps API Secret（含 ondoApiSecret_ 前缀）",
    "ONDOPERPS_PROXY":"Ondoperps 代理",
    "ONDOPERPS_A_API_KEY_ID":"Ondoperps 账户 A API Key ID",
    "ONDOPERPS_A_API_SECRET":"Ondoperps 账户 A API Secret",
    "ONDOPERPS_A_PROXY":"Ondoperps 账户 A 代理",
    "ONDOPERPS_B_API_KEY_ID":"Ondoperps 账户 B API Key ID（须为不同真实账户）",
    "ONDOPERPS_B_API_SECRET":"Ondoperps 账户 B API Secret",
    "ONDOPERPS_B_PROXY":"Ondoperps 账户 B 代理",
    "OKX_API_KEY":"OKX API Key（交易权限）", "OKX_API_SECRET":"OKX API Secret", "OKX_API_PASSPHRASE":"OKX API Passphrase", "OKX_REGION":"OKX 注册地区（global / us / eea）", "OKX_PROXY":"OKX 代理", "HYPERLIQUID_PROXY":"Hyperliquid 代理", "HYPERLIQUID_VAULT_ADDRESS":"Hyperliquid 子账户地址（主账户留空）",
    "BINANCE_API_KEY": "Binance USD-M API Key", "BINANCE_API_SECRET": "Binance USD-M API Secret",
    "BINANCE_PROXY": "Binance 代理", "MAX_OPEN_BASIS_BPS": "开仓最大基差（bps）",
    "MIN_NET_FUNDING_BPS_H": "最低资金费差（bps / 小时）", "MAX_TASK_NOTIONAL": "单任务名义额上限（USD）", "MARGIN_BUFFER": "保证金缓冲倍数",
    "DRY_RUN": "演练模式（不发送真实订单）", "ARCUS_ADDRESS": "Arcus 主钱包公开地址",
    "ARCUS_ACCOUNT_INDEX": "Arcus 子账户编号", "ARCUS_API_PRIVATE_KEY": "Arcus API 私钥",
    "ARCUS_API_KEY": "Arcus API 公钥", "LIGHTER_ACCOUNT_INDEX": "Lighter 账户编号",
    "LIGHTER_API_KEY_INDEX": "Lighter API Key 编号", "LIGHTER_API_PRIVATE_KEY": "Lighter API 私钥",
    "HYPERLIQUID_ACCOUNT_ADDRESS": "Entropy 主钱包公开地址",
    "HYPERLIQUID_PRIVATE_KEY": "Entropy API 钱包私钥", "ARCUS_MAKER": "默认 Arcus 限价挂单",
    "FUNDING_REFRESH_SECONDS": "资金费率刷新间隔（秒）",
    "FUNDING_STALE_MAX_SECONDS": "费率最大过期时间（秒）",
    "FUNDING_TIMEOUT_SECONDS": "费率请求超时（秒）", "ENGINE_CYCLE_SECONDS": "引擎循环间隔（秒）",
    "MAKER_WAIT_SECONDS": "挂单最长等待（秒）", "REOPEN_COOLDOWN_SECONDS": "平仓后冷却（秒）",
    "LIQUIDATION_WARN_DISTANCE_PCT": "强平预警距离（%）", "MIN_CORRIDOR_PCT": "开仓走廊门槛（%）",
    "CLOSE_CORRIDOR_PCT": "平仓走廊线（%）", "ORDER_SLIPPAGE_BPS": "下单滑点（bps）",
    "ARCUS_PROXY": "Arcus 代理", "LIGHTER_PROXY": "Lighter 代理",
    "ENTROPY_PROXY": "Entropy 代理", "GLOBAL_PROXY": "共用代理",
}
GET_ENDPOINTS = {"status", "funding", "tasks", "spreads", "capacity", "stats", "cycles"}
POST_ENDPOINTS = {"tasks", "preflight", "cycle"}
MAX_BODY_BYTES = 128 * 1024


def is_secret(key: str) -> bool:
    return "PRIVATE_KEY" in key or key.endswith("_PROXY") or key.startswith("ONDOPERPS") and key.endswith(("_API_KEY_ID","_API_SECRET")) or key in {"BINANCE_API_KEY", "BINANCE_API_SECRET", "OKX_API_KEY", "OKX_API_SECRET", "OKX_API_PASSPHRASE"}


def pid_alive(pid: int) -> bool:
    """Windows os.kill(pid, 0) terminates processes; use a read-only query there."""
    if os.name == "nt":
        import ctypes
        from ctypes import wintypes
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        kernel.OpenProcess.restype = wintypes.HANDLE
        kernel.GetExitCodeProcess.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
        kernel.GetExitCodeProcess.restype = wintypes.BOOL
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        handle = kernel.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
        if not handle:
            if ctypes.get_last_error() == 87:  # ERROR_INVALID_PARAMETER: PID absent
                return False
            raise OSError("Cannot query engine process")
        try:
            code = wintypes.DWORD()
            if not kernel.GetExitCodeProcess(handle, ctypes.byref(code)):
                raise OSError("Cannot query engine exit status")
            return code.value == 259  # STILL_ACTIVE
        finally:
            kernel.CloseHandle(handle)
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False


def schema(engine: str) -> dict[str, str]:
    """Use the imported engine's example as the single source of defaults."""
    if engine in PAIRS: return pair_defaults(engine)
    values = dotenv_values(HERE / "binance_lighter" / "env.example" if engine == "binance" else HERE / "engines" / engine / "env.example", interpolate=False)
    return {key: str(value or "") for key, value in values.items() if key not in BLOCKED_KEYS}


def private_write(path: Path, text: str) -> None:
    """Atomic, owner-readable files; never leave partially written credentials."""
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_name(f".{path.name}.{secrets.token_hex(8)}.tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        with contextlib.suppress(OSError):
            path.chmod(0o600)
    finally:
        with contextlib.suppress(FileNotFoundError):
            temporary.unlink()


def dotenv_encode(values: dict[str, str]) -> str:
    # python-dotenv supports these escapes in double-quoted values, including PEM.
    def quote(value: str) -> str:
        return '"' + value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n").replace("\r", "\\r") + '"'
    return "# Managed by WeLinkBTC 套利对冲 Ops; credentials are private.\n" + "".join(
        f"{key}={quote(value)}\n" for key, value in values.items()
    )


def validate_value(key: str, value: str, approved_proxies: set[str]) -> str:
    value = value.strip()
    if len(value) > 8192 or "\x00" in value:
        raise HTTPException(400, f"{key} 配置长度或字符无效")
    if not value:
        return ""
    if key == "OKX_REGION" and value not in {"global","us","eea"}:
        raise HTTPException(400,"OKX_REGION 仅支持 global / us / eea")
    if key in BOOLEAN_KEYS:
        if value.lower() not in {"true", "false"}:
            raise HTTPException(400, f"{key} 只能为 true 或 false")
        return value.lower()
    limits = INTEGER_LIMITS.get(key) or NUMBER_LIMITS.get(key)
    if limits:
        try:
            number = float(value)
        except ValueError:
            raise HTTPException(400, f"{key} 必须为有效数字") from None
        if not math.isfinite(number) or not limits[0] <= number <= limits[1]:
            raise HTTPException(400, f"{key} 超出允许范围 {limits[0]}–{limits[1]}")
        if key in INTEGER_LIMITS and not number.is_integer():
            raise HTTPException(400, f"{key} 必须为整数")
        return str(int(number)) if key in INTEGER_LIMITS else str(number)
    if key.endswith("_PROXY"):
        if value not in approved_proxies:
            raise HTTPException(400, "代理地址必须由服务管理员加入 HEDGE_OPS_ALLOWED_PROXIES")
        return value
    if key in {"BINANCE_API_KEY", "BINANCE_API_SECRET"}:
        if not re.fullmatch(r"[A-Za-z0-9]{32,256}", value):
            raise HTTPException(400, "Binance Key/Secret 必须使用 HMAC API 凭据，不能填写 RSA/Ed25519 PEM")
    elif key.startswith("ONDOPERPS") and key.endswith("_API_KEY_ID"):
        if not re.fullmatch(r"ondoKeyId_[^\s\x00-\x1f\x7f]+", value):
            raise HTTPException(400, f"{key} 必须为包含 ondoKeyId_ 前缀的官方 API Key ID，不能填写钱包私钥")
    elif key.startswith("ONDOPERPS") and key.endswith("_API_SECRET"):
        if not re.fullmatch(r"ondoApiSecret_[^\s\x00-\x1f\x7f]+", value):
            raise HTTPException(400, f"{key} 必须为包含 ondoApiSecret_ 前缀的官方 API Secret，不是十六进制钱包私钥")
    elif key in {"ARCUS_ADDRESS", "HYPERLIQUID_ACCOUNT_ADDRESS", "HYPERLIQUID_VAULT_ADDRESS"}:
        if not re.fullmatch(r"0x[0-9a-fA-F]{40}", value):
            raise HTTPException(400, f"{key} 必须为 0x 开头的 40 位公开地址")
    elif key == "ARCUS_API_KEY":
        if not re.fullmatch(r"(?:0x)?[0-9a-fA-F]{64}", value):
            raise HTTPException(400, "Arcus API 公钥必须为 64 位十六进制")
    elif key == "ARCUS_API_PRIVATE_KEY":
        hex_key = re.fullmatch(r"(?:0x)?(?:[0-9a-fA-F]{2}){32,128}", value)
        pem_key = value.startswith("-----BEGIN PRIVATE KEY-----\n") and value.endswith("-----END PRIVATE KEY-----")
        der_key = False
        try:
            decoded = base64.b64decode(value, validate=True)
            der_key = len(decoded) == 48 and decoded.startswith(bytes.fromhex("302e020100300506032b657004220420"))
        except (ValueError, TypeError):
            pass
        if not hex_key and not pem_key and not der_key:
            raise HTTPException(400, "Arcus API 私钥必须为十六进制或 PKCS#8 PEM/DER，不能是文件路径")
    elif key == "LIGHTER_API_PRIVATE_KEY":
        # Lighter's ECgFp5 scalar is 40 bytes, unlike an EVM wallet key.
        if not re.fullmatch(r"(?:0[xX])?[0-9a-fA-F]{80}", value):
            raise HTTPException(400, "LIGHTER_API_PRIVATE_KEY 必须为 80 位十六进制 API 私钥（可带 0x 前缀）；请使用当前交易实例 Lighter API Keys 页的 Private Key")
        value = value.lower()
    elif key == "HYPERLIQUID_PRIVATE_KEY":
        if not re.fullmatch(r"(?:0x)?[0-9a-fA-F]{64}", value):
            raise HTTPException(400, f"{key} 必须为 64 位十六进制 API 私钥")
    if ("\n" in value and key != "ARCUS_API_PRIVATE_KEY") or "\r" in value:
        raise HTTPException(400, f"{key} 不允许换行")
    return value


@dataclass
class EngineProcess:
    pid: int
    port: int
    token: str
    dry_run: bool
    process: subprocess.Popen | None = None


class RuntimeManager:
    def __init__(self, data_dir: Path, *, approved_proxies: set[str] | None = None):
        self.root = data_dir.resolve()
        self.approved_proxies = approved_proxies or set()
        self.processes: dict[tuple[str, str], EngineProcess] = {}
        self.locks: dict[tuple[str, str], asyncio.Lock] = {}
        self.client = httpx.AsyncClient(trust_env=False, follow_redirects=False, timeout=45)

    def directory(self, owner: str, engine: str) -> Path:
        if not OWNER_RE.fullmatch(owner) or engine not in ENGINES:
            raise HTTPException(404, "不存在的运行环境")
        expected = self.root / owner / engine
        directory = expected.resolve()
        if directory != expected or not directory.is_relative_to(self.root):
            raise HTTPException(400, "运行环境目录无效")
        # Refuse linked leaf files as well as linked directories.
        for name in (".env", "runtime.json", "hedge.db", "engine.log"):
            file = directory / name
            if file.is_symlink() or (file.exists() and not file.resolve().is_relative_to(directory)):
                raise HTTPException(400, "运行环境文件路径无效")
        return directory

    def lock(self, owner: str, engine: str) -> asyncio.Lock:
        self.directory(owner, engine)
        return self.locks.setdefault((owner, engine), asyncio.Lock())

    def read_config(self, owner: str, engine: str) -> dict[str, str]:
        directory = self.directory(owner, engine)
        defaults = schema(engine)
        path = directory / ".env"
        if path.exists():
            raw = dotenv_values(path, interpolate=False)
            for key in defaults:
                if key in raw:
                    defaults[key] = str(raw[key] or "")
        # Missing/blank never implicitly enables real orders.
        defaults["DRY_RUN"] = defaults.get("DRY_RUN") or "true"
        return defaults

    def configured(self, values: dict[str, str], engine: str) -> bool:
        if engine in PAIRS: return all(values.get(k) for v in PAIRS[engine] for k in KEYS[v])
        if engine == "binance":
            return all(bool(values.get(key)) for key in ("BINANCE_API_KEY", "BINANCE_API_SECRET", "LIGHTER_ACCOUNT_INDEX", "LIGHTER_API_KEY_INDEX", "LIGHTER_API_PRIVATE_KEY"))
        required = ["ARCUS_ADDRESS", "ARCUS_API_PRIVATE_KEY"]
        required += (["LIGHTER_ACCOUNT_INDEX", "LIGHTER_API_KEY_INDEX", "LIGHTER_API_PRIVATE_KEY"]
                     if engine == "lighter" else ["HYPERLIQUID_ACCOUNT_ADDRESS", "HYPERLIQUID_PRIVATE_KEY"])
        return all(bool(values.get(key)) for key in required)

    def record(self, owner: str, engine: str) -> EngineProcess | None:
        pair = (owner, engine)
        path = self.directory(owner, engine) / "runtime.json"
        if path.exists():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                if (type(data["pid"]) is not int or data["pid"] < 1 or
                    type(data["port"]) is not int or not 1024 <= data["port"] <= 65535 or
                    not re.fullmatch(r"[0-9a-f]{64}", data["token"]) or type(data["dryRun"]) is not bool):
                    raise ValueError("invalid process record")
                cached = self.processes.get(pair)
                # Another console/maintenance session may have replaced a dead
                # child. Never delete its new runtime record via a stale Popen.
                if not cached or (cached.pid, cached.port, cached.token, cached.dry_run) != (data["pid"], data["port"], data["token"], data["dryRun"]):
                    self.processes[pair] = EngineProcess(data["pid"], data["port"], data["token"], data["dryRun"])
            except (KeyError, ValueError, TypeError):
                raise HTTPException(503, "引擎运行记录无效，请管理员检查运行目录") from None
        record = self.processes.get(pair)
        return record

    def forget(self, owner: str, engine: str, *, expected: EngineProcess | None = None) -> bool:
        path = self.directory(owner, engine) / "runtime.json"
        if expected:
            current = self.record(owner, engine)
            if current and (current.pid, current.port, current.token) != (expected.pid, expected.port, expected.token):
                return False
            if path.exists():
                data = json.loads(path.read_text(encoding="utf-8"))
                if (data.get('pid'), data.get('port'), data.get('token')) != (expected.pid, expected.port, expected.token):
                    return False
        self.processes.pop((owner, engine), None)
        path.unlink(missing_ok=True)
        return True

    async def listener_closed(self, record: EngineProcess) -> bool:
        """A dead Windows venv wrapper alone does not prove its child is gone."""
        def probe():
            import errno
            # Windows can take ~2 s to return WSAECONNREFUSED. A shorter
            # asyncio deadline would misclassify a closed port as unknown.
            with socket.socket() as listener:
                listener.settimeout(3)
                try:
                    code = listener.connect_ex(('127.0.0.1', record.port))
                except OSError:
                    return False
                return code in {errno.ECONNREFUSED, 10061}
        return await asyncio.to_thread(probe)

    async def request_engine(self, record: EngineProcess, method: str, path: str,
                             *, content: bytes | None = None, query: str = "", timeout: float = 45) -> httpx.Response:
        try:
            return await self.client.request(method, f"http://127.0.0.1:{record.port}/api/{path}",
                params=httpx.QueryParams(query), content=content,
                headers={"Authorization": f"Bearer {record.token}", "Content-Type": "application/json"},
                timeout=timeout)
        except httpx.HTTPError:
            message = ("引擎尚未就绪或连接中断，请查看运行服务日志" if method == "GET" else
                       "操作响应未确认，执行结果未知；请先核对任务、仓位和日志，不要直接重试")
            raise HTTPException(503, message) from None

    async def status(self, owner: str, engine: str, *, probe_timeout: float = 2) -> dict[str, Any]:
        config = self.read_config(owner, engine)
        record = self.record(owner, engine)
        running = False
        stale_cleared = False
        message = "引擎已停止；启动后开始行情扫描与任务循环"
        if record:
            try:
                response = await self.request_engine(record, "GET", "status", timeout=probe_timeout)
                running = response.status_code == 200
            except HTTPException:
                pass
            if not running:
                try:
                    alive = record.process.poll() is None if record.process else pid_alive(record.pid)
                except OSError:
                    alive = True  # Unknown identity must never allow a duplicate.
                if not alive and await self.listener_closed(record):
                    # Authenticate first, then check PID AND listener. This also
                    # handles records restored after a computer/console restart.
                    stale_cleared = self.forget(owner, engine, expected=record)
                    if stale_cleared:
                        record = None
            message = "引擎运行中" if running else "引擎进程尚未就绪；请稍后重试或检查服务日志"
        if not record:
            message = "上次引擎进程已退出，运行记录已恢复；点击「启动」进入工作台" if stale_cleared else "引擎未启动；点击「启动」进入工作台"
        emergency = self.emergency_state(owner, engine)
        if emergency and emergency.get('phase') != 'stopped':
            self.ensure_emergency_job(owner, engine)
        return {"available": True, "running": running, "processPresent": bool(record), "engine": engine, "pair": ENGINES[engine], "emergency": emergency,
                "status": "RUNNING" if running else "CONNECTING" if record else "STOPPED", "staleRecordCleared": stale_cleared,
                "dryRun": record.dry_run if record else config["DRY_RUN"] != "false",
                "configured": self.configured(config, engine), "message": message}

    async def account_view(self, owner: str, engine: str) -> dict[str, Any]:
        if engine not in {"entropy", "lighter"}:
            return {}
        from account_views import EntropyAccountView, LighterAccountView
        if not hasattr(self, "_account_views"):
            self._account_views = {}
            self._account_view_locks = {}
        directory = self.directory(owner, engine)
        revision = (directory / ".env").stat().st_mtime_ns if (directory / ".env").exists() else 0
        key = (owner, engine)
        async with self._account_view_locks.setdefault(key, asyncio.Lock()):
            previous = self._account_views.get(key)
            if not previous or previous[0] != revision:
                if previous:
                    await previous[1].aclose()
                view_type = EntropyAccountView if engine == "entropy" else LighterAccountView
                previous = (revision, view_type(directory))
                self._account_views[key] = previous
        return await previous[1].snapshot()

    async def close_account_views(self):
        await asyncio.gather(*(entry[1].aclose() for entry in getattr(self, "_account_views", {}).values()))

    async def config_response(self, owner: str, engine: str) -> dict[str, Any]:
        values = self.read_config(owner, engine)
        runtime = await self.status(owner, engine)
        return {"engine": engine, "values": {k: "" if is_secret(k) else v for k, v in values.items()},
                "fields": [{"key": key, "label": ("Entropy（io HIP-3）资金账户公开地址（非 agent）" if key=='HYPERLIQUID_ACCOUNT_ADDRESS' and engine=='ondoperps_entropy' else "Entropy（io HIP-3）已授权专用 API agent 私钥" if key=='HYPERLIQUID_PRIVATE_KEY' and engine=='ondoperps_entropy' else "Hyperliquid 资金账户公开地址（非 agent）" if key=='HYPERLIQUID_ACCOUNT_ADDRESS' and engine in PAIRS else "Hyperliquid 已授权专用 API agent 私钥" if key=='HYPERLIQUID_PRIVATE_KEY' and engine in PAIRS else LABELS.get(key, key)), "secret": is_secret(key),
                            "type": "boolean" if key in BOOLEAN_KEYS else "number" if key in INTEGER_LIMITS or key in NUMBER_LIMITS else "text",
                            "configured": bool(value)} for key, value in values.items()],
                "running": runtime["running"], "dryRun": runtime["dryRun"]}

    async def update_config(self, owner: str, engine: str, payload: dict[str, Any], *, live_authorized: bool = False) -> dict[str, Any]:
        if set(payload) - {"values", "clear", "liveAcknowledged"}:
            raise HTTPException(400, "不支持的配置参数")
        supplied, clear = payload.get("values", {}), payload.get("clear", [])
        if not isinstance(supplied, dict) or not isinstance(clear, list) or not all(isinstance(k, str) for k in clear):
            raise HTTPException(400, "配置格式无效")
        values = self.read_config(owner, engine)
        if set(supplied) - values.keys() or set(clear) - values.keys():
            raise HTTPException(400, "配置包含不支持或受保护的字段")
        if self.record(owner, engine):
            raise HTTPException(409, "请先停用任务、确认空仓并停止引擎，再修改配置")
        for key, value in supplied.items():
            if not isinstance(value, str):
                raise HTTPException(400, "配置值必须为字符串")
            if not value.strip():
                continue  # Blank inputs preserve stored values; clear is explicit.
            values[key] = validate_value(key, value, self.approved_proxies)
        for key in clear:
            values[key] = schema(engine)[key] if not is_secret(key) else ""
        if values["DRY_RUN"] == "false":
            if not live_authorized:
                raise HTTPException(403, "实盘操作需要平台管理员与二次验证授权")
            if payload.get("liveAcknowledged") is not True:
                raise HTTPException(400, "切换实盘模式需要明确确认")
            if not self.configured(values, engine):
                raise HTTPException(400, "请先完整配置两所账户与 API 交易密钥")
        if engine == "ondoperps_ondoperps" and values.get("ONDOPERPS_A_API_KEY_ID") and values.get("ONDOPERPS_A_API_KEY_ID") == values.get("ONDOPERPS_B_API_KEY_ID"):
            raise HTTPException(400,"双账户对冲须配置两个不同的真实账户；不能重复使用同一 API Key")
        if "MIN_CORRIDOR_PCT" in values and float(values["CLOSE_CORRIDOR_PCT"]) > float(values["MIN_CORRIDOR_PCT"]):
            raise HTTPException(400, "平仓走廊线不能高于开仓门槛")
        private_write(self.directory(owner, engine) / ".env", dotenv_encode(values))
        return await self.config_response(owner, engine)

    def child_environment(self, token: str) -> dict[str, str]:
        # Do not copy wallet keys, service tokens, HTTP proxies, or unrelated .env settings.
        # Python platform.machine() and the native Lighter signer need these
        # Windows architecture descriptors even in an isolated environment.
        allowed = {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "TMPDIR", "LANG", "LC_ALL", "PROCESSOR_ARCHITECTURE", "PROCESSOR_ARCHITEW6432"}
        clean = {key: value for key, value in os.environ.items() if key.upper() in allowed}
        clean.update({"HEDGE_OPS_INTERNAL_TOKEN": token, "PYTHONUNBUFFERED": "1", "PYTHONUTF8": "1"})
        return clean

    async def start(self, owner: str, engine: str, acknowledged: bool, *, live_authorized: bool = False) -> dict[str, Any]:
        if not hasattr(self,'resource_lock'): self.resource_lock=asyncio.Lock()
        async with self.resource_lock:
            from paired_hedge.resources import resources
            current=self.read_config(owner,engine)
            if current.get('DRY_RUN')=='false':
                own=resources(engine,current)
                for other in ENGINES:
                    if other==engine or not (engine in PAIRS or other in PAIRS):continue
                    record=self.record(owner,other)
                    if record and not record.dry_run and own & resources(other,self.read_config(owner,other)):
                        raise HTTPException(409,f'与 {ENGINES[other]} 复用资金账户或签名凭据；请使用独立子账户和 API agent，或先停用并核实停止该程序')
            return await self._start(owner,engine,acknowledged,live_authorized=live_authorized)

    async def _start(self, owner: str, engine: str, acknowledged: bool, *, live_authorized: bool = False) -> dict[str, Any]:
        emergency = self.emergency_state(owner, engine)
        if emergency and emergency.get('phase') != 'stopped':
            raise HTTPException(409, '全部停撤平尚未完成，不能重新启动')
        existing = self.record(owner, engine)
        if existing:
            status = await self.status(owner, engine)
            if status["running"]:
                return status
            # Status only releases a record after BOTH process and listener have
            # ended. An orphan child or unknown listener must remain protected.
            if status["processPresent"]:
                raise HTTPException(409, "已有引擎进程尚未就绪，不能重复启动")
        values = self.read_config(owner, engine)
        for key, value in values.items():
            validate_value(key, value, self.approved_proxies)
        dry_run = values["DRY_RUN"] != "false"
        if not dry_run and not live_authorized:
            raise HTTPException(403, "实盘操作需要平台管理员与二次验证授权")
        if not dry_run and (not acknowledged or not self.configured(values, engine)):
            raise HTTPException(400, "实盘启动需要完整 API 配置并明确确认")
        directory = self.directory(owner, engine)
        # Explicit restart after verified shutdown releases the latch. Tasks stay
        # disabled; restarting does not silently re-enable any trading task.
        database = directory / 'hedge.db'
        if emergency and database.exists():
            import sqlite3
            with contextlib.closing(sqlite3.connect(database)) as conn:
                conn.execute("DELETE FROM meta WHERE key='emergency_stop'")
                conn.commit()
            (directory / 'emergency.json').unlink(missing_ok=True)
        # Rewrite only allowlisted configuration; protected endpoint/file fields never enter the child.
        private_write(directory / ".env", dotenv_encode(values))
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        token = secrets.token_hex(32)
        command = [sys.executable, str(HERE / "run.py"), "--engine", engine, "--host", "127.0.0.1",
                   "--port", str(port), "--data-dir", str(directory)]
        log_fd = os.open(directory / "engine.log", os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        try:
            with os.fdopen(log_fd, "ab", buffering=0) as log:
                process = subprocess.Popen(command, cwd=HERE, env=self.child_environment(token),
                    stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                    start_new_session=os.name != "nt")
        except OSError:
            raise HTTPException(503, "无法启动引擎，请检查 Python 与依赖安装") from None
        record = EngineProcess(process.pid, port, token, dry_run, process)
        self.processes[(owner, engine)] = record
        private_write(directory / "runtime.json", json.dumps({"pid": process.pid, "port": port, "token": token, "dryRun": dry_run}))
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            if process.poll() is not None:
                self.forget(owner, engine)
                raise HTTPException(503, "引擎启动失败，请检查运行目录 engine.log 与 Python 依赖")
            status = await self.status(owner, engine, probe_timeout=min(1, max(0.1, deadline - time.monotonic())))
            if status["running"]:
                return status
            await asyncio.sleep(0.2)
        raise HTTPException(503, "引擎启动超时，进程仍在初始化；请稍后刷新状态")

    async def assert_safe_to_stop(self, record: EngineProcess, configured: bool, *, engine: str = "") -> None:
        response = await self.request_engine(record, "GET", "tasks")
        if response.status_code != 200:
            raise HTTPException(409, "无法确认任务状态，拒绝停止引擎")
        try:
            tasks = response.json()
            if not isinstance(tasks.get("tasks"), list):
                raise ValueError("invalid tasks")
            active = any(t.get("enabled") or t.get("opened_at") or t.get("open_quantity") for t in tasks["tasks"])
            if active or tasks.get("busy") or tasks.get("unmanaged"):
                raise HTTPException(409, "仍有启用的任务、执行中的订单或持仓，请先停用任务并等待双腿平仓")
            if record.dry_run and not configured:
                # With no account identifiers the engine cannot read or hold a real
                # account; public-market outages must not trap an empty demo process.
                return
            safety = await self.request_engine(record, "GET", "runtime-safety")
            if safety.status_code != 200 or safety.json().get("cycle_busy") is not False:
                raise HTTPException(409, "引擎本轮仍在执行或状态未知，请等待本轮完成后再停止")
            if engine in NATIVE_ENGINES and not tasks['tasks'] and safety.json().get('empty_journal') is True:
                return  # Authenticated exact zero task/order counts, even if API access is unavailable.
            response = await self.request_engine(record, "GET", "funding", query="refresh=true")
            if response.status_code != 200:
                raise ValueError("funding unavailable")
            funding = response.json()
            accounts = funding.get("accounts") or {}
            if accounts.get("open_assets") or any((row.get("position") or {}).get("status") not in (None, "flat") for row in funding.get("rows", [])):
                raise HTTPException(409, "账户仍有未平仓仓位，拒绝停止对冲保护")
            if configured and (accounts.get("errors") or not funding.get("ready")):
                raise HTTPException(409, "无法核实账户空仓状态，请等待账户连接恢复")
        except (ValueError, AttributeError, TypeError):
            raise HTTPException(409, "无法核实任务或持仓状态，拒绝停止引擎") from None

    async def stop(self, owner: str, engine: str) -> dict[str, Any]:
        record = self.record(owner, engine)
        if not record:
            return await self.status(owner, engine)
        values = self.read_config(owner, engine)
        has_account = bool(values.get("ARCUS_ADDRESS") or values.get("LIGHTER_ACCOUNT_INDEX") or values.get("HYPERLIQUID_ACCOUNT_ADDRESS") or values.get("BINANCE_API_KEY") or any(value for key,value in values.items() if key.startswith('ONDOPERPS') and key.endswith('_API_KEY_ID')))
        await self.assert_safe_to_stop(record, has_account, engine=engine)
        # Only terminate after authenticated responses and a fresh empty-position snapshot.
        try:
            if sys.platform == 'win32':
                # Python venv launches a child interpreter on Windows. Killing
                # only the wrapper leaves its trading loop running invisibly.
                result = await asyncio.to_thread(subprocess.run, ['taskkill', '/PID', str(record.pid), '/T', '/F'], capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
                if result.returncode != 0: raise OSError('process tree shutdown failed')
            elif record.process:
                record.process.terminate()
                await asyncio.to_thread(record.process.wait, 10)
            else:
                os.kill(record.pid, signal.SIGTERM)
                for _ in range(50):
                    if not pid_alive(record.pid):
                        break
                    await asyncio.sleep(0.2)
                else:
                    raise subprocess.TimeoutExpired("engine shutdown", 10)
        except (OSError, subprocess.TimeoutExpired):
            raise HTTPException(503, "引擎未确认停止，请检查服务日志；运行记录已保留") from None
        self.forget(owner, engine)
        return await self.status(owner, engine)

    def emergency_state(self, owner, engine):
        path = self.directory(owner, engine) / 'emergency.json'
        return json.loads(path.read_text(encoding='utf-8')) if path.exists() else None

    def save_emergency(self, owner, engine, **state):
        private_write(self.directory(owner, engine) / 'emergency.json', json.dumps({**state, 'updatedAt': time.time()}, ensure_ascii=False))

    def ensure_emergency_job(self, owner, engine):
        if not hasattr(self, '_emergency_jobs'): self._emergency_jobs = {}
        key = (owner, engine)
        job = self._emergency_jobs.get(key)
        if not job or job.done(): self._emergency_jobs[key] = asyncio.create_task(self.drain_emergency(owner, engine))

    async def prepare_emergency(self, owner, engine):
        if not self.record(owner, engine):
            return {'engine': engine, 'phase': 'stopped', 'message': '未运行'}
        # Durable latch before waiting on the cycle/maker lock. Also supports
        # already-running pre-upgrade engines through their existing task schema.
        self.save_emergency(owner, engine, phase='draining', message='已请求全部停撤平，禁止新开仓')
        try:
            import sqlite3
            from emergency import latch_connection
            path = self.directory(owner, engine) / 'hedge.db'
            with contextlib.closing(sqlite3.connect(path.as_uri() + '?mode=rw', uri=True, timeout=2)) as conn:
                latch_connection(conn, engine)
        except Exception:
            self.save_emergency(owner, engine, phase='draining', message='停用任务待确认；禁止新操作，后台持续重试')
        self.ensure_emergency_job(owner, engine)
        return {'engine': engine, **self.emergency_state(owner, engine)}

    async def drain_emergency(self, owner, engine):
        try:
            while True:
                try:
                    async with self.lock(owner, engine):
                        record = self.record(owner, engine)
                        if not record:
                            self.save_emergency(owner, engine, phase='stopped', message='引擎已停止')
                            return
                        import sqlite3
                        from emergency import latch_connection
                        with contextlib.closing(sqlite3.connect((self.directory(owner, engine) / 'hedge.db').as_uri() + '?mode=rw', uri=True, timeout=2)) as conn:
                            latch_connection(conn, engine)
                        response = await self.request_engine(record, 'POST', 'emergency', content=b'{"action":"drain"}', timeout=245)
                        if response.status_code == 404:
                            # Older live engines are not restarted while holding
                            # positions. Their existing cycle cancels/waits maker
                            # orders and closes disabled tasks using market orders.
                            from emergency import legacy_sweep
                            if engine not in NATIVE_ENGINES: await legacy_sweep(engine, self.directory(owner, engine))
                            response = await self.request_engine(record, 'POST', 'cycle', content=b'{}', timeout=245)
                            if engine not in NATIVE_ENGINES and await legacy_sweep(engine, self.directory(owner, engine)):
                                raise HTTPException(409, '残留挂单已撤销，等待下一轮重新核对成交与仓位')
                            from emergency import unknown_orders
                            with contextlib.closing(sqlite3.connect((self.directory(owner, engine) / 'hedge.db').as_uri() + '?mode=ro', uri=True)) as conn:
                                if unknown_orders(conn, engine): raise HTTPException(409, '未知成交仍在对账，不能确认完全停止')
                        if response.status_code >= 400: raise HTTPException(response.status_code, '引擎撤单平仓尚未确认')
                        data = response.json()
                        if data.get('phase') not in (None, 'flat'):
                            raise HTTPException(409, data.get('message', '撤单平仓中'))
                        await self.stop(owner, engine)
                        self.save_emergency(owner, engine, phase='stopped', message='已完成停用、撤单、平仓并停止引擎')
                        return
                except Exception as error:
                    message = self.redact(owner, engine, str(getattr(error, 'detail', error)).encode()).decode()[:350]
                    self.save_emergency(owner, engine, phase='draining', message=message)
                await asyncio.sleep(5)
        except asyncio.CancelledError:
            # Persistent marker resumes via status polling after gateway restart.
            raise

    def redact(self, owner: str, engine: str, content: bytes, *, config_snapshot: dict[str, str] | None = None) -> bytes:
        # Upstream error strings can contain authenticated proxy URLs.
        text = content.decode("utf-8", errors="replace")
        values = config_snapshot if config_snapshot is not None else self.read_config(owner, engine)
        # Keep JSON responses valid: sanitize structured values rather than
        # truncating serialized JSON or stripping quotation marks.
        try:
            from secret_redaction import redact_data
            return json.dumps(redact_data(json.loads(text), values), ensure_ascii=False).encode("utf-8")
        except (ValueError, TypeError):
            return redact_text(text, values, limit=1_000_000).encode("utf-8")


async def json_body(request: Request) -> dict[str, Any]:
    raw = await request.body()
    if len(raw) > MAX_BODY_BYTES:
        raise HTTPException(413, "请求内容过大")
    try:
        body = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(400, "请求必须为 JSON") from None
    if not isinstance(body, dict):
        raise HTTPException(400, "请求必须为 JSON 对象")
    return body


def create_app(*, data_dir: Path | None = None, service_token: str | None = None,
               manager: RuntimeManager | None = None) -> FastAPI:
    token = service_token if service_token is not None else os.environ.get("HEDGE_OPS_SERVICE_TOKEN", "")
    if len(token) < 32:
        raise RuntimeError("HEDGE_OPS_SERVICE_TOKEN must contain at least 32 characters")
    if manager is None:
        try:
            proxies = json.loads(os.environ.get("HEDGE_OPS_ALLOWED_PROXIES", "[]"))
            if not isinstance(proxies, list) or not all(isinstance(p, str) for p in proxies):
                raise ValueError("invalid proxies")
        except ValueError:
            raise RuntimeError("HEDGE_OPS_ALLOWED_PROXIES must be a JSON array of approved proxy URLs") from None
        manager = RuntimeManager(data_dir or Path(os.environ.get("HEDGE_OPS_DATA_DIR", str(HERE.parent / ".runtime" / "hedge-ops"))), approved_proxies=set(proxies))
    @contextlib.asynccontextmanager
    async def lifespan(_app: FastAPI):
        yield
        # Child processes keep protecting live positions during a web gateway restart.
        jobs = list(getattr(manager, '_emergency_jobs', {}).values())
        for job in jobs: job.cancel()
        if jobs: await asyncio.gather(*jobs, return_exceptions=True)
        await manager.close_account_views()
        await manager.client.aclose()

    app = FastAPI(title="WeLinkBTC Hedge Ops Runtime", docs_url=None, redoc_url=None,
                  openapi_url=None, lifespan=lifespan)
    app.state.manager = manager

    @app.middleware("http")
    async def authenticate(request: Request, call_next):
        if request.url.path != "/health":
            provided = request.headers.get("authorization", "")
            if not hmac.compare_digest(provided.encode(), f"Bearer {token}".encode()):
                return JSONResponse({"detail": "运行服务认证失败"}, status_code=401)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/health")
    async def health():
        return {"ok": True}

    @app.get("/v1/{owner}/{engine}/runtime")
    async def runtime_status(owner: str, engine: str):
        return await manager.status(owner, engine)

    @app.post("/v1/{owner}/{engine}/runtime")
    async def runtime_action(owner: str, engine: str, request: Request):
        payload = await json_body(request)
        if set(payload) - {"action", "liveAcknowledged"} or payload.get("action") not in {"start", "stop", "restart", "emergency-prepare"}:
            raise HTTPException(400, "action 只能为 start、stop 或 restart")
        if payload.get('action') == 'emergency-prepare':
            current = manager.record(owner, engine)
            if current and not current.dry_run and request.headers.get('x-hedge-live-authorized') != 'true':
                raise HTTPException(403, '实盘停撤平需要管理员与二次验证授权')
            return await manager.prepare_emergency(owner, engine)
        async with manager.lock(owner, engine):
            authorized = request.headers.get("x-hedge-live-authorized") == "true"
            current = manager.record(owner, engine)
            mode = current.dry_run if current else manager.read_config(owner, engine)["DRY_RUN"] != "false"
            if not mode and not authorized:
                raise HTTPException(403, "实盘操作需要平台管理员与二次验证授权")
            if not mode and payload["action"] in {"start", "restart"} and payload.get("liveAcknowledged") is not True:
                raise HTTPException(400, "实盘启动需要明确确认")
            if payload["action"] in {"stop", "restart"}:
                result = await manager.stop(owner, engine)
                if payload["action"] == "stop":
                    return result
            return await manager.start(owner, engine, payload.get("liveAcknowledged") is True, live_authorized=authorized)

    @app.get("/v1/{owner}/{engine}/config")
    async def get_config(owner: str, engine: str):
        return await manager.config_response(owner, engine)

    @app.put("/v1/{owner}/{engine}/config")
    async def put_config(owner: str, engine: str, request: Request):
        payload = await json_body(request)
        async with manager.lock(owner, engine):
            return await manager.update_config(owner, engine, payload,
                live_authorized=request.headers.get("x-hedge-live-authorized") == "true")

    @app.api_route("/v1/{owner}/{engine}/api/{path:path}", methods=["GET", "POST", "DELETE"])
    async def proxy(owner: str, engine: str, path: str, request: Request):
        valid = (request.method == "GET" and path in GET_ENDPOINTS or
                 request.method == "POST" and path in POST_ENDPOINTS or
                 request.method == "DELETE" and path.startswith("tasks/") and ASSET_RE.fullmatch(path[6:]))
        if not valid:
            raise HTTPException(404, "不支持的引擎接口")
        async def forward():
            record = manager.record(owner, engine)
            if not record:
                raise HTTPException(503, "引擎尚未启动，请先在运行设置中启动")
            if request.method != "GET" and not record.dry_run and request.headers.get("x-hedge-live-authorized") != "true":
                raise HTTPException(403, "实盘操作需要平台管理员与二次验证授权")
            config_snapshot = manager.read_config(owner, engine)
            raw = await request.body()
            if len(raw) > MAX_BODY_BYTES:
                raise HTTPException(413, "请求内容过大")
            response = await manager.request_engine(record, request.method, path,
                content=raw or None, query=request.url.query, timeout=240 if engine in NATIVE_ENGINES and path in {"cycle", "preflight"} else 45)
            if response.status_code in {301, 302, 303, 307, 308, 401, 403}:
                raise HTTPException(502, "引擎认证或响应异常")
            if engine in {"entropy", "lighter"} and request.method == "GET" and path == "stats" and response.status_code == 200:
                data = response.json()
                if data.get("account_source") != "independent_read_only":
                    data.update(await manager.account_view(owner, engine))
                response = httpx.Response(200, json=data)
            return Response(manager.redact(owner, engine, response.content, config_snapshot=config_snapshot), response.status_code,
                            media_type="application/json", headers={"Cache-Control": "no-store"})
        if request.method == "GET":
            # Slow exchange reads must not hold up disabling a task or checking
            # shutdown safety. The record and redaction values are snapshots.
            manager.directory(owner, engine)
            return await forward()
        async with manager.lock(owner, engine):
            emergency = manager.emergency_state(owner, engine)
            if emergency and emergency.get('phase') != 'stopped':
                raise HTTPException(409, '全部停撤平处理中，已锁定任务与交易操作')
            return await forward()

    return app


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default=os.environ.get("HEDGE_OPS_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("HEDGE_OPS_PORT", "8010")))
    parser.add_argument("--data-dir", type=Path)
    args = parser.parse_args()
    import uvicorn
    uvicorn.run(create_app(data_dir=args.data_dir), host=args.host, port=args.port, workers=1)


if __name__ == "__main__":
    main()
