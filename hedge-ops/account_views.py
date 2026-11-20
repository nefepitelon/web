"""Read-only account projection, independent of a trading cycle or market scan.

An already-running legacy engine can keep managing its positions while its UI
reads fresh public account data. This module never imports an order executor.
"""
from __future__ import annotations
import asyncio
import importlib
import importlib.util
import sys
import time
from pathlib import Path


def legacy_modules(engine):
    if engine not in {"entropy", "lighter"}:
        raise ValueError("Unknown legacy account reader")
    name = f"welink_{engine}_accounts"
    if name not in sys.modules:
        root = Path(__file__).parent / "engines" / engine / "src/parallax_hedge"
        spec = importlib.util.spec_from_file_location(name, root / "__init__.py", submodule_search_locations=[str(root)])
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        spec.loader.exec_module(module)
    return tuple(importlib.import_module(name + "." + part) for part in ("config", "exchanges", "accounts"))


def entropy_modules():
    return legacy_modules("entropy")


class EntropyAccountView:
    def __init__(self, directory: Path, *, engine="entropy"):
        self.engine = engine
        self._modules = entropy_modules if engine == "entropy" else lambda: legacy_modules(engine)
        config, exchanges, self.accounts = self._modules()
        self.settings = config.Settings.load(directory / ".env", directory)
        self.settings.funding_timeout_seconds = min(8, self.settings.funding_timeout_seconds)
        self.client = exchanges.MarketClient(self.settings)
        self.balances = {engine: None, "arcus": None}
        self.errors = {}
        self.read_at = {}
        self.attempt_at = {}
        self.last_refresh = 0.0
        self.task = None

    async def _refresh(self):
        async def read(venue, configured, function, parse):
            self.attempt_at[venue] = time.time()
            if not configured:
                self.balances[venue] = None
                self.errors[venue] = "尚未配置账户公开地址"
                return
            try:
                async with asyncio.timeout(12):
                    result = parse(await function())
                if result is None:
                    raise ValueError("账户接口未返回可核实的余额")
                self.balances[venue] = result
                self.read_at[venue] = time.time()
                self.errors.pop(venue, None)
            except Exception as exc:
                self.balances[venue] = None
                self.errors[venue] = (str(exc) or ("账户读取超时，稍后自动重试" if isinstance(exc, TimeoutError) else type(exc).__name__))[:240]
        other_configured = (self.settings.entropy_configured if self.engine == "entropy"
                            else self.settings.lighter_account_index is not None)
        other_function = (self.client.entropy_account if self.engine == "entropy"
                          else self.client.lighter_account)
        other_parse = (self.accounts.entropy_balance if self.engine == "entropy"
                       else lambda data: self.accounts.lighter_balance(data, self.settings.lighter_account_index))
        await asyncio.gather(
            read("arcus", self.settings.arcus_configured, self.client.arcus_account, self.accounts.arcus_balance),
            read(self.engine, other_configured, other_function, other_parse),
        )
        # This client is exclusively read-only. Rebuild its connections after
        # a failed round rather than reusing a cancelled/stalled pool forever.
        if self.errors:
            _, exchanges, _ = self._modules()
            previous, self.client = self.client, exchanges.MarketClient(self.settings)
            await previous.aclose()
        self.last_refresh = time.monotonic()

    async def snapshot(self):
        if not self.task or (self.task.done() and time.monotonic() - self.last_refresh >= 15):
            self.task = asyncio.create_task(self._refresh())
        if not self.read_at and not self.task.done():
            try:
                await asyncio.wait_for(asyncio.shield(self.task), 2)
            except TimeoutError:
                pass  # A slow exchange must not block the stats page.
        return {"balances": {**self.balances, "total": self.accounts.combine_balances(self.balances[self.engine], self.balances["arcus"])},
                "account_errors": dict(self.errors), "account_read_at": dict(self.read_at),
                "account_attempt_at": dict(self.attempt_at),
                "account_pending": not self.task.done(), "account_source": "independent_read_only"}

    async def aclose(self):
        if self.task and not self.task.done():
            self.task.cancel()
            await asyncio.gather(self.task, return_exceptions=True)
        await self.client.aclose()


class LighterAccountView(EntropyAccountView):
    def __init__(self, directory: Path):
        super().__init__(directory, engine="lighter")
