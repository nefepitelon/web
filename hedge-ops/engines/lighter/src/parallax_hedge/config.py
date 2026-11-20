"""配置：从 .env 读，全部可留空（没配私钥时只读面板照样能用）。"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import quote

from dotenv import dotenv_values

LIGHTER_ROBINHOOD_URL = "https://api.rh.lighter.xyz"
ARCUS_URL = "https://api.arcus.xyz"
DEFAULT_PORT = 8004


def _clean(value: str | None) -> str:
    return (value or "").strip()


def _num(value: str | None, fallback: float) -> float:
    try:
        return float(_clean(value))
    except (TypeError, ValueError):
        return fallback


def normalize_proxy(value: str | None) -> str:
    """把几种常见写法统一成 httpx 认识的代理 URL。

    规则：
      · 带协议的原样使用：http:// https:// socks5://
      · host:port:user:pass → socks5://user:pass@host:port
      · host:port           → http://host:port
    """
    s = _clean(value)
    if not s:
        return ""
    if re.match(r"^\w+://", s):
        return s
    parts = s.split(":")
    if len(parts) == 4:
        host, port, user, password = parts
        return f"socks5://{quote(user, safe='')}:{quote(password, safe='')}@{host}:{port}"
    if len(parts) == 2:
        return f"http://{s}"
    return s


@dataclass
class Settings:
    env_path: Path
    data_dir: Path

    host: str = "127.0.0.1"
    port: int = DEFAULT_PORT

    # ── Arcus ──
    arcus_api_url: str = ARCUS_URL
    arcus_address: str = ""                  # 主钱包公开地址（0x + 40 位）
    arcus_account_index: int = 0             # 子账户 0~9
    arcus_api_key: str = ""                  # Ed25519 公钥 hex；留空则由私钥推导
    arcus_api_private_key: str = ""          # Ed25519 私钥（seed hex / PKCS#8）
    arcus_api_private_key_file: str = ""     # 或者私钥文件路径

    # ── RHC Lighter ──
    lighter_base_url: str = LIGHTER_ROBINHOOD_URL
    lighter_account_index: int | None = None
    lighter_api_key_index: int | None = None
    lighter_api_private_key: str = ""

    # 独立 IP：每个所一个代理，留空则回落到 global_proxy，再空则直连。
    arcus_proxy: str = ""
    lighter_proxy: str = ""
    global_proxy: str = ""

    funding_refresh_seconds: float = 30.0
    funding_stale_max_seconds: float = 180.0
    funding_timeout_seconds: float = 30.0
    # 两条腿里更危险的那条，距强平价还剩多少百分比就算「危险」。
    # 到这个线的处置动作是【双腿同时平掉】，绝不单腿止损。
    liquidation_warn_distance_pct: float = 5.0
    # 开仓门槛：估算的强平走廊（离强平还有百分之几）低于它就不开
    min_corridor_pct: float = 3.0
    # 平仓线：持仓期间任一条腿离强平小于它，两边立刻一起平；面板的「危险」也是这条线。
    # （另外还有相对触发：剩余距离掉到开仓时的一半也会一起平。）
    close_corridor_pct: float = 1.5
    # 平仓后隔多久才允许重开 —— 防止刚平完就重开，连付两次往返成本
    reopen_cooldown_seconds: float = 60.0
    # 下单的滑点上限
    order_slippage_bps: float = 10.0
    # 挂单模式：Arcus 那条腿挂 ALO（0 手续费），成交后去 Lighter 吃单对冲
    arcus_maker: bool = False
    # 挂单最多等多久（秒）。开仓等不到就撤单下轮再挂；平仓等不到剩余部分改吃单
    maker_wait_seconds: float = 120.0
    # 演练模式：只记录意图，不提交任何订单
    dry_run: bool = True
    # 引擎多久跑一个周期
    engine_cycle_seconds: float = 20.0

    _raw: dict[str, str] = field(default_factory=dict, repr=False)

    # ── 代理解析 ────────────────────────────────────────
    def _specific_proxy(self, exchange: str) -> str:
        return self.arcus_proxy if exchange == "arcus" else self.lighter_proxy

    def proxy_for(self, exchange: str) -> str | None:
        """返回该所要用的代理 URL；None = 直连。

        空字符串和纯空白都当作「没配」，不要传给 httpx —— httpx 收到 ""
        会当成一个非法代理地址直接抛错，而不是忽略它。
        """
        chosen = normalize_proxy(self._specific_proxy(exchange)) or normalize_proxy(
            self.global_proxy
        )
        return chosen or None

    def proxy_label(self, exchange: str) -> str:
        """面板上显示用：脱敏后的代理来源说明。"""
        specific = normalize_proxy(self._specific_proxy(exchange))
        if specific:
            return f"独立代理 {_mask_proxy(specific)}"
        shared = normalize_proxy(self.global_proxy)
        if shared:
            return f"共用代理 {_mask_proxy(shared)}"
        return "直连"

    @property
    def arcus_configured(self) -> bool:
        """读账户只需要公开地址。"""
        return bool(_ADDRESS_RE.match(self.arcus_address or ""))

    @classmethod
    def load(cls, env_path: Path, data_dir: Path) -> "Settings":
        raw = {k: v for k, v in dotenv_values(env_path, interpolate=False).items() if v is not None}

        def s(key: str, fallback: str = "") -> str:
            return _clean(raw.get(key)) or fallback

        def i(key: str) -> int | None:
            try:
                return int(_clean(raw.get(key)))
            except (TypeError, ValueError):
                return None

        private_file = s("ARCUS_API_PRIVATE_KEY_FILE")
        if private_file and not Path(private_file).is_absolute():
            # 相对路径按 .env 所在目录解析，双击启动时工作目录不一定是程序目录
            private_file = str((env_path.parent / private_file).resolve())

        return cls(
            env_path=env_path,
            data_dir=data_dir,
            host=s("HOST", "127.0.0.1"),
            port=int(_num(raw.get("PORT"), DEFAULT_PORT)),
            arcus_api_url=s("ARCUS_API_URL", ARCUS_URL).rstrip("/"),
            arcus_address=s("ARCUS_ADDRESS").lower(),
            arcus_account_index=i("ARCUS_ACCOUNT_INDEX") or 0,
            arcus_api_key=s("ARCUS_API_KEY").lower().removeprefix("0x"),
            arcus_api_private_key=s("ARCUS_API_PRIVATE_KEY"),
            arcus_api_private_key_file=private_file,
            lighter_base_url=s("LIGHTER_BASE_URL", LIGHTER_ROBINHOOD_URL).rstrip("/"),
            lighter_account_index=i("LIGHTER_ACCOUNT_INDEX"),
            lighter_api_key_index=i("LIGHTER_API_KEY_INDEX"),
            lighter_api_private_key=s("LIGHTER_API_PRIVATE_KEY"),
            arcus_proxy=s("ARCUS_PROXY"),
            lighter_proxy=s("LIGHTER_PROXY"),
            global_proxy=s("GLOBAL_PROXY"),
            funding_refresh_seconds=_num(raw.get("FUNDING_REFRESH_SECONDS"), 30.0),
            funding_stale_max_seconds=_num(raw.get("FUNDING_STALE_MAX_SECONDS"), 180.0),
            funding_timeout_seconds=_num(raw.get("FUNDING_TIMEOUT_SECONDS"), 30.0),
            liquidation_warn_distance_pct=_num(
                raw.get("LIQUIDATION_WARN_DISTANCE_PCT"), 5.0
            ),
            min_corridor_pct=_num(raw.get("MIN_CORRIDOR_PCT"), 3.0),
            close_corridor_pct=_num(raw.get("CLOSE_CORRIDOR_PCT"), 1.5),
            reopen_cooldown_seconds=_num(raw.get("REOPEN_COOLDOWN_SECONDS"), 60.0),
            order_slippage_bps=_num(raw.get("ORDER_SLIPPAGE_BPS"), 10.0),
            dry_run=_clean(raw.get("DRY_RUN", "true")).lower() not in ("0", "false", "no"),
            arcus_maker=_clean(raw.get("ARCUS_MAKER", "false")).lower() in ("1", "true", "yes"),
            maker_wait_seconds=_num(raw.get("MAKER_WAIT_SECONDS"), 120.0),
            engine_cycle_seconds=_num(raw.get("ENGINE_CYCLE_SECONDS"), 20.0),
            _raw=raw,
        )


_ADDRESS_RE = re.compile(r"^0x[0-9a-f]{40}$")


def sync_env_file(env_path: Path, example_path: Path) -> list[str]:
    """把 env.example 里有、.env 里没有的键补进 .env。

    为什么需要这个：.env 只在首次运行时从 env.example 复制一次，
    之后每新增一个设置项，.env 就少一项 —— 而且完全看不出来，
    只会表现为「这个开关怎么不起作用」。2026-09-18 就是这样：
    DRY_RUN 等六个键全都不在 .env 里。

    只【追加】，绝不改写已有行 —— .env 里有私钥，不能碰。
    """
    if not env_path.exists() or not example_path.exists():
        return []
    existing = {
        line.split("=", 1)[0].strip()
        for line in env_path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.strip().startswith("#") and "=" in line
    }
    added: list[tuple[str, str]] = []
    for line in example_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        if key not in existing:
            added.append((key, value.strip()))
    if not added:
        return []
    with env_path.open("a", encoding="utf-8") as handle:
        handle.write("\n\n# ── 以下为程序自动补齐的新增设置（值为默认值）──\n")
        for key, value in added:
            handle.write(f"{key}={value}\n")
    return [key for key, _ in added]


def _mask_proxy(url: str) -> str:
    """把 user:pass@host:port 里的账密和大部分 IP 抹掉再显示。"""
    tail = url.split("@")[-1]
    host = tail.split("://")[-1]
    parts = host.split(":")
    addr = parts[0]
    octets = addr.split(".")
    if len(octets) == 4:
        addr = f"{octets[0]}.*.*.{octets[3]}"
    return addr
