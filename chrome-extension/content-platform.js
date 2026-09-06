(function () {

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const setEditorValue = (editor, text, platform) => window.WelinkEditorFill.setEditorValue(editor, text, platform);
  const pendingXCommits = new Map();
  const inflightFills = new Map();
  const completedFills = new Map();

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin || event.data?.source !== "welinkbtc-x-main") return;
    if (event.data?.type === "X_MAIN_READY") return;
    if (event.data?.type !== "COMMIT_X_RESULT") return;
    const pending = pendingXCommits.get(event.data.requestId);
    if (!pending) return;
    clearTimeout(pending.timeout); clearInterval(pending.retry); pendingXCommits.delete(event.data.requestId);
    if (event.data.ok) pending.resolve(event.data.result || {});
    else pending.reject(new Error(event.data.error || "X 正文提交失败。"));
  });

  function commitXText(text) {
    return new Promise((resolve, reject) => {
      const requestId = `x-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const send = () => window.postMessage({ source: "welinkbtc-x-isolated", type: "COMMIT_X_TEXT", requestId, text }, location.origin);
      const retry = setInterval(send, 300);
      const timeout = setTimeout(() => { clearInterval(retry); pendingXCommits.delete(requestId); reject(new Error("X 主页面脚本未准备好，请重新加载扩展并刷新 X 页面。")); }, 8000);
      pendingXCommits.set(requestId, { resolve, reject, timeout, retry });
      send();
    });
  }
  const visible = (element) => Boolean(element && (element.offsetWidth || element.offsetHeight || element.getClientRects().length));
  const find = (selectors, requireVisible = true) => {
    for (const selector of selectors) {
      const matches = [...document.querySelectorAll(selector)];
      const result = requireVisible ? matches.find(visible) : matches[0];
      if (result) return result;
    }
    return null;
  };

  async function ensureBinanceComposer(config) {
    let editor = find(config.editors, true);
    if (editor) return editor;
    const trigger = find(config.composerTriggers || [], true);
    if (trigger) {
      trigger.click();
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await wait(500);
        editor = find(config.editors, true);
        if (editor) return editor;
      }
    }
    return null;
  }

  function dataUrlFile(dataUrl, fileName, mimeType) {
    const comma = dataUrl.indexOf(",");
    if (comma < 0) throw new Error("配图数据格式无效，请重新出图后再试。");
    const metadata = dataUrl.slice(0, comma);
    const encoded = dataUrl.slice(comma + 1);
    const actualMime = metadata.match(/^data:([^;,]+)/)?.[1] || mimeType || "image/png";
    let bytes;
    if (metadata.includes(";base64")) {
      const binary = atob(encoded);
      bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    } else {
      bytes = new TextEncoder().encode(decodeURIComponent(encoded));
    }
    return new File([bytes], fileName || "welinkbtc-post.png", { type: actualMime });
  }

  async function attachImages(config, payload) {
    const legacyImages = payload.imageDataUrl ? [{ imageDataUrl: payload.imageDataUrl, fileName: payload.fileName, mimeType: payload.mimeType }] : [];
    const images = (Array.isArray(payload.images) ? payload.images : legacyImages).slice(0, 3);
    if (!images.length) return { uploaded: false, uploadedCount: 0, skipped: true };
    let input = find(config.files, false);
    if (!input && config.imageButtons.length) {
      const button = find(config.imageButtons, true);
      if (button) { button.click(); await wait(500); input = find(config.files, false); }
    }
    if (!input) throw new Error("已填入文字，但没有找到图片上传控件。请手动上传草稿图片。" );
    const files = images.map((image, index) => dataUrlFile(image.imageDataUrl, image.fileName || `welinkbtc-post-${index + 1}.png`, image.mimeType));
    const transfer = new DataTransfer();
    files.forEach((file) => transfer.items.add(file));
    input.multiple = true;
    input.files = transfer.files;
    input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true }));
    return { uploaded: true, uploadedCount: files.length };
  }

  const compactText = (value) => String(value || "").replace(/\s+/g, "");

  async function ensureTextCommitted(platform, config, editor, text) {
    const expectedText = compactText(text);
    const waits = platform === "binance" ? [1200, 1800] : [700];
    let currentEditor = editor;
    for (const waitTime of waits) {
      await wait(waitTime);
      currentEditor = find(config.editors, true) || currentEditor;
      const visibleText = compactText(currentEditor.innerText || currentEditor.textContent || currentEditor.value || "");
      if (expectedText && !visibleText.includes(expectedText)) {
        setEditorValue(currentEditor, text, platform);
        await wait(300);
      }
    }
    return currentEditor;
  }

  async function fill(platform, payload) {
    const plugin = WelinkPlatformPlugins.get(platform);
    const config = plugin?.editor; if (!plugin?.capabilities.publishing.browserFill || !config) throw new Error("未识别的平台填充适配器。");
    let editor = platform === "binance" ? await ensureBinanceComposer(config) : find(config.editors, true);
    for (let attempt = 0; !editor && attempt < 5; attempt += 1) { await wait(650); editor = find(config.editors, true); }
    if (!editor) throw new Error(platform === "binance" ? "没有找到币安广场创作编辑框。请确认页面已进入“创建帖子”，而不是个人主页或聊天室。" : "没有找到发布编辑框。请确认已登录并打开平台首页或发帖页。" );
    const titleEditor = config.titles?.length ? find(config.titles, true) : null;
    const textForEditor = titleEditor && payload.title ? (payload.bodyText || payload.text || "") : (payload.text || "");
    if (titleEditor && payload.title) setEditorValue(titleEditor, payload.title, platform);
    let upload;
    if (platform === "x") {
      upload = await attachImages(config, payload);
      await wait(1500);
      editor = find(config.editors, true) || editor;
      const xCommit = await commitXText(payload.text || "");
      if (!xCommit.exact || !xCommit.stateAccepted) throw new Error("X 没有接管完整正文的粘贴事件。系统已停止且不会重复填充，请使用运营台的“一键复制”手动粘贴更新。");
    } else {
      setEditorValue(editor, textForEditor, platform);
      upload = await attachImages(config, payload);
    }
    if (platform !== "x") await ensureTextCommitted(platform, config, editor, textForEditor);
    // 安全边界：这里故意没有查找、点击或触发任何“发送 / 发布 / Post”按钮。
    return { ok: true, textFilled: true, xStateCommitted: platform === "x", imageUploaded: upload.uploaded, imageUploadedCount: upload.uploadedCount, requiresHumanSend: true };
  }

  async function checkReady(platform) {
    const plugin = WelinkPlatformPlugins.get(platform);
    const config = plugin?.editor;
    if (!plugin?.capabilities.publishing.browserFill || !config) return { editorReady: false };
    let editor = platform === "binance" ? await ensureBinanceComposer(config) : find(config.editors, true);
    for (let attempt = 0; !editor && attempt < 4; attempt += 1) { await wait(500); editor = find(config.editors, true); }
    return { editorReady: Boolean(editor), platform, requiresHumanSend: true };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "WELINKBTC_CHECK_READY") {
      if (sender.id !== chrome.runtime.id) { sendResponse({ editorReady: false }); return false; }
      checkReady(message.platform).then(sendResponse).catch(() => sendResponse({ editorReady: false }));
      return true;
    }
    if (message?.type !== "WELINKBTC_FILL") return false;
    const plugin = WelinkPlatformPlugins.get(message.platform);
    if (sender.id !== chrome.runtime.id || !plugin?.capabilities.publishing.browserFill || !plugin.editor) {
      sendResponse({ ok: false, error: "请求来源或平台无效，操作已拒绝。" });
      return false;
    }
    const transactionId = typeof message.requestId === "string" && message.requestId ? message.requestId : `legacy-${message.platform}`;
    if (completedFills.has(transactionId)) {
      sendResponse(completedFills.get(transactionId));
      return false;
    }
    let transaction = inflightFills.get(transactionId);
    if (!transaction) {
      transaction = fill(message.platform, message.payload || {})
        .then((result) => ({ ok: true, ...result }))
        .catch((error) => ({ ok: false, error: error.message || "填充失败。" }));
      inflightFills.set(transactionId, transaction);
      transaction.then((result) => {
        inflightFills.delete(transactionId);
        completedFills.set(transactionId, result);
        setTimeout(() => completedFills.delete(transactionId), 30000);
      });
    }
    transaction.then(sendResponse);
    return true;
  });
})();
