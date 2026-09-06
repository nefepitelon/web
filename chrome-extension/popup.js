const OPS_URL = "https://welinkbtc-onchainmain.xyz/ai-ops";
const OPS_PATTERNS = [
  "https://welinkbtc-onchainmain.xyz/*",
  "https://www.welinkbtc-onchainmain.xyz/*"
];
const PLATFORM_PATTERNS = [
  "https://weibo.com/*",
  "https://*.weibo.com/*",
  "https://x.com/*",
  "https://twitter.com/*",
  "https://www.binance.com/*"
];

async function refreshStatus() {
  const [opsTabs, platformTabs] = await Promise.all([
    chrome.tabs.query({ url: OPS_PATTERNS }),
    chrome.tabs.query({ url: PLATFORM_PATTERNS })
  ]);
  const opsOpen = opsTabs.some((tab) => /\/ai-ops(?:\.html)?(?:[?#]|$)/.test(tab.url || ""));
  const platform = platformTabs[0];
  const opsState = document.querySelector("#ops-state");
  opsState.textContent = opsOpen ? "已打开" : "未打开";
  opsState.classList.toggle("offline", !opsOpen);
  const platformState = document.querySelector("#platform-state");
  platformState.textContent = platform ? "已打开" : "未打开";
  platformState.classList.toggle("offline", !platform);
}

document.querySelector("#open-ops").addEventListener("click", async () => {
  const tabs = await chrome.tabs.query({ url: ["https://welinkbtc-onchainmain.xyz/ai-ops*", "https://www.welinkbtc-onchainmain.xyz/ai-ops*"] });
  if (tabs[0]) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    if (tabs[0].windowId) await chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: OPS_URL });
  }
  window.close();
});

refreshStatus().catch(() => {
  document.querySelector("#ops-state").textContent = "检测失败";
  document.querySelector("#platform-state").textContent = "检测失败";
});
