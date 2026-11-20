import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "hedge-ops"))
from cloud_worker import create_worker
app = create_worker("binance_okx")
