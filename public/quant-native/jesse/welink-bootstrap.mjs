// Original Jesse assets are imported below. This file only configures their host integration.
const metadataUrl = "/api/quant-suite/native/jesse";
const marker = "77656c696e6b2d6a657373652d73657373696f6e2d6d61726b65722d7631000000";
const config = window.__NUXT__.config;
config.public.apiBaseUrl = location.origin + metadataUrl;
config.public.appUrl = location.origin + "/quant-native/jesse/";
config.public.wsUrl = "";
config.app.baseURL = "/quant-native/jesse/";
config.app.buildAssetsDir = "/_nuxt/";

let metadata = null;
try {
  const response = await fetch(metadataUrl, {
    credentials: "same-origin",
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (response.ok) metadata = await response.json();
} catch {
  // An unavailable backend remains unavailable; no account or trading data is invented.
}

try {
  // Never reuse a previous operator's cached account details or an actual native credential.
  localStorage.removeItem("welink-jesse-main");
  if (metadata?.ok === true && metadata.configured === true && metadata.sessionAuthorized === true) {
    localStorage.setItem("welink-jesse-main", JSON.stringify({ authToken: marker }));
  }
} catch {
  // The original application will display its login form when browser storage is unavailable.
}

document.documentElement.dataset.welinkNativeWebsocket = "disabled";
await import("./_nuxt/CuBS5wk3.js");
