import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { Gateway } from './lib/gateway.mjs';
import { authorized, InputError } from './lib/validation.mjs';

export function createServer({ token = process.env.QUANT_GATEWAY_TOKEN, gateway = new Gateway() } = {}) {
  if (!token || token.length < 32) throw new Error('QUANT_GATEWAY_TOKEN must contain at least 32 characters.');
  const respond = (res, code, body) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(JSON.stringify(body));
  };
  return http.createServer({ requestTimeout: 30000, headersTimeout: 10000 }, async (req, res) => {
    if (!authorized(req.headers.authorization, token)) return respond(res, 401, { ok: false, message: 'Unauthorized' });
    if (req.method === 'GET' && req.url === '/health') {
      let docker = false;
      try { await gateway.docker.available(); docker = true; } catch {}
      return respond(res, 200, { ok: true, service: 'welinkbtc-quant-runtime', version: '1.0.0', docker, liveEnabled: gateway.allowLive });
    }
    if (req.method !== 'POST' || req.url !== '/v1/command') return respond(res, 404, { ok: false, message: 'Not found' });
    if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) return respond(res, 415, { ok: false, message: 'Content-Type must be application/json' });
    let bytes = 0;
    const chunks = [];
    try {
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 32768) { respond(res, 413, { ok: false, message: 'Request too large' }); req.destroy(); return; }
        chunks.push(chunk);
      }
      const result = await gateway.execute(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      respond(res, 200, result);
    } catch (error) {
      if (error instanceof InputError || error instanceof SyntaxError || error instanceof RangeError) respond(res, 400, { ok: false, message: error.message });
      else { console.error(JSON.stringify({ event: 'gateway_error', type: error.name, code: error.code ?? null })); respond(res, 503, { ok: false, message: '运行网关处理失败；请管理员检查服务器日志。' }); }
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const host = process.env.QUANT_GATEWAY_HOST ?? '127.0.0.1';
  const port = Number(process.env.QUANT_GATEWAY_PORT ?? 8788);
  const server = createServer();
  server.listen(port, host, () => console.log(`Quant gateway listening on ${host}:${port}`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
}
