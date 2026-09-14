const {
  AICOIN_SOURCE_URL,
  SYNC_INTERVAL_MS,
  authorizedCronRequest,
  createAicoinPulseStore,
  syncAicoinPulse
} = require("../workers/aicoin_pulse_collector");

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

module.exports = async function aicoinPulseCollectorHandler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    sendJson(response, 405, { ok: false, error: "Method not allowed" });
    return;
  }

  const store = createAicoinPulseStore();
  if (String(request.query?.health || "") === "1") {
    sendJson(response, 200, {
      ok: true,
      worker: "aicoin_pulse_collector",
      source: AICOIN_SOURCE_URL,
      intervalMs: SYNC_INTERVAL_MS,
      storage: store.name,
      storageConfigured: store.name !== "memory",
      cronSecretConfigured: Boolean(process.env.CRON_SECRET)
    });
    return;
  }

  if (!process.env.CRON_SECRET) {
    sendJson(response, 503, { ok: false, error: "CRON_SECRET is not configured" });
    return;
  }
  if (!authorizedCronRequest(request)) {
    sendJson(response, 401, { ok: false, error: "Missing or invalid cron authorization" });
    return;
  }

  try {
    const result = await syncAicoinPulse({ store });
    sendJson(response, 200, {
      ok: true,
      worker: "aicoin_pulse_collector",
      source: result.source,
      sourceUrl: result.sourceUrl,
      fetchedAt: result.fetchedAt,
      received: result.received,
      filteredAds: result.filteredAds,
      added: result.added,
      count: result.count,
      storage: result.storage
    });
  } catch (error) {
    sendJson(response, 502, {
      ok: false,
      worker: "aicoin_pulse_collector",
      error: "AiCoin Telegram collection failed",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
};
