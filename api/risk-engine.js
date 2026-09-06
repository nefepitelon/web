const { evaluateTradeIntent, ENGINE_VERSION } = require("../workers/risk_engine");

async function readBody(request) {
  if (request.body != null) {
    if (typeof request.body === "string") return request.body ? JSON.parse(request.body) : {};
    return request.body;
  }
  let raw = "";
  for await (const chunk of request) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Risk-Engine-Mode", "legacy-paper-plan-only");
  response.end(JSON.stringify(payload));
}

module.exports = async function riskEngineHandler(request, response) {
  if (request.method === "GET") {
    sendJson(response, 200, {
      ok: true,
      service: "risk_engine",
      engineVersion: ENGINE_VERSION,
      mode: "LEGACY_PAPER_PLAN_ONLY",
      testnetEnabled: false,
      liveTradingEnabled: false,
      message: "该兼容接口只生成 PAPER 计划；Testnet 与 Live 必须使用受认证的统一执行 API。"
    });
    return;
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "GET, POST");
    sendJson(response, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const body = await readBody(request);
    const rawIntent = body.intent || body;
    const result = evaluateTradeIntent({ ...rawIntent, mode: "paper" }, { ...(body.context || {}), environmentEnabled: true, credentialConfigured: false, liveTradingEnabled: false, liveUnlocked: false }, { policy: body.policy || body.intent?.policy || {} });
    sendJson(response, result.ok ? 200 : 422, result);
  } catch (error) {
    sendJson(response, 400, {
      ok: false,
      decision: "REJECTED",
      state: "REJECTED",
      error: "invalid_request",
      message: error instanceof Error ? error.message : "无法读取交易意图"
    });
  }
};
