"""Finite Vercel executions of the integrated engines, with durable checkpoints.

No background trading loop or child process survives a request. Vercel Workflow
calls one complete cycle; each SQLite commit is encrypted into PostgreSQL. A
claim survives an interrupted invocation so live writes cannot be blindly retried.
"""
from __future__ import annotations

import asyncio
import base64
import contextlib
import gzip
import hashlib
import hmac
import json
import ipaddress
import socket
import os
import sys
import tempfile
import time
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from secret_redaction import redact_text, redact_data

import httpx
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

HERE = Path(__file__).resolve().parent


def key_bytes():
    value = os.environ.get("TRADING_CREDENTIALS_ENCRYPTION_KEY", "")
    if len(value) < 32:
        raise RuntimeError("Server encryption is unavailable")
    return value.encode()


def b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def unb64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def encrypt(value) -> str:
    iv = os.urandom(12)
    ciphertext = AESGCM(hashlib.sha256(key_bytes()).digest()).encrypt(iv, json.dumps(value, separators=(",", ":")).encode(), None)
    return ":".join(("v1", b64(iv), b64(ciphertext[-16:]), b64(ciphertext[:-16])))


def decrypt(value: str):
    version, iv, tag, ciphertext = value.split(":")
    if version != "v1":
        raise ValueError("Unknown checkpoint format")
    data = AESGCM(hashlib.sha256(key_bytes()).digest()).decrypt(unb64(iv), unb64(ciphertext) + unb64(tag), None)
    return json.loads(data)


def connection():
    import psycopg
    from psycopg.rows import dict_row
    raw = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL", "")
    parts = urlsplit(raw)
    query = [(key, value) for key, value in parse_qsl(parts.query) if key not in {"pgbouncer", "connection_limit", "pool_timeout", "schema"}]
    return psycopg.connect(urlunsplit(parts._replace(query=urlencode(query))), autocommit=True, prepare_threshold=None, row_factory=dict_row, connect_timeout=15)


class CheckpointConnection:
    def __init__(self, raw, checkpoint):
        self.raw, self.checkpoint = raw, checkpoint

    def __getattr__(self, name):
        return getattr(self.raw, name)

    def commit(self):
        self.raw.commit()
        self.checkpoint()


def safe_message(error, values):
    return redact_text(error, values, limit=1600)


async def run_engine(engine_name: str, values: dict, snapshot: dict, request_data: dict, checkpoint):
    from gateway import dotenv_encode

    # Resolve configured proxies at invocation time, including IPv6 and DNS
    # answers, to keep cloud tenant traffic away from private/internal networks.
    for key, value in values.items():
        if key.endswith("_PROXY") and value:
            parsed = urlsplit(value)
            if parsed.scheme not in {"http", "https"} or not parsed.hostname or not parsed.port:
                raise HTTPException(400, "服务器代理必须是公网 HTTP/HTTPS CONNECT 地址")
            records = await asyncio.to_thread(socket.getaddrinfo, parsed.hostname, parsed.port, type=socket.SOCK_STREAM)
            if not records or any(not ipaddress.ip_address(record[4][0]).is_global for record in records):
                raise HTTPException(400, "服务器代理不能连接私有网络")

    from paired_hedge.config import PAIRS
    if engine_name in {"binance", *PAIRS}:
        from binance_lighter.cloud import run
        return await run(values, snapshot, request_data, checkpoint, engine_name=engine_name)
    from parallax_hedge.api import create_app
    from parallax_hedge.config import Settings
    with tempfile.TemporaryDirectory(prefix="welink-hedge-") as temporary:
        directory = Path(temporary)
        (directory / ".env").write_text(dotenv_encode(values), encoding="utf-8")
        if snapshot.get("sqlite"):
            database = gzip.decompress(base64.b64decode(snapshot["sqlite"]))
            if len(database) > 64 * 1024 * 1024:
                raise ValueError("Checkpoint exceeds supported size")
            (directory / "hedge.db").write_bytes(database)
        settings = Settings.load(directory / ".env", directory)
        app = create_app(settings)  # Deliberately do not start the infinite loops.
        store, service, engine = app.state.store, app.state.service, app.state.engine
        previous = snapshot.get("runtime") or {}
        engine.last_cycle_at = previous.get("last_cycle_at")
        engine.last_decisions = previous.get("last_decisions") or []
        if previous.get("composition") is not None:
            engine._arcus_composition = frozenset(previous["composition"])
        engine._rebase_note = previous.get("rebase_note")
        service._snapshot = previous.get("funding") or service.snapshot
        views = dict(snapshot.get("views") or {})
        app.state.spreads.spreads = previous.get("spreads") or {}
        app.state.spreads.scanned_at = previous.get("spread_at")
        spread_cursor = int(previous.get("spread_cursor") or 0)

        def redact(value):
            return redact_data(value, values)

        def capture():
            # serialize() includes the committed database without WAL races.
            raw = store.conn.serialize()
            compressed = base64.b64encode(gzip.compress(raw)).decode()
            if len(compressed) > 3_000_000:
                raise RuntimeError("运行记录需归档后继续；已保留当前检查点")
            state = {"sqlite": compressed, "views": views, "runtime": {
                "last_cycle_at": engine.last_cycle_at, "last_decisions": engine.last_decisions,
                "composition": sorted(engine._arcus_composition) if engine._arcus_composition is not None else None,
                "rebase_note": engine._rebase_note, "funding": service.snapshot,
                "spreads": app.state.spreads.spreads, "spread_at": app.state.spreads.scanned_at,
                "spread_cursor": spread_cursor,
            }}
            checkpoint(state, views)

        store.conn = CheckpointConnection(store.conn, capture)
        result = {"data": {}, "status": 200}
        try:
            transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
            async with httpx.AsyncClient(transport=transport, base_url="http://engine") as client:
                action = request_data.get("action")
                if action == "network":
                    from network import check_network
                    result["data"] = await check_network(engine_name, values)
                elif action == 'release-emergency':
                    store.conn.execute("DELETE FROM meta WHERE key='emergency_stop'")
                    store.conn.commit()
                elif action == "safe-stop":
                    tasks = store.list_tasks()
                    if any(row.get("enabled") or row.get("opened_at") for row in tasks):
                        raise HTTPException(409, "请先停用轮换任务，等待引擎平仓，再停止服务")
                    snap = await service.refresh()
                    if any((row.get("position") or {}).get("status") not in (None, "flat") for row in snap.get("rows", [])):
                        raise HTTPException(409, "账户仍有持仓，请确认平仓后再停止")
                    if not settings.dry_run and (not snap.get("ready") or (snap.get("accounts") or {}).get("errors")):
                        raise HTTPException(409, "账户状态未确认，不能停止实盘保护")
                elif action == 'emergency-drain':
                    from emergency import drain
                    result['data'] = await drain(app, engine_name)
                else:
                    if action == "cycle":
                        snapshot_now = await service.refresh()
                        if snapshot_now.get("ready"):
                            await engine.run_cycle()
                        else:
                            store.log_cycle("-", "wait", "行情未就绪，本轮未下单：" + str(snapshot_now.get("error") or "网络连接失败")[:200], dry_run=settings.dry_run)
                    else:
                        path, method = request_data.get("path", ""), request_data.get("method", "GET")
                        from gateway import GET_ENDPOINTS, POST_ENDPOINTS, ASSET_RE
                        if not (method == "GET" and path in GET_ENDPOINTS or method == "POST" and path in POST_ENDPOINTS or method == "DELETE" and path.startswith("tasks/") and ASSET_RE.fullmatch(path[6:])):
                            raise HTTPException(404, "Unsupported engine endpoint")
                        # Snapshot reads need current funding, but never run a cycle.
                        if method == "GET" and path not in {"status", "cycles"}:
                            await service.refresh()
                        response = await client.request(method, "/api/" + path + request_data.get("query", ""), json=request_data.get("payload") if method != "GET" else None)
                        result = {"data": response.json(), "status": response.status_code}
                    # Background maker execution must settle before checkpoint/return.
                    # The original engine handles partial fills, cancellation and rescue.
                    pending = [job for job in engine._jobs.values() if not job.done()]
                    if pending:
                        await asyncio.gather(*pending)
                    if action == "cycle" and not settings.dry_run:
                        await app.state.reconciler.run_once()
                    if action == "cycle":
                        # Scan a bounded slice using the upstream scanner and
                        # persist its cursor across finite Vercel invocations.
                        markets = await service.client.common_markets()
                        selected = markets[spread_cursor:spread_cursor + 4]
                        original_markets = service.client.common_markets
                        async def selected_markets():
                            return selected
                        try:
                            service.client.common_markets = selected_markets
                            await app.state.spreads.scan_once()
                            spread_cursor = (spread_cursor + 4) % max(1, len(markets))
                        finally:
                            service.client.common_markets = original_markets
                    for path in ("status", "funding", "tasks", "capacity", "stats", "cycles", "spreads"):
                        response = await client.get("/api/" + path)
                        if response.is_success:
                            views[path] = redact(response.json())
                capture()
                result["data"] = redact(result["data"])
                result["views"] = views
                return result
        finally:
            await engine.aclose()
            await service.aclose()
            store.close()


def create_worker(engine_name: str):
    from paired_hedge.config import PAIRS
    # Each api/hedge_<engine>.py is a separate Vercel Function, isolating the
    # upstream packages with the same Python module name.
    sys.path.insert(0, str(HERE))
    sys.path.insert(0, str(HERE / "engines" / engine_name / "src"))
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    @app.get("/{path:path}")
    async def health():
        # Public readiness only: never expose accounts, configuration or keys.
        try:
            key_bytes()
            import importlib
            importlib.import_module("paired_hedge.api" if engine_name in PAIRS else "binance_lighter.api" if engine_name == "binance" else "parallax_hedge.api")
            with connection() as db:
                db.execute('SELECT 1 FROM hedge_ops_runtimes LIMIT 1')
            return {"ok": True, "engine": engine_name, "service": "welinkbtc-hedge-worker", "version": 1}
        except Exception:
            return JSONResponse({"ok": False, "engine": engine_name, "message": "云端引擎依赖或存储未就绪"}, 503)

    @app.post("/{path:path}")
    async def invoke(request: Request):
        raw = await request.body()
        timestamp = request.headers.get("x-hedge-timestamp", "")
        try:
            recent = abs(time.time() * 1000 - int(timestamp)) < 60_000
        except ValueError:
            recent = False
        expected = hmac.new(key_bytes(), b"hedge-worker-v1:" + timestamp.encode() + b":" + raw, hashlib.sha256).hexdigest()
        if not recent or not hmac.compare_digest(expected, request.headers.get("x-hedge-signature", "")):
            raise HTTPException(401, "Internal authentication required")
        data = json.loads(raw)
        if data.get("engine") != engine_name:
            raise HTTPException(400, "Engine mismatch")
        with connection() as db:
            row = db.execute('UPDATE hedge_ops_runtimes SET "workerStartedAt"=NOW() WHERE id=%s AND "operationId"=%s AND "workerStartedAt" IS NULL RETURNING *', (data["id"], data["operationId"])).fetchone()
            if not row:
                raise HTTPException(409, "Execution claim expired")
            values = decrypt(row["configEncrypted"])
            snapshot = decrypt(row["snapshotEncrypted"]) if row.get("snapshotEncrypted") else {}
            if row['status'] == 'DRAINING' and (data.get('action') == 'cycle' or data.get('action') == 'request' and data.get('method') != 'GET'):
                # Emergency arrived after claim but before worker began. Execute
                # exit-only work instead of the queued opening/task mutation.
                data = {**data, 'action': 'emergency-drain'}
            def checkpoint(state, views):
                from psycopg.types.json import Jsonb
                saved = db.execute('UPDATE hedge_ops_runtimes SET "snapshotEncrypted"=%s, views=%s, "heartbeatAt"=NOW(), "updatedAt"=NOW() WHERE id=%s AND "operationId"=%s',
                    (encrypt(state), Jsonb(views), row["id"], data["operationId"]))
                if saved.rowcount != 1:
                    raise RuntimeError("Execution claim changed; stopping")
            try:
                result = await run_engine(engine_name, values, snapshot, data, checkpoint)
            except HTTPException as error:
                db.execute('UPDATE hedge_ops_runtimes SET "operationId"=NULL, "operationStartedAt"=NULL, "workerStartedAt"=NULL WHERE id=%s AND "operationId"=%s', (row["id"], data["operationId"]))
                return JSONResponse({"data": {"detail": error.detail}, "status": error.status_code})
            except Exception as error:
                # Retain claim and refuse automatic retries on an unknown outcome.
                unsafe = values.get("DRY_RUN") == "false" and (data.get("action") in {"cycle", "emergency-drain"} or data.get("path") == "cycle")
                if unsafe:
                    db.execute('UPDATE hedge_ops_runtimes SET status=\'REVIEW_REQUIRED\', "lastError"=%s WHERE id=%s AND "operationId"=%s', (safe_message(error, values), row["id"], data["operationId"]))
                else:
                    db.execute('UPDATE hedge_ops_runtimes SET "operationId"=NULL, "operationStartedAt"=NULL, "workerStartedAt"=NULL, "lastError"=%s WHERE id=%s AND "operationId"=%s', (safe_message(error, values), row["id"], data["operationId"]))
                raise HTTPException(503, "Engine outcome requires review") from None
            drained = data.get('action') == 'emergency-drain' and result.get('data', {}).get('phase') == 'flat'
            state = "STOPPED" if data.get("action") == "safe-stop" or drained else row["status"]
            message = result.get('data', {}).get('message') if data.get('action') == 'emergency-drain' and not drained else None
            if message: message = safe_message(message, values)
            # An emergency latch may arrive while this worker was in flight.
            # Never replace DRAINING with its old RUNNING snapshot on return.
            db.execute('UPDATE hedge_ops_runtimes SET status=CASE WHEN status=\'DRAINING\' AND %s<>\'STOPPED\' THEN status ELSE %s END, "operationId"=NULL, "operationStartedAt"=NULL, "workerStartedAt"=NULL, "heartbeatAt"=NOW(), "lastError"=%s, "updatedAt"=NOW() WHERE id=%s AND "operationId"=%s', (state, state, message, row["id"], data["operationId"]))
            return result
    return app
