const {
  RECENT_SIGNAL_LIMIT,
  collectPublicPreviewSignals,
  collectTelegramSignals,
  createStoreFromEnv
} = require("../workers/telegram_signal_collector");
const telegramSignalSnapshot = require("../data/telegram-signals-snapshot");

async function readBody(request) {
  if (request.body != null) {
    if (typeof request.body === "string") return request.body ? JSON.parse(request.body) : {};
    return request.body;
  }
  let raw = "";
  for await (const chunk of request) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function sendJson(response, status, payload, cacheControl = "no-store") {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", cacheControl);
  response.end(JSON.stringify(payload));
}

function toPublicSignal(signal) {
  return {
    dedupe_hash: signal.dedupe_hash,
    telegram_message_id: signal.telegram_message_id,
    channel_username: signal.channel_username,
    symbol: signal.symbol,
    pair: signal.pair,
    direction: signal.direction,
    price: signal.price,
    price_change_pct: signal.price_change_pct,
    oi_change_pct: signal.oi_change_pct,
    trigger_type: signal.trigger_type,
    signal_time: signal.signal_time,
    confidence: signal.confidence,
    parse_status: signal.parse_status,
    source_mode: signal.source_mode,
    source_message_url: signal.source_message_url,
    received_at: signal.received_at
  };
}

function header(request, name) {
  const value = request.headers?.[name] || request.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : String(value || "");
}

function isWorkerAuthorized(request) {
  const expected = process.env.TELEGRAM_WORKER_SECRET || "";
  return expected && header(request, "x-worker-secret") === expected;
}

function isWebhookAuthorized(request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  return expected && header(request, "x-telegram-bot-api-secret-token") === expected;
}

module.exports = async function telegramSignalCollectorHandler(request, response) {
  const store = createStoreFromEnv();
  const health = String(request.query?.health || "") === "1";

  if (request.method === "GET" && health) {
    sendJson(response, 200, {
      ok: true,
      worker: "telegram_signal_collector",
      target_channel: process.env.TELEGRAM_TARGET_CHANNEL || "BWE_OI_Price_monitor",
      storage: store.name,
      storage_configured: store.name !== "memory",
      webhook_secret_configured: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
      mock_secret_configured: Boolean(process.env.TELEGRAM_WORKER_SECRET)
    });
    return;
  }

  if (request.method === "GET" && String(request.query?.public || "") === "1") {
    const refreshRequested = String(request.query?.refresh || "") === "1";
    const debugRequested = String(request.query?.debug || "") === "1";
    if (!refreshRequested) {
      let cached = [];
      try {
        cached = await store.listRecent(RECENT_SIGNAL_LIMIT);
      } catch {
        cached = [];
      }
      if (cached.length) {
        sendJson(response, 200, {
          ok: true,
          worker: "telegram_signal_collector",
          target_channel: process.env.TELEGRAM_TARGET_CHANNEL || "BWE_OI_Price_monitor",
          refreshed_at: new Date().toISOString(),
          stale: true,
          fallback: "persistent_cache",
          latest: cached.map(toPublicSignal)
        }, "public, s-maxage=15, stale-while-revalidate=45");
        return;
      }
      sendJson(response, 200, {
        ok: true,
        worker: "telegram_signal_collector",
        target_channel: process.env.TELEGRAM_TARGET_CHANNEL || "BWE_OI_Price_monitor",
        refreshed_at: new Date().toISOString(),
        stale: true,
        fallback: "build_snapshot",
        latest: telegramSignalSnapshot.slice(0, RECENT_SIGNAL_LIMIT).map(toPublicSignal)
      }, "public, s-maxage=15, stale-while-revalidate=45");
      return;
    }
    try {
      const result = await collectPublicPreviewSignals({ store });
      sendJson(response, 200, {
        ok: true,
        worker: "telegram_signal_collector",
        source: result.source_url,
        source_kind: result.source_kind,
        target_channel: result.target_channel,
        refreshed_at: new Date().toISOString(),
        received: result.received,
        parsed: result.parsed,
        stale: false,
        storage: result.storage,
        storage_degraded: result.storage_degraded,
        latest: result.latest.map(toPublicSignal),
        ...(debugRequested ? { attempts: result.attempts, storage_error: result.storage_error } : {})
      }, "public, s-maxage=15, stale-while-revalidate=45");
    } catch (error) {
      let cached = [];
      try {
        cached = await store.listRecent(RECENT_SIGNAL_LIMIT);
      } catch {
        cached = [];
      }
      if (cached.length) {
        sendJson(response, 200, {
          ok: true,
          worker: "telegram_signal_collector",
          target_channel: process.env.TELEGRAM_TARGET_CHANNEL || "BWE_OI_Price_monitor",
          refreshed_at: new Date().toISOString(),
          stale: true,
          fallback: "persistent_cache",
          ...(debugRequested ? {
            refresh_error: error instanceof Error ? error.message : String(error),
            attempts: Array.isArray(error?.attempts) ? error.attempts : []
          } : {}),
          latest: cached.map(toPublicSignal)
        }, "public, s-maxage=15, stale-while-revalidate=45");
        return;
      }
      sendJson(response, 200, {
        ok: true,
        worker: "telegram_signal_collector",
        target_channel: process.env.TELEGRAM_TARGET_CHANNEL || "BWE_OI_Price_monitor",
        refreshed_at: new Date().toISOString(),
        stale: true,
        fallback: "build_snapshot",
        ...(debugRequested ? {
          refresh_error: error instanceof Error ? error.message : String(error),
          attempts: Array.isArray(error?.attempts) ? error.attempts : []
        } : {}),
        latest: telegramSignalSnapshot.slice(0, RECENT_SIGNAL_LIMIT).map(toPublicSignal)
      }, "public, s-maxage=15, stale-while-revalidate=45");
    }
    return;
  }

  if (request.method === "GET") {
    if (!isWorkerAuthorized(request)) {
      sendJson(response, 401, { error: "Missing or invalid x-worker-secret" });
      return;
    }
    sendJson(response, 200, {
      worker: "telegram_signal_collector",
      storage: store.name,
      latest: await store.listRecent(RECENT_SIGNAL_LIMIT)
    });
    return;
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "GET, POST");
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const body = await readBody(request);
    const mode = String(request.query?.mode || body.mode || "webhook").toLowerCase();
    if (!new Set(["webhook", "mock"]).has(mode)) {
      sendJson(response, 400, { error: "mode must be webhook or mock" });
      return;
    }

    if (mode === "webhook" && !isWebhookAuthorized(request)) {
      sendJson(response, process.env.TELEGRAM_WEBHOOK_SECRET ? 401 : 503, {
        error: process.env.TELEGRAM_WEBHOOK_SECRET
          ? "Invalid Telegram webhook secret"
          : "TELEGRAM_WEBHOOK_SECRET is not configured"
      });
      return;
    }

    if (mode === "mock" && !isWorkerAuthorized(request)) {
      sendJson(response, process.env.TELEGRAM_WORKER_SECRET ? 401 : 503, {
        error: process.env.TELEGRAM_WORKER_SECRET
          ? "Invalid worker secret"
          : "TELEGRAM_WORKER_SECRET is not configured"
      });
      return;
    }

    const result = await collectTelegramSignals({ mode, payload: body, store });
    sendJson(response, 200, { ok: true, worker: "telegram_signal_collector", ...result });
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      worker: "telegram_signal_collector",
      error: "Telegram signal collection failed",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
};
