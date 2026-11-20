"""Start both real engine processes with empty credentials and verify isolation.

Run manually after dependency installation:
    hedge-ops/.venv/Scripts/python.exe hedge-ops/tests/smoke_runtime.py

Uses a temporary data directory and never creates a task or submits an order.
The engine may read its public market endpoints during the smoke run.
"""
from pathlib import Path
import sys
import tempfile

import httpx
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from gateway import RuntimeManager, create_app


def main():
    token = "isolated-smoke-service-token-" + "0" * 32
    owner, another_owner = "c" * 64, "d" * 64
    headers = {"Authorization": f"Bearer {token}"}
    with tempfile.TemporaryDirectory(prefix="welink-hedge-smoke-") as folder:
        manager = RuntimeManager(Path(folder))
        with TestClient(create_app(manager=manager, service_token=token)) as client:
            try:
                for engine in ("lighter", "entropy"):
                    base = f"/v1/{owner}/{engine}"
                    initial = client.get(base + "/runtime", headers=headers)
                    assert initial.status_code == 200 and not initial.json()["running"]
                    assert client.get(base + "/api/status", headers=headers).status_code == 503
                    started = client.post(base + "/runtime", headers=headers, json={"action": "start"})
                    assert started.status_code == 200, started.text
                    assert started.json()["running"] and started.json()["dryRun"]
                    status = client.get(base + "/api/status", headers=headers)
                    assert status.status_code == 200 and status.json()["effective"]["DRY_RUN"] is True
                    tasks = client.get(base + "/api/tasks", headers=headers)
                    assert tasks.status_code == 200 and tasks.json()["tasks"] == []
                    assert tasks.json()["dry_run"] is True
                    record = manager.record(owner, engine)
                    with httpx.Client(trust_env=False) as internal:
                        assert internal.get(f"http://127.0.0.1:{record.port}/api/status").status_code == 401
                        safety = internal.get(f"http://127.0.0.1:{record.port}/api/runtime-safety",
                            headers={"Authorization": f"Bearer {record.token}"})
                        assert safety.status_code == 200 and type(safety.json()["cycle_busy"]) is bool
                    other = client.get(f"/v1/{another_owner}/{engine}/runtime", headers=headers)
                    assert not other.json()["running"]
                    assert not (Path(folder) / another_owner).exists()
                    stopped = client.post(base + "/runtime", headers=headers, json={"action": "stop"})
                    assert stopped.status_code == 200 and not stopped.json()["running"], stopped.text
                    assert (Path(folder) / owner / engine / "hedge.db").exists()
                    assert not (Path(folder) / owner / engine / "runtime.json").exists()
                    print(f"PASS {engine}: explicit start, dry-run, internal auth, owner isolation, safe stop, database persistence")
            finally:
                # Only these freshly created, empty-credential smoke processes can
                # exist in this isolated manager; clean them up even on assertion.
                for record in tuple(manager.processes.values()):
                    if record.process and record.process.poll() is None:
                        record.process.terminate()
                        record.process.wait(timeout=10)


if __name__ == "__main__":
    main()
