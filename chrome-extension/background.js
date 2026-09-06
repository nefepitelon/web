importScripts("platform-plugins.js");

const TRUSTED_OPS_ORIGINS = new Set([
  "https://welinkbtc-onchainmain.xyz",
  "https://www.welinkbtc-onchainmain.xyz"
]);
const ALLOWED_ACTIONS = new Set(["open", "fill"]);
const MAX_TEXT_LENGTH = 10000;
const MAX_IMAGE_DATA_URL_LENGTH = 12 * 1024 * 1024;
const MAX_IMAGES = 3;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForTabComplete(tabId, timeoutMs = 12000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete") return tab;
    await wait(300);
  }
  throw new Error("平台页面加载超时，请检查网络后重试。");
}

async function findPlatformTab(platform) {
  const plugin = WelinkPlatformPlugins.get(platform);
  if (!plugin?.capabilities.publishing.browserFill) throw new Error("此平台当前使用复制并打开模式，不需要浏览器填充权限。");
  const tabs = await chrome.tabs.query({ url: plugin.compose.matches });
  const composePath = plugin.compose.composePath ? new RegExp(plugin.compose.composePath) : null;
  const composeTab = composePath && tabs.find((tab) => composePath.test(tab.url || ""));
  return composeTab || tabs.find((tab) => tab.active) || tabs[0] || null;
}

async function openPlatform(platform) {
  const plugin = WelinkPlatformPlugins.get(platform);
  if (!plugin?.capabilities.publishing.browserFill) throw new Error("此平台当前使用复制并打开模式，不需要浏览器填充权限。");
  const existing = await findPlatformTab(platform);
  if (existing) {
    const composePath = plugin.compose.composePath ? new RegExp(plugin.compose.composePath) : null;
    const needsComposeRoute = composePath && !composePath.test(existing.url || "");
    const updated = await chrome.tabs.update(existing.id, needsComposeRoute ? { url: plugin.compose.url, active: true } : { active: true });
    if (existing.windowId) await chrome.windows.update(existing.windowId, { focused: true });
    return updated;
  }
  return chrome.tabs.create({ url: plugin.compose.url, active: true });
}

function assertTrustedSender(sender) {
  let origin;
  try { origin = new URL(sender?.tab?.url || "").origin; }
  catch { throw new Error("无法确认请求来源，操作已拒绝。"); }
  if (!TRUSTED_OPS_ORIGINS.has(origin)) throw new Error("请求并非来自受信任的 AI 运营台，操作已拒绝。");
}

function validatePayload(payload) {
  const text = typeof payload?.text === "string" ? payload.text : "";
  const title = typeof payload?.title === "string" ? payload.title : "";
  const bodyText = typeof payload?.bodyText === "string" ? payload.bodyText : text;
  if (!text.trim()) throw new Error("草稿正文为空，未执行填充。");
  if (text.length > MAX_TEXT_LENGTH) throw new Error("草稿正文过长，未执行填充。");
  if (title.length > 300 || bodyText.length > MAX_TEXT_LENGTH) throw new Error("标题或平台正文超过安全长度，未执行填充。");

  const legacyImage = typeof payload?.imageDataUrl === "string" && payload.imageDataUrl
    ? [{ imageDataUrl: payload.imageDataUrl, fileName: payload.fileName, mimeType: payload.mimeType }]
    : [];
  const rawImages = Array.isArray(payload?.images) ? payload.images : legacyImage;
  if (rawImages.length > MAX_IMAGES) throw new Error("每次最多允许填充 3 张配图。");
  const images = rawImages.map((item, index) => {
    const imageDataUrl = typeof item?.imageDataUrl === "string" ? item.imageDataUrl : "";
    if (!imageDataUrl) throw new Error(`第 ${index + 1} 张配图数据为空，请重新出图后重试。`);
    if (imageDataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) throw new Error("配图超过 12 MB 安全上限，请压缩后重试。");
    if (!/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(imageDataUrl)) {
      throw new Error("配图格式不受支持，仅允许 PNG、JPEG 或 WebP。");
    }
    const rawFileName = typeof item?.fileName === "string" ? item.fileName : `welinkbtc-post-${index + 1}.png`;
    const fileName = rawFileName.replace(/[^a-z0-9._-]/gi, "_").slice(0, 100) || `welinkbtc-post-${index + 1}.png`;
    return { imageDataUrl, fileName, mimeType: imageDataUrl.match(/^data:([^;,]+)/i)?.[1] || "image/png" };
  });
  return { text, title, bodyText, images };
}

async function sendFill(tabId, platform, payload, requestId) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try { return await chrome.tabs.sendMessage(tabId, { type: "WELINKBTC_FILL", requestId, platform, payload }); }
    catch (error) {
      if (attempt === 3) throw new Error("平台页面尚未准备好，请等待页面加载完成后重试。", { cause: error });
      await wait(900);
    }
  }
}

async function sendReadyCheck(tabId, platform) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const result = await chrome.tabs.sendMessage(tabId, { type: "WELINKBTC_CHECK_READY", platform });
      if (result?.editorReady) return result;
    } catch {}
    await wait(700);
  }
  return { editorReady: false };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "WELINKBTC_PLATFORM_ACTION") return false;
  (async () => {
    try {
      assertTrustedSender(sender);
      if (!ALLOWED_ACTIONS.has(message.action)) throw new Error("不支持的扩展操作。");
      const plugin = WelinkPlatformPlugins.get(message.platform);
      if (!plugin?.capabilities.publishing.browserFill) throw new Error("尚未安装此平台的浏览器填充适配器。");
      if (message.action === "open") {
        const tab = await openPlatform(message.platform);
        await waitForTabComplete(tab.id, 15000);
        await wait(plugin.compose.prepareMs);
        const readiness = await sendReadyCheck(tab.id, message.platform);
        sendResponse({ ok: true, result: { opened: true, prepared: true, editorReady: Boolean(readiness.editorReady), tabId: tab.id } });
        return;
      }
      if (message.action === "fill") {
        const payload = validatePayload(message.payload);
        const tab = await openPlatform(message.platform);
        await waitForTabComplete(tab.id);
        await wait(plugin.compose.prepareMs);
        const result = await sendFill(tab.id, message.platform, payload, message.requestId);
        if (!result?.ok) throw new Error(result?.error || "平台编辑框填充失败。");
        sendResponse({ ok: true, result });
        return;
      }
      throw new Error("不支持的扩展操作。");
    } catch (error) { sendResponse({ ok: false, error: error.message || "扩展执行失败。" }); }
  })();
  return true;
});
