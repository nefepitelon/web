"""Loopback-only local UI. Credentials and trading state stay on this computer."""
from __future__ import annotations
import asyncio
import contextlib
import hashlib
import json
import os
import secrets
import webbrowser
from pathlib import Path
from urllib.parse import urlsplit, quote

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, Response, RedirectResponse
from gateway import RuntimeManager, ENGINES, NATIVE_ENGINES, GET_ENDPOINTS, POST_ENDPOINTS, ASSET_RE, private_write
from network import check_network

HERE = Path(__file__).resolve().parent
RELEASE = json.loads((HERE / "release.json").read_text(encoding="utf-8"))["version"]
OWNER = hashlib.sha256(b"welinkbtc:hedge:local:v1").hexdigest()
PORT = 8011
FAST_READS = {"stats", "status", "cycles"}


def normalize_local_proxy(value):
    value = value.strip()
    if not value or value.lower() == "direct":
        return ""
    if "://" not in value:
        parts = value.split(":", 3)
        value = (f"http://{quote(parts[2], safe='')}:{quote(parts[3], safe='')}@{parts[0]}:{parts[1]}"
                 if len(parts) == 4 else "http://" + value)
    parsed = urlsplit(value)
    try:
        valid = parsed.scheme in {"http", "https", "socks5", "socks5h"} and parsed.hostname and parsed.port and parsed.path in {"", "/"} and not parsed.query and not parsed.fragment
    except ValueError:
        valid = False
    if not valid:
        raise HTTPException(400, "代理格式无效，支持 http://、socks5:// 或 host:port:user:pass")
    return value.rstrip("/")


def create_local_app(data_dir=None, *, ui_port=PORT, control_port=None):
    manager = RuntimeManager(Path(data_dir or os.environ.get("HEDGE_OPS_LOCAL_DATA_DIR") or HERE / "data"))
    csrf = secrets.token_urlsafe(32)
    data_origin = f"http://127.0.0.1:{ui_port}"
    control_origin = f"http://127.0.0.1:{control_port}" if control_port else ""
    ui_origins = {data_origin, f"http://localhost:{ui_port}"}
    if control_origin: ui_origins.add(control_origin)
    @contextlib.asynccontextmanager
    async def lifespan(_):
        yield
        jobs = list(getattr(manager, '_emergency_jobs', {}).values())
        for job in jobs: job.cancel()
        if jobs: await asyncio.gather(*jobs, return_exceptions=True)
        await manager.close_account_views()
        await manager.client.aclose()
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
    app.state.manager = manager

    @app.middleware("http")
    async def protect(request: Request, next_handler):
        # Host validation also blocks DNS rebinding to loopback.
        if request.url.hostname not in {"127.0.0.1", "localhost", "::1"}:
            return JSONResponse({"detail": "Only loopback access is allowed"}, 403)
        origin = request.headers.get("origin", "")
        if request.method == "OPTIONS" and origin in ui_origins:
            return Response(status_code=204, headers={"Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, X-Local-CSRF",
                "Access-Control-Max-Age": "600", "Access-Control-Allow-Private-Network": "true", "Vary": "Origin"})
        # Keep slow data reads off the control listener. Status, mutations and
        # static workspaces must have their own browser HTTP/1.1 connection pool.
        if control_port and request.url.port == control_port and request.method == "GET" and "/api/" in request.url.path and request.url.path.split('/api/', 1)[1] not in FAST_READS:
            return JSONResponse({"detail": "行情读取请使用数据通道"}, 400)
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            if origin not in ui_origins or not secrets.compare_digest(request.headers.get("x-local-csrf", ""), csrf):
                return JSONResponse({"detail": "请从本地控制台提交操作"}, 403,
                    headers={"Access-Control-Allow-Origin": origin, "Vary": "Origin"} if origin in ui_origins else {})
        response = await next_handler(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        if origin in ui_origins:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Vary"] = "Origin"
        if request.url.path == "/health":
            response.headers["Access-Control-Allow-Origin"] = "*"  # Public health only.
            response.headers["Access-Control-Allow-Private-Network"] = "true"
            response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        return response

    @app.get("/health")
    async def health():
        return {"ok": True, "service": "welinkbtc-hedge-local", "version": 2, "release": RELEASE, "controlPort": control_port}

    @app.get("/", response_class=HTMLResponse)
    async def index(request: Request):
        # The root document and its status requests share the control origin.
        # A platform iframe must not bootstrap through the busy data pool.
        if control_origin and request.url.port == ui_port:
            return RedirectResponse(control_origin + "/" + ("?" + request.url.query if request.url.query else ""))
        return (HERE / "local.html").read_text(encoding="utf-8").replace("__CSRF_TOKEN__", json.dumps(csrf)).replace("__CONTROL_ORIGIN__", json.dumps(control_origin))

    @app.get("/local/runtimes")
    async def runtimes():
        async def probe(name):
            try:
                async with asyncio.timeout(6):
                    return name, await manager.status(OWNER, name)
            except Exception:
                return name, None
        states = dict(await asyncio.gather(*(probe(name) for name in ENGINES)))
        return {"engines": states, "release": RELEASE}

    @app.get("/local/session")
    async def session(request: Request):
        # Never include this token in public /health or cross-site responses.
        origin = request.headers.get("origin", "")
        if (origin and origin not in ui_origins) or request.headers.get("sec-fetch-site") == "cross-site":
            raise HTTPException(403, "请从本地控制台恢复连接")
        return {"service": "welinkbtc-hedge-local", "controlOrigin": control_origin, "csrf": csrf}

    def require_engine(engine):
        if engine not in ENGINES:
            raise HTTPException(404, "未知引擎")

    @app.api_route("/local/{engine}/runtime", methods=["GET", "POST"])
    async def runtime(engine: str, request: Request):
        require_engine(engine)
        if request.method == "GET":
            return await manager.status(OWNER, engine)
        payload = await request.json()
        async with manager.lock(OWNER, engine):
            if payload.get("action") == "start":
                return await manager.start(OWNER, engine, payload.get("liveAcknowledged") is True, live_authorized=True)
            if payload.get("action") == "stop":
                return await manager.stop(OWNER, engine)
            raise HTTPException(400, "未知操作")

    @app.post('/local/emergency-stop')
    async def emergency_stop(request: Request):
        payload = await request.json()
        if payload != {'acknowledged': True}: raise HTTPException(400, '请确认所有本地程序停撤平')
        # Prepare all engines before scheduling their independent drain jobs.
        results = [await manager.prepare_emergency(OWNER, name) for name in ENGINES]
        return {'results': results}

    @app.api_route("/local/{engine}/config", methods=["GET", "PUT"])
    async def config(engine: str, request: Request):
        require_engine(engine)
        if request.method == "GET":
            return await manager.config_response(OWNER, engine)
        raw = await request.body()
        if len(raw) > 32768:
            raise HTTPException(413, "配置过大")
        payload = json.loads(raw)
        async with manager.lock(OWNER, engine):
            for key, value in payload.get("values", {}).items():
                if key.endswith("_PROXY") and isinstance(value, str) and value.strip():
                    normalized = normalize_local_proxy(value)
                    if not normalized:
                        payload.setdefault("clear", []).append(key)
                    payload["values"][key] = normalized
                    if normalized:
                        manager.approved_proxies.add(normalized)
            return await manager.update_config(OWNER, engine, payload, live_authorized=True)

    @app.post("/local/{engine}/network")
    async def network(engine: str, request: Request):
        require_engine(engine)
        values = manager.read_config(OWNER, engine)
        raw = await request.body()
        if len(raw) > 32768:
            raise HTTPException(413, "配置过大")
        try:
            payload = json.loads(raw or b"{}")
        except ValueError:
            raise HTTPException(400, "网络配置格式无效") from None
        allowed = {key for key in values if key.endswith("_PROXY")}
        if (not isinstance(payload, dict) or set(payload) - {"values", "clear"}
            or not isinstance(payload.get("values", {}), dict) or not isinstance(payload.get("clear", []), list)):
            raise HTTPException(400, "网络配置格式无效")
        for key, value in payload.get("values", {}).items():
            if key not in allowed or not isinstance(value, str) or len(value) > 8192:
                raise HTTPException(400, "网络检测仅接受 IP / 代理配置")
            if value.strip():  # Blank masked inputs preserve stored proxies.
                values[key] = normalize_local_proxy(value)
        for key in payload.get("clear", []):
            if not isinstance(key, str) or key not in allowed:
                raise HTTPException(400, "清除代理字段无效")
            values[key] = ""
        return await check_network(engine, values)

    @app.api_route("/local/{engine}/api/{path:path}", methods=["GET", "POST", "DELETE"])
    async def proxy(engine: str, path: str, request: Request):
        require_engine(engine)
        if not (request.method == "GET" and path in GET_ENDPOINTS or request.method == "POST" and path in POST_ENDPOINTS or request.method == "DELETE" and path.startswith("tasks/") and ASSET_RE.fullmatch(path[6:])):
            raise HTTPException(404, "未知接口")
        record = manager.record(OWNER, engine)
        if not record:
            raise HTTPException(503, "请在顶部启动所选引擎")
        raw = await request.body()
        if len(raw) > 16384:
            raise HTTPException(413, "请求过大")
        async def forward():
            timeout = 3 if request.method == "GET" and path in FAST_READS else 240 if engine in NATIVE_ENGINES and path in {"cycle", "preflight"} else 45
            response = await manager.request_engine(record, request.method, path, content=raw or None, query=request.url.query, timeout=timeout)
            if engine in {"entropy", "lighter"} and request.method == "GET" and path == "stats" and response.status_code == 200:
                data = response.json()
                if data.get("account_source") != "independent_read_only":
                    data.update(await manager.account_view(OWNER, engine))
                return JSONResponse(json.loads(manager.redact(OWNER, engine, json.dumps(data).encode())))
            return Response(manager.redact(OWNER, engine, response.content), response.status_code, media_type="application/json")
        if request.method == "GET":
            return await forward()
        async with manager.lock(OWNER, engine):
            emergency = manager.emergency_state(OWNER, engine)
            if emergency and emergency.get('phase') != 'stopped':
                raise HTTPException(409, '全部停撤平处理中，任务操作已锁定')
            return await forward()

    @app.get("/console/{engine}/{asset:path}")
    async def console(engine: str, asset: str):
        require_engine(engine)
        if asset not in {"", "static/app.js", "static/styles.css"}:
            raise HTTPException(404)
        web_root = HERE / "binance_lighter" / "web" if engine == "binance" else HERE / "engines" / engine / "src" / "parallax_hedge" / "web"
        if engine in NATIVE_ENGINES and engine != "binance": web_root = HERE / "paired_hedge" / "web" / engine
        source = web_root / (asset.removeprefix("static/") or "index.html")
        content = source.read_text(encoding="utf-8")
        if not asset:
            content = content.replace('href="/static/', f'href="/console/{engine}/static/').replace('src="/static/', f'src="/console/{engine}/static/')
            content = content.replace("<b>PARALLAX</b>", "<b>套利对冲Ops</b>")
            # Static pages use the fast listener; only read-only data requests
            # use the original port. This also protects stop/preflight from a
            # full data connection pool. Never replay a mutation on recovery.
            bridge = r"""<script>(()=>{const originalFetch=window.fetch.bind(window),dataOrigin=__DATA__;
let session={origin:__CONTROL__,csrf:__TOKEN__};
const pendingReads=new Set();let parentActive=true;
const inactiveError=()=>{const e=new Error('控制台已隐藏，暂停页面读取');e.name='AbortError';e.hedgeConsoleInactive=true;return e};
window.hedgeConsoleIsActive=()=>{if(document.hidden||!parentActive)return false;try{return !window.frameElement?.hidden}catch{return parentActive}};
let wasActive=window.hedgeConsoleIsActive();
const syncVisibility=()=>{const active=window.hedgeConsoleIsActive();if(!active){for(const controller of pendingReads)controller.abort(inactiveError())}else if(!wasActive)window.dispatchEvent(new Event('hedge-console-active'));wasActive=active};
document.addEventListener('visibilitychange',syncVisibility);
try{if(window.frameElement&&typeof MutationObserver!=='undefined')new MutationObserver(syncVisibility).observe(window.frameElement,{attributes:true,attributeFilter:['hidden','style','class']})}catch{}
window.addEventListener('message',event=>{if(event.source!==window.parent||event.origin!==location.origin||event.data?.type!=='hedge-console-visibility'||event.data.engine!=='__ENGINE__'||typeof event.data.active!=='boolean')return;parentActive=event.data.active;syncVisibility()});
window.fetch=(input,init={})=>{let url=String(input);if(!url.startsWith('/api/'))return originalFetch(input,init);
try{if(window.parent!==window&&typeof window.parent.hedgeLocalControl==='function')session=window.parent.hedgeLocalControl()}catch{}
const read=!init.method||init.method.toUpperCase()==='GET',headers=new Headers(init.headers);
if(read&&!window.hedgeConsoleIsActive())return Promise.reject(inactiveError());
if(read){headers.delete('Content-Type');headers.delete('X-Local-CSRF')}else headers.set('X-Local-CSRF',session.csrf);
const fastRead=read&&/^\/api\/(stats|status|cycles)(?:\?|$)/.test(url);
url=(read&&!fastRead?dataOrigin:session.origin)+'/local/__ENGINE__'+url;
const controller=read?new AbortController():null;if(controller)pendingReads.add(controller);
const signal=controller?(init.signal?AbortSignal.any([init.signal,controller.signal]):controller.signal):init.signal;
return originalFetch(url,{...init,headers,signal}).then(async r=>{if(!r.ok){if(r.status===403){try{const s=await originalFetch('/local/session').then(x=>x.json());if(s.service==='welinkbtc-hedge-local')session={origin:s.controlOrigin,csrf:s.csrf}}catch{}}
const e=await r.clone().json().catch(()=>({}));throw Error(e.detail||'请求失败')}return r}).catch(e=>{if(controller?.signal.aborted)throw controller.signal.reason;throw e}).finally(()=>{if(controller)pendingReads.delete(controller)})};})();</script></head>"""
            bridge = bridge.replace("__DATA__", json.dumps(data_origin if control_port else "")).replace("__CONTROL__", json.dumps(control_origin)).replace("__TOKEN__", json.dumps(csrf)).replace("__ENGINE__", engine)
            content = content.replace("</head>", bridge)
        return Response(content, media_type="text/html" if not asset else "application/javascript" if asset.endswith(".js") else "text/css")
    return app


def local_listener(port=PORT):
    """Reserve the port before startup, or reuse our verified existing console."""
    import socket
    from urllib.request import build_opener, ProxyHandler
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        listener.bind(("127.0.0.1", port))
    except OSError as conflict:
        listener.close()
        try:
            with build_opener(ProxyHandler({})).open(f"http://127.0.0.1:{port}/health", timeout=3) as response:
                health = json.load(response)
            if health.get("ok") is True and health.get("service") == "welinkbtc-hedge-local":
                return None
        except Exception:
            pass
        raise RuntimeError(f"本地端口 {port} 已被其他程序占用；请检查该程序。已有交易引擎未被停止。") from conflict
    listener.listen(128)
    return listener


def local_control_listener(data_dir):
    """Reuse a private saved port across manager updates; bind loopback only."""
    import socket
    directory = Path(data_dir)
    saved = directory / '.manager-control.json'
    port = 0
    try:
        value = json.loads(saved.read_text(encoding='utf-8')).get('port')
        if type(value) is int and 1024 <= value <= 65535 and value != PORT: port = value
    except (OSError, ValueError, AttributeError): pass
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        try: listener.bind(('127.0.0.1', port))
        except OSError:
            if not port: raise
            listener.bind(('127.0.0.1', 0))
        listener.listen(128)
        private_write(saved, json.dumps({'port': listener.getsockname()[1]}))
        return listener
    except BaseException:
        listener.close()
        raise


if __name__ == "__main__":
    import uvicorn
    listener = local_listener()
    if listener is None:
        print("[INFO] 本地控制台已运行，复用 http://127.0.0.1:8011/")
        if os.environ.get("HEDGE_OPS_NO_BROWSER") != "1":
            webbrowser.open("http://127.0.0.1:8011/")
        raise SystemExit(0)
    control_listener = local_control_listener(os.environ.get("HEDGE_OPS_LOCAL_DATA_DIR") or HERE / "data")
    print("WeLinkBTC 套利对冲Ops： http://127.0.0.1:8011/ ，配置保存在本机 data 目录。")
    if os.environ.get("HEDGE_OPS_NO_BROWSER") != "1":
        import threading
        threading.Timer(2, lambda: webbrowser.open("http://127.0.0.1:8011/")).start()
    try:
        app = create_local_app(control_port=control_listener.getsockname()[1])
        uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=PORT, access_log=False, use_colors=False)).run(sockets=[listener, control_listener])
    finally:
        listener.close()
        control_listener.close()
