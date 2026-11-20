import os
from pathlib import Path
import subprocess
import sys
import pytest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import cloud_worker

def test_cloud_encryption_and_tamper_detection(monkeypatch):
    monkeypatch.setenv("TRADING_CREDENTIALS_ENCRYPTION_KEY", "test-only-" * 6)
    encrypted = cloud_worker.encrypt({"API_PRIVATE_KEY": "private", "counter": 7})
    assert "private" not in encrypted
    assert cloud_worker.decrypt(encrypted)["counter"] == 7
    with pytest.raises(Exception): cloud_worker.decrypt(encrypted[:-5] + "12345")

@pytest.mark.parametrize("engine", ["lighter", "entropy"])
def test_cloud_original_api_snapshot_roundtrip(engine):
    script = Path(__file__).with_name("cloud_roundtrip.py")
    result = subprocess.run([sys.executable, str(script), engine], text=True, capture_output=True, timeout=45, env={**os.environ, "PYTHONUTF8": "1"})
    assert result.returncode == 0, result.stdout + result.stderr
