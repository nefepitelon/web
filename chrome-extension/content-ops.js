(function () {
  const TRUSTED_ORIGINS = new Set([
    "https://welinkbtc-onchainmain.xyz",
    "https://www.welinkbtc-onchainmain.xyz"
  ]);
  const BROWSER_FILL_PLATFORMS = new Set(["weibo", "x", "binance", "xiaohongshu", "zhihu", "threads", "douyin", "tiktok"]);
  const extensionVersion = chrome.runtime.getManifest().version;
  if (!TRUSTED_ORIGINS.has(location.origin)) return;
  document.documentElement.dataset.welinkbtcExtension = "ready";
  document.documentElement.dataset.welinkbtcExtensionVersion = extensionVersion;
  const reply = (message) => window.postMessage({ source: "welinkbtc-extension", ...message }, location.origin);

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin || event.data?.source !== "welinkbtc-ai-ops") return;
    if (event.data.type === "PING") { reply({ type: "PONG", version: extensionVersion }); return; }
    if (event.data.type !== "PLATFORM_ACTION") return;
    if (!["open", "fill"].includes(event.data.action) || !BROWSER_FILL_PLATFORMS.has(event.data.platform)) return;
    chrome.runtime.sendMessage({
      type: "WELINKBTC_PLATFORM_ACTION",
      requestId: event.data.requestId,
      action: event.data.action,
      platform: event.data.platform,
      payload: event.data.payload
    }, (response) => {
      if (chrome.runtime.lastError) {
        reply({ type: "PLATFORM_RESULT", requestId: event.data.requestId, ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      reply({ type: "PLATFORM_RESULT", requestId: event.data.requestId, ...(response || { ok: false, error: "扩展没有返回结果。" }) });
    });
  });
})();
