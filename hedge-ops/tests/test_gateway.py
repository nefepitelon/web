"""Gateway contract tests. All exchange/process traffic is mocked; no orders run."""
import importlib.util
import asyncio
import json
from pathlib import Path
import sys
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient

MODULE_PATH = Path(__file__).resolve().parents[1] / "gateway.py"
spec = importlib.util.spec_from_file_location("hedge_ops_gateway", MODULE_PATH)
gateway = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = gateway
spec.loader.exec_module(gateway)

OWNER_A, OWNER_B = "a" * 64, "b" * 64
TOKEN = "test-service-token-" + "x" * 32
BASE = f"/v1/{OWNER_A}/lighter"
AUTH = {"Authorization": f"Bearer {TOKEN}"}
LIVE_AUTH = {**AUTH, "X-Hedge-Live-Authorized": "true"}
PRIVATE_KEY = "b1" * 40
LIVE_CONFIG = {
    "ARCUS_ADDRESS": "0x" + "a" * 40, "ARCUS_API_PRIVATE_KEY": "c2" * 32,
    "LIGHTER_ACCOUNT_INDEX": "0", "LIGHTER_API_KEY_INDEX": "3",
    "LIGHTER_API_PRIVATE_KEY": PRIVATE_KEY,
}


def test_native_signer_architecture_preserved_without_inheriting_keys(tmp_path,monkeypatch):
    monkeypatch.setenv('PROCESSOR_ARCHITECTURE','AMD64')
    monkeypatch.setenv('PROCESSOR_ARCHITEW6432','AMD64')
    monkeypatch.setenv('BINANCE_API_SECRET','do-not-inherit')
    monkeypatch.setenv('HTTP_PROXY','http://unrelated-proxy:8080')
    manager=gateway.RuntimeManager(tmp_path)
    env=manager.child_environment('test-token')
    assert env['PROCESSOR_ARCHITECTURE']=='AMD64' and env['PROCESSOR_ARCHITEW6432']=='AMD64'
    assert 'BINANCE_API_SECRET' not in env and 'HTTP_PROXY' not in env


@pytest.fixture
def setup(tmp_path):
    manager = gateway.RuntimeManager(tmp_path)
    app = gateway.create_app(manager=manager, service_token=TOKEN)
    with TestClient(app) as client:
        yield client, manager, tmp_path


def mock_engine(manager, handler=None, *, live=False, process=None):
    requests = []
    def respond(request):
        requests.append(request)
        if handler:
            return handler(request)
        return httpx.Response(200, json={"ok": True})
    manager.client = httpx.AsyncClient(transport=httpx.MockTransport(respond))
    record = gateway.EngineProcess(1234, 8123, "f" * 64, not live, process)
    manager.processes[(OWNER_A, "lighter")] = record
    return record, requests


def test_health_only_discloses_readiness_and_auth_is_required(setup):
    client, _, _ = setup
    assert client.get("/health").json() == {"ok": True}
    assert client.get(BASE + "/config").status_code == 401
    assert client.get(BASE + "/runtime", headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert client.get(BASE + "/config", headers=AUTH).headers["cache-control"] == "no-store"


def test_service_refuses_missing_or_short_auth_secret(tmp_path, monkeypatch):
    monkeypatch.delenv("HEDGE_OPS_SERVICE_TOKEN", raising=False)
    with pytest.raises(RuntimeError, match="32 characters"):
        gateway.create_app(data_dir=tmp_path)
    with pytest.raises(RuntimeError, match="32 characters"):
        gateway.create_app(data_dir=tmp_path, service_token="short")


@pytest.mark.parametrize("owner,engine", [("admin", "lighter"), ("A" * 64, "lighter"), (OWNER_A, "unknown")])
def test_only_hashed_owners_and_known_engines_are_accepted(setup, owner, engine):
    client, _, root = setup
    response = client.get(f"/v1/{owner}/{engine}/config", headers=AUTH)
    assert response.status_code == 404
    assert list(root.iterdir()) == []


def test_read_only_queries_never_create_or_start_an_engine(setup, monkeypatch):
    client, _, root = setup
    monkeypatch.setattr(gateway.subprocess, "Popen", lambda *a, **k: pytest.fail("read launched an engine"))
    response = client.get(BASE + "/runtime", headers=AUTH)
    assert response.json()["running"] is False
    assert response.json()["dryRun"] is True
    config = client.get(BASE + "/config", headers=AUTH).json()
    assert config["values"]["DRY_RUN"] == "true"
    assert config["fields"]
    assert not set(config["values"]) & gateway.BLOCKED_KEYS
    for endpoint in gateway.GET_ENDPOINTS:
        assert client.get(BASE + "/api/" + endpoint, headers=AUTH).status_code == 503
    assert list(root.iterdir()) == []


def test_owner_and_engine_configs_are_isolated_and_secrets_are_write_only(setup):
    client, _, root = setup
    response = client.put(BASE + "/config", headers=AUTH,
        json={"values": {"LIGHTER_API_PRIVATE_KEY": PRIVATE_KEY, "ENGINE_CYCLE_SECONDS": "25"}})
    assert response.status_code == 200
    assert PRIVATE_KEY not in response.text
    assert response.json()["values"]["LIGHTER_API_PRIVATE_KEY"] == ""
    field = next(f for f in response.json()["fields"] if f["key"] == "LIGHTER_API_PRIVATE_KEY")
    assert field["configured"] and field["secret"]
    assert (root / OWNER_A / "lighter" / ".env").exists()
    for base in (f"/v1/{OWNER_B}/lighter", f"/v1/{OWNER_A}/entropy"):
        result = client.get(base + "/config", headers=AUTH).json()
        assert result["values"]["ENGINE_CYCLE_SECONDS"] == "20"
    assert not (root / OWNER_B).exists()


def test_blank_preserves_keys_but_explicit_clear_erases_them(setup):
    client, manager, _ = setup
    client.put(BASE + "/config", headers=AUTH, json={"values": {"LIGHTER_API_PRIVATE_KEY": PRIVATE_KEY}})
    response = client.put(BASE + "/config", headers=AUTH, json={"values": {"LIGHTER_API_PRIVATE_KEY": ""}})
    assert response.status_code == 200
    assert manager.read_config(OWNER_A, "lighter")["LIGHTER_API_PRIVATE_KEY"] == PRIVATE_KEY
    response = client.put(BASE + "/config", headers=AUTH, json={"values": {}, "clear": ["LIGHTER_API_PRIVATE_KEY"]})
    assert response.status_code == 200
    assert manager.read_config(OWNER_A, "lighter")["LIGHTER_API_PRIVATE_KEY"] == ""


@pytest.mark.parametrize("prefix", ["", "0x", "0X"])
def test_lighter_official_40_byte_private_key(setup, prefix):
    client, manager, _ = setup
    response = client.put(BASE + "/config", headers=AUTH,
        json={"values": {"LIGHTER_API_PRIVATE_KEY": prefix + "AB" * 40}})
    assert response.status_code == 200
    assert manager.read_config(OWNER_A, "lighter")["LIGHTER_API_PRIVATE_KEY"] == prefix.lower() + "ab" * 40
    assert "AB" * 40 not in response.text


@pytest.mark.parametrize("key", ["ab" * 32, "0x" + "ab" * 32, "a" * 79, "a" * 81, "g" * 80])
def test_lighter_rejects_wallet_key_and_malformed_api_keys(setup, key):
    client, _, root = setup
    response = client.put(BASE + "/config", headers=AUTH, json={"values": {"LIGHTER_API_PRIVATE_KEY": key}})
    assert response.status_code == 400
    assert "80" in response.json()["detail"]
    assert list(root.iterdir()) == []


@pytest.mark.parametrize("key,value", [
    ("ARCUS_API_PRIVATE_KEY_FILE", "C:/private/key"), ("ARCUS_API_URL", "http://169.254.169.254"),
    ("HOST", "0.0.0.0"), ("PORT", "22"), ("PYTHONPATH", "/tmp/evil"),
    ("GLOBAL_PROXY", "http://127.0.0.1:80"), ("ARCUS_ADDRESS", "not-an-address"),
    ("LIGHTER_ACCOUNT_INDEX", "0.1"), ("ENGINE_CYCLE_SECONDS", "NaN"),
    ("ENGINE_CYCLE_SECONDS", "0"), ("ARCUS_ACCOUNT_INDEX", "10"),
    ("DRY_RUN", "maybe"), ("ARCUS_API_PRIVATE_KEY", "/tmp/key"),
    ("LIGHTER_API_PRIVATE_KEY", "a\nDRY_RUN=false"),
])
def test_invalid_unsafe_or_unknown_configuration_is_rejected_without_writes(setup, key, value):
    client, _, root = setup
    response = client.put(BASE + "/config", headers=AUTH, json={"values": {key: value}})
    assert response.status_code == 400, response.text
    assert list(root.iterdir()) == []


def test_configuration_has_no_environment_interpolation(setup, monkeypatch):
    _, manager, root = setup
    monkeypatch.setenv("OUTSIDE_SECRET", "do-not-copy")
    gateway.private_write(root / OWNER_A / "lighter" / ".env", 'ARCUS_API_PRIVATE_KEY="${OUTSIDE_SECRET}"\n')
    assert manager.read_config(OWNER_A, "lighter")["ARCUS_API_PRIVATE_KEY"] == "${OUTSIDE_SECRET}"


def test_symbolic_link_cannot_cross_tenant_boundaries(setup):
    client, _, root = setup
    source = root / OWNER_B / "lighter"
    source.mkdir(parents=True)
    target = root / OWNER_A
    target.mkdir()
    try:
        (target / "lighter").symlink_to(source, target_is_directory=True)
    except OSError:
        pytest.skip("OS does not allow test symlink creation")
    response = client.get(BASE + "/config", headers=AUTH)
    assert response.status_code == 400


def test_live_config_requires_platform_authorization_explicit_ack_and_credentials(setup):
    client, _, root = setup
    payload = {"values": {**LIVE_CONFIG, "DRY_RUN": "false"}, "liveAcknowledged": True}
    assert client.put(BASE + "/config", headers=AUTH, json=payload).status_code == 403
    assert not (root / OWNER_A).exists()
    assert client.put(BASE + "/config", headers=LIVE_AUTH,
        json={"values": payload["values"]}).status_code == 400
    assert client.put(BASE + "/config", headers=LIVE_AUTH,
        json={"values": {"DRY_RUN": "false"}, "liveAcknowledged": True}).status_code == 400
    response = client.put(BASE + "/config", headers=LIVE_AUTH, json=payload)
    assert response.status_code == 200
    assert response.json()["dryRun"] is False
    assert PRIVATE_KEY not in response.text


def test_running_config_cannot_silently_restart_an_engine(setup):
    client, manager, root = setup
    mock_engine(manager)
    response = client.put(BASE + "/config", headers=AUTH, json={"values": {"ENGINE_CYCLE_SECONDS": "30"}})
    assert response.status_code == 409
    assert not (root / OWNER_A).exists()


def test_proxy_forwards_only_allowlisted_paths_with_private_internal_auth(setup):
    client, manager, _ = setup
    record, requests = mock_engine(manager)
    response = client.get(BASE + "/api/cycles?limit=32", headers={**AUTH, "Cookie": "session=private"})
    assert response.status_code == 200
    assert requests[-1].url == "http://127.0.0.1:8123/api/cycles?limit=32"
    assert requests[-1].headers["authorization"] == "Bearer " + record.token
    assert "cookie" not in requests[-1].headers
    assert TOKEN not in str(requests[-1].headers)
    assert client.post(BASE + "/api/tasks", headers=AUTH, json={"asset": "BTC"}).status_code == 200
    assert json.loads(requests[-1].content) == {"asset": "BTC"}
    assert client.delete(BASE + "/api/tasks/BTC", headers=AUTH).status_code == 200
    previous = len(requests)
    for path in ("static/app.js", "config", "runtime-safety", "tasks/BTC/extra", "http://evil", "tasks/%252e%252e"):
        assert client.delete(BASE + "/api/" + path, headers=AUTH).status_code == 404
    assert len(requests) == previous


def test_live_mutation_authorization_uses_current_process_mode(setup):
    client, manager, _ = setup
    _, requests = mock_engine(manager, live=True)
    for method, path in (("post", "tasks"), ("post", "cycle"), ("delete", "tasks/BTC")):
        assert getattr(client, method)(BASE + "/api/" + path, headers=AUTH).status_code == 403
    assert not requests
    assert client.post(BASE + "/api/cycle", headers=LIVE_AUTH).status_code == 200
    assert client.get(BASE + "/api/status", headers=AUTH).status_code == 200


def test_gateway_never_follows_upstream_redirects_or_exposes_auth_failure(setup):
    client, manager, _ = setup
    mock_engine(manager, lambda request: httpx.Response(302, headers={"Location": "http://169.254.169.254/"}))
    assert client.get(BASE + "/api/status", headers=AUTH).status_code == 502


def test_uncertain_write_response_is_not_retried_and_explains_unknown_outcome(setup):
    client, manager, _ = setup
    attempts = []
    def fail(request):
        attempts.append(request)
        raise httpx.ReadTimeout("response lost")
    mock_engine(manager, fail)
    response = client.post(BASE + "/api/cycle", headers=AUTH)
    assert response.status_code == 503
    assert "执行结果未知" in response.json()["detail"]
    assert len(attempts) == 1


@pytest.mark.asyncio
async def test_slow_read_does_not_block_disabling_a_task(tmp_path):
    manager = gateway.RuntimeManager(tmp_path)
    app = gateway.create_app(manager=manager, service_token=TOKEN)
    entered, release = asyncio.Event(), asyncio.Event()
    async def respond(request):
        if request.method == "GET":
            entered.set()
            await release.wait()
        return httpx.Response(200, json={"ok": True})
    manager.client = httpx.AsyncClient(transport=httpx.MockTransport(respond))
    manager.processes[(OWNER_A, "lighter")] = gateway.EngineProcess(1234, 8123, "f" * 64, True)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gateway") as client:
        read = asyncio.create_task(client.get(BASE + "/api/funding", headers=AUTH))
        try:
            await asyncio.wait_for(entered.wait(), 2)
            write = await asyncio.wait_for(client.post(BASE + "/api/tasks", headers=AUTH,
                json={"asset": "BTC", "enabled": False}), 2)
            assert write.status_code == 200
        finally:
            release.set()
            assert (await read).status_code == 200
            await manager.client.aclose()


class FakeProcess:
    pid = 3456
    terminated = False
    def poll(self):
        return 0 if self.terminated else None
    def terminate(self):
        self.terminated = True
    def wait(self, timeout):
        assert self.terminated
        return 0


def test_explicit_start_is_loopback_isolated_and_does_not_inherit_wallets(setup, monkeypatch):
    client, manager, root = setup
    monkeypatch.setenv("HYPERLIQUID_PRIVATE_KEY", "never-inherit")
    monkeypatch.setenv("HEDGE_OPS_SERVICE_TOKEN", TOKEN)
    monkeypatch.setenv("HTTP_PROXY", "http://proxy.invalid")
    launches = []
    def launch(command, **kwargs):
        launches.append((command, kwargs))
        return FakeProcess()
    monkeypatch.setattr(gateway.subprocess, "Popen", launch)
    manager.client = httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(200, json={})))
    response = client.post(BASE + "/runtime", headers=AUTH, json={"action": "start"})
    assert response.status_code == 200, response.text
    assert response.json()["running"] and response.json()["dryRun"]
    command, kwargs = launches[0]
    assert command[command.index("--host") + 1] == "127.0.0.1"
    assert Path(command[command.index("--data-dir") + 1]) == root / OWNER_A / "lighter"
    for key in ("HTTP_PROXY", "HYPERLIQUID_PRIVATE_KEY", "HEDGE_OPS_SERVICE_TOKEN"):
        assert key not in kwargs["env"]
    assert len(kwargs["env"]["HEDGE_OPS_INTERNAL_TOKEN"]) == 64
    assert (root / OWNER_A / "lighter" / "runtime.json").exists()
    values = manager.read_config(OWNER_A, "lighter")
    assert values["DRY_RUN"] == "true"
    assert not values["ARCUS_API_PRIVATE_KEY"]
    assert client.post(BASE + "/runtime", headers=AUTH, json={"action": "start"}).status_code == 200
    assert len(launches) == 1


def test_startup_has_a_total_deadline_and_keeps_the_unconfirmed_process(setup, monkeypatch):
    client, manager, root = setup
    process = FakeProcess()
    monkeypatch.setattr(gateway.subprocess, "Popen", lambda *a, **k: process)
    ticks = iter((0, 10, 20, 30))
    monkeypatch.setattr(gateway, "time", SimpleNamespace(monotonic=lambda: next(ticks)))
    manager.client = httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(503)))
    response = client.post(BASE + "/runtime", headers=AUTH, json={"action": "start"})
    assert response.status_code == 503
    assert "初始化" in response.json()["detail"]
    assert not process.terminated
    assert manager.record(OWNER_A, "lighter") is not None
    assert (root / OWNER_A / "lighter" / "runtime.json").exists()


def test_live_restart_requires_ack_before_stopping_any_process(setup):
    client, manager, _ = setup
    process = FakeProcess()
    _, requests = mock_engine(manager, live=True, process=process)
    response = client.post(BASE + "/runtime", headers=LIVE_AUTH, json={"action": "restart"})
    assert response.status_code == 400
    assert not requests and not process.terminated


@pytest.mark.parametrize("tasks", [
    {"tasks": [{"enabled": 1}]}, {"tasks": [{"enabled": 0, "opened_at": 123}]},
    {"tasks": [{"enabled": 0, "open_quantity": 1}]}, {"tasks": [], "busy": ["BTC"]},
    {"tasks": [], "unmanaged": [{"asset": "BTC", "status": "unhedged"}]},
])
def test_stop_and_restart_refuse_enabled_orders_or_open_tasks(setup, tasks):
    client, manager, _ = setup
    process = FakeProcess()
    mock_engine(manager, lambda request: httpx.Response(200, json=tasks), process=process)
    for action in ("stop", "restart"):
        assert client.post(BASE + "/runtime", headers=AUTH, json={"action": action}).status_code == 409
    assert process.terminated is False


@pytest.mark.parametrize("funding", [
    {"ready": True, "accounts": {"open_assets": ["BTC"]}, "rows": []},
    {"ready": True, "accounts": {}, "rows": [{"position": {"status": "unhedged"}}]},
    {"ready": True, "accounts": {"errors": {"arcus": "unavailable"}}, "rows": []},
    {"ready": False, "accounts": {}, "rows": []},
])
def test_stop_requires_a_fresh_verified_flat_account(setup, funding):
    client, manager, _ = setup
    client.put(BASE + "/config", headers=AUTH, json={"values": LIVE_CONFIG})
    process = FakeProcess()
    def respond(request):
        if request.url.path.endswith("/tasks"):
            return httpx.Response(200, json={"tasks": []})
        if request.url.path.endswith("/runtime-safety"):
            return httpx.Response(200, json={"cycle_busy": False})
        assert request.url.params["refresh"] == "true"
        return httpx.Response(200, json=funding)
    mock_engine(manager, respond, process=process)
    assert client.post(BASE + "/runtime", headers=AUTH, json={"action": "stop"}).status_code == 409
    assert process.terminated is False


def test_active_cycle_blocks_stop_even_after_tasks_are_disabled(setup):
    client, manager, _ = setup
    client.put(BASE + "/config", headers=AUTH, json={"values": LIVE_CONFIG})
    process = FakeProcess()
    def respond(request):
        if request.url.path.endswith("/tasks"):
            return httpx.Response(200, json={"tasks": [{"enabled": 0}]})
        assert request.url.path.endswith("/runtime-safety")
        return httpx.Response(200, json={"cycle_busy": True})
    mock_engine(manager, respond, process=process)
    response = client.post(BASE + "/runtime", headers=AUTH, json={"action": "stop"})
    assert response.status_code == 409
    assert "本轮" in response.json()["detail"]
    assert process.terminated is False


def test_safe_stop_retains_config_and_database(setup, monkeypatch):
    client, manager, root = setup
    client.put(BASE + "/config", headers=AUTH, json={"values": {"ENGINE_CYCLE_SECONDS": "25"}})
    database = root / OWNER_A / "lighter" / "hedge.db"
    database.write_bytes(b"persistent test database")
    process = FakeProcess()
    if gateway.sys.platform == 'win32':
        def kill_tree(command, **kwargs):
            assert command == ['taskkill', '/PID', '1234', '/T', '/F']
            process.terminate()
            return SimpleNamespace(returncode=0)
        monkeypatch.setattr(gateway.subprocess, 'run', kill_tree)
    mock_engine(manager, lambda request: httpx.Response(200, json=(
        {"tasks": []} if request.url.path.endswith("tasks") else
        {"ready": True, "accounts": {}, "rows": [{"position": {"status": "flat"}}]})), process=process)
    response = client.post(BASE + "/runtime", headers=AUTH, json={"action": "stop"})
    assert response.status_code == 200 and not response.json()["running"]
    assert process.terminated
    assert database.read_bytes() == b"persistent test database"
    assert manager.read_config(OWNER_A, "lighter")["ENGINE_CYCLE_SECONDS"] == "25.0"


def test_adopts_existing_runtime_without_duplicate_engine(setup, monkeypatch):
    client, manager, root = setup
    gateway.private_write(root / OWNER_A / "lighter" / "runtime.json",
        json.dumps({"pid": 1234, "port": 8123, "token": "f" * 64, "dryRun": True}))
    manager.client = httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(200, json={})))
    monkeypatch.setattr(gateway.subprocess, "Popen", lambda *a, **k: pytest.fail("duplicated recovered engine"))
    assert client.get(BASE + "/runtime", headers=AUTH).json()["running"]
    assert client.post(BASE + "/runtime", headers=AUTH, json={"action": "start"}).status_code == 200


def test_disconnected_process_is_not_duplicated_or_killed(setup, monkeypatch):
    client, manager, _ = setup
    mock_engine(manager, lambda request: httpx.Response(503))
    monkeypatch.setattr(gateway, "pid_alive", lambda pid: True)
    monkeypatch.setattr(gateway.subprocess, "Popen", lambda *a, **k: pytest.fail("duplicated disconnected engine"))
    assert client.post(BASE + "/runtime", headers=AUTH, json={"action": "start"}).status_code == 409


def test_upstream_error_secrets_are_redacted(setup):
    client, manager, _ = setup
    client.put(BASE + "/config", headers=AUTH, json={"values": {"LIGHTER_API_PRIVATE_KEY": PRIVATE_KEY}})
    mock_engine(manager, lambda request: httpx.Response(200, json={"error": "secret=" + PRIVATE_KEY}))
    response = client.get(BASE + "/api/cycles", headers=AUTH)
    assert PRIVATE_KEY not in response.text
    assert response.json()["error"] == "secret=[redacted]"


def test_json_shape_and_request_size_limits(setup):
    client, _, _ = setup
    assert client.put(BASE + "/config", headers=AUTH, json=[]).status_code == 400
    assert client.put(BASE + "/config", headers=AUTH, content=b"invalid").status_code == 400
    assert client.put(BASE + "/config", headers=AUTH, content=b" " * (gateway.MAX_BODY_BYTES + 1)).status_code == 413
    assert client.post(BASE + "/runtime", headers=AUTH, json={"action": "destroy"}).status_code == 400


def test_pid_alive_is_read_only_for_current_process():
    # Regression: os.kill(pid, 0) is destructive on Windows.
    assert gateway.pid_alive(gateway.os.getpid()) is True
