from dataclasses import dataclass
from pathlib import Path
from dotenv import dotenv_values
from secret_redaction import redact_text

BINANCE_URL = "https://fapi.binance.com"
LIGHTER_URL = "https://mainnet.zklighter.elliot.ai"


def redact(message, values):
    return redact_text(message, values)


def sync_env_file(path, example):
    if not path.exists():
        path.write_text(example.read_text(encoding="utf-8"), encoding="utf-8")


@dataclass
class Settings:
    values: dict
    data_dir: Path
    host: str = "127.0.0.1"
    port: int = 8006

    @classmethod
    def load(cls, env_path, data_dir):
        defaults = dotenv_values(Path(__file__).with_name("env.example"), interpolate=False)
        defaults.update(dotenv_values(env_path, interpolate=False))
        return cls({k: str(v or "") for k, v in defaults.items()}, Path(data_dir))

    @property
    def dry_run(self): return self.values.get("DRY_RUN") != "false"
    def number(self, key): return float(self.values[key])
    def proxy(self, venue): return self.values.get(venue.upper() + "_PROXY") or self.values.get("GLOBAL_PROXY") or None
