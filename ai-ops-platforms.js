(function () {
  const registry = new Map();
  const pendingRequests = new Map();
  const ICON_PATHS = {
    weibo: "assets/platform-icons/weibo.svg", x: "assets/platform-icons/x.svg", binance: "assets/platform-icons/binance.svg", okx: "assets/platform-icons/okx.svg",
    xiaohongshu: "assets/platform-icons/xiaohongshu.svg", wechat: "assets/platform-icons/wechat.svg", linkedin: "assets/platform-icons/linkedin.svg", facebook: "assets/platform-icons/facebook.svg",
    telegram: "assets/platform-icons/telegram.svg", whatsapp: "assets/platform-icons/whatsapp.svg", discord: "assets/platform-icons/discord.svg", zhihu: "assets/platform-icons/zhihu.svg",
    threads: "assets/platform-icons/threads.svg", reddit: "assets/platform-icons/reddit.svg", youtube: "assets/platform-icons/youtube.svg", douyin: "assets/platform-icons/douyin.svg",
    tiktok: "assets/platform-icons/tiktok.svg", "wechat-channels": "assets/platform-icons/wechat_channels.svg", kuaishou: "assets/platform-icons/kuaishou.svg", "bilibili-dynamic": "assets/platform-icons/bilibili_dynamic.svg"
  };

  const bridgeReady = () => document.documentElement.dataset.welinkbtcExtension === "ready";
  const makeRequestId = () => `ops-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const rasterizeForUpload = (dataUrl) => new Promise((resolve, reject) => {
    if (!dataUrl || !dataUrl.startsWith("data:image/svg+xml")) {
      const mimeType = dataUrl?.match(/^data:(image\/(?:png|jpeg|webp))/i)?.[1]?.toLowerCase() || "image/png";
      resolve({ dataUrl, mimeType });
      return;
    }
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 1024;
        canvas.height = 1024;
        const context = canvas.getContext("2d");
        context.fillStyle = "#0a0d0c";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve({ dataUrl: canvas.toDataURL("image/png", 0.92), mimeType: "image/png" });
      } catch (error) {
        reject(new Error(`图片转换失败：${error.message}`));
      }
    };
    image.onerror = () => reject(new Error("图片转换失败，请重新生成配图后再试。"));
    image.src = dataUrl;
  });

  const requestBridge = (action, platform, payload = {}) => new Promise((resolve, reject) => {
    if (!bridgeReady()) {
      reject(new Error("未检测到 Chrome 发布助手，请先查看连接说明并加载扩展。"));
      return;
    }
    const requestId = makeRequestId();
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error("Chrome 发布助手响应超时，请确认扩展已启用后重试。"));
    }, 35000);
    pendingRequests.set(requestId, { resolve, reject, timeout });
    window.postMessage({ source: "welinkbtc-ai-ops", type: "PLATFORM_ACTION", requestId, action, platform, payload }, location.origin);
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin || event.data?.source !== "welinkbtc-extension" || event.data?.type !== "PLATFORM_RESULT") return;
    const pending = pendingRequests.get(event.data.requestId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    pendingRequests.delete(event.data.requestId);
    if (event.data.ok) pending.resolve(event.data.result || {});
    else pending.reject(new Error(event.data.error || "平台填充失败，请稍后重试。"));
  });

  const copyText = async (text) => {
    if (!navigator.clipboard?.writeText) throw new Error("当前浏览器不支持自动复制，请使用候选稿中的“一键复制”。");
    await navigator.clipboard.writeText(text);
  };

  const platform = ({ id, name, labelEn, shortName, badge, icon, category, composeUrl, accent, capabilities, buildText, intentUrl }) => ({
    id, name, labelEn, shortName, badge, icon: icon || ICON_PATHS[id] || "", category, composeUrl, accent,
    capabilities: { ...capabilities, contentType: category },
    get limit() { return capabilities.text.limit; },
    buildText(draft) {
      const rawText = (buildText || ((item) => item.text || `${capabilities.text.titleRequired && item.title ? `${item.title}\n\n` : ""}${item.body || ""}`.trim()))(draft);
      return window.WelinkPlatformText.formatForPlatform(rawText, id, capabilities.text.limit);
    },
    preview(draft) { return this.buildText(draft); },
    createPlatformPost(draft) {
      const title = capabilities.text.titleRequired ? String(draft.title || "").trim() : "";
      const sourceBody = String(draft.body || "").replace(/\r\n?/g, "\n").trim();
      const hashtags = [...new Set((sourceBody.match(/#[^\s#，。！？、；;]+/g) || []).slice(0, capabilities.hashtags.limit))];
      const cleanBody = sourceBody.replace(/(?:^|\s)#[^\s#，。！？、；;]+/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      const body = capabilities.text.titleRequired ? cleanBody : [String(draft.title || "").trim(), cleanBody].filter(Boolean).join("\n\n");
      const post = { platformId: id, title, body, hashtags, source: "rules" };
      post.text = this.buildText(post);
      return post;
    },
    validate(post, imageCount = 0) {
      const errors = [];
      const warnings = [];
      const text = this.buildText(post);
      if (!text) errors.push("平台稿不能为空");
      if (text.length > capabilities.text.limit) errors.push(`平台稿超过 ${capabilities.text.limit} 字限制`);
      if (capabilities.text.titleRequired && !String(post.title || "").trim()) errors.push("该平台需要标题");
      if (capabilities.media.imageRequired && imageCount < 1) warnings.push("该平台强调图片，建议至少选择 1 张配图");
      return { valid: errors.length === 0, errors, warnings, text, length: text.length };
    },
    buildIntentUrl(post) {
      const text = this.buildText(post);
      if (typeof intentUrl === "function") return intentUrl(text, post);
      return "";
    },
    async copy(post) { await copyText(this.buildText(post)); return { copied: true }; },
    async open() {
      if (capabilities.publishing.browserFill && bridgeReady()) return requestBridge("open", id);
      const opened = window.open(composeUrl, "_blank", "noopener,noreferrer");
      if (!opened) throw new Error("浏览器阻止了新窗口，请允许弹窗后重试。");
      return { opened: true, fallback: true };
    },
    async fill(draft) {
      if (!capabilities.publishing.browserFill) {
        await copyText(this.buildText(draft));
        await this.open();
        return { manualCopied: true, imageUploadedCount: 0, mode: "copy-open" };
      }
      const sourceImages = Array.isArray(draft.images) && draft.images.length ? draft.images.slice(0, 3) : [draft.image].filter(Boolean);
      const selectedIndex = Math.max(0, Math.min(sourceImages.length - 1, Number(draft.selectedImageIndex) || 0));
      const orderedImages = sourceImages.length > 1
        ? [sourceImages[selectedIndex], ...sourceImages.filter((_, index) => index !== selectedIndex)]
        : sourceImages;
      const uploadImages = await Promise.all(orderedImages.map(rasterizeForUpload));
      return requestBridge("fill", id, {
        text: this.buildText(draft),
        title: draft.title,
        bodyText: draft.body || this.buildText(draft),
        images: uploadImages.map((image, index) => ({
          imageDataUrl: image.dataUrl,
          mimeType: image.mimeType,
          fileName: `welinkbtc-${draft.id}-${index + 1}.${image.mimeType === "image/webp" ? "webp" : image.mimeType === "image/jpeg" ? "jpg" : "png"}`
        }))
      });
    }
  });

  const register = (adapter) => {
    if (!adapter?.id || !adapter.composeUrl || !adapter.capabilities || typeof adapter.fill !== "function") throw new Error("无效的平台适配器");
    registry.set(adapter.id, adapter);
    return adapter;
  };

  const capability = ({ limit, images, video = false, titleRequired = false, imageRequired = false, hashtagLimit = 3, longForm = false, browserFill = false, api = false, intent = false, supportedModes, mode = "manual", adapter }) => ({
    text: { supported: true, limit, longForm, titleRequired, editable: true },
    media: { images: images > 0, maxImages: images, video, imageRequired },
    hashtags: { supported: true, boundarySpacing: true, limit: hashtagLimit },
    publishing: {
      browserFill,
      intent,
      api,
      supportedModes: supportedModes || [browserFill ? "browser-fill" : api ? "official-api" : "copy-manual", "copy-manual"].filter((value, index, array) => array.indexOf(value) === index),
      recommendedMode: browserFill ? "browser-fill" : api ? "official-api" : intent ? "intent-url" : "copy-manual",
      mode,
      adapter: adapter || (browserFill ? "browser-fill" : api ? "api-capable" : "copy-open"),
      automaticSend: false,
      humanConfirmationRequired: true
    }
  });

  [
    { id: "weibo", name: "微博", labelEn: "Weibo", shortName: "微博", badge: "微", category: "rich", composeUrl: "https://weibo.com/", accent: "#ff4b4b", capabilities: capability({ limit: 2000, images: 9, video: true, browserFill: true, supportedModes: ["browser-fill", "copy-manual"], mode: "browser-fill" }) },
    { id: "x", name: "X", labelEn: "X", shortName: "X", badge: "X", category: "rich", composeUrl: "https://x.com/compose/post", accent: "#dce3ea", intentUrl: (text) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, capabilities: capability({ limit: 280, images: 4, video: true, browserFill: true, intent: true, api: true, supportedModes: ["browser-fill", "intent-url", "official-api", "copy-manual"], mode: "intent / browser-fill / api" }) },
    { id: "binance", name: "币安广场", labelEn: "Binance Square", shortName: "币安广场", badge: "B", category: "rich", composeUrl: "https://www.binance.com/zh-CN/square/post/create", accent: "#f3ba2f", capabilities: capability({ limit: 2000, images: 9, video: true, browserFill: true, mode: "browser-fill" }) },
    { id: "okx", name: "OKX 星球", labelEn: "OKX Feed", shortName: "OKX 星球", badge: "O", category: "rich", composeUrl: "https://www.okx.com/zh-hans/feed", accent: "#b9c1ca", capabilities: capability({ limit: 2000, images: 9, video: true, mode: "copy-open" }) },
    { id: "xiaohongshu", name: "小红书", labelEn: "Xiaohongshu", shortName: "小红书", badge: "小", category: "rich", composeUrl: "https://creator.xiaohongshu.com/publish/publish", accent: "#ff2442", capabilities: capability({ limit: 1000, images: 18, video: true, titleRequired: true, imageRequired: true, hashtagLimit: 5, browserFill: true, supportedModes: ["browser-fill", "copy-manual"], mode: "browser-fill / copy-manual" }) },
    { id: "wechat", name: "公众号", labelEn: "WeChat OA", shortName: "公众号", badge: "公", category: "rich", composeUrl: "https://mp.weixin.qq.com/", accent: "#07c160", capabilities: capability({ limit: 20000, images: 20, video: true, titleRequired: true, longForm: true, api: true, mode: "copy-open / api" }) },
    { id: "linkedin", name: "LinkedIn", labelEn: "LinkedIn", shortName: "LinkedIn", badge: "in", category: "rich", composeUrl: "https://www.linkedin.com/feed/?shareActive=true", accent: "#0a66c2", intentUrl: (text) => `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`, capabilities: capability({ limit: 3000, images: 9, video: true, intent: true, api: true, supportedModes: ["intent-url", "official-api", "copy-manual"], mode: "intent / api" }) },
    { id: "facebook", name: "Facebook Page", labelEn: "Facebook Page", shortName: "Facebook", badge: "f", category: "rich", composeUrl: "https://www.facebook.com/", accent: "#1877f2", capabilities: capability({ limit: 63206, images: 10, video: true, api: true, supportedModes: ["official-api", "copy-manual"], mode: "api / copy-manual" }) },

    { id: "telegram", name: "Telegram", labelEn: "Telegram", shortName: "Telegram", badge: "TG", category: "community", composeUrl: "https://web.telegram.org/", accent: "#229ed9", intentUrl: (text) => `https://t.me/share/url?url=&text=${encodeURIComponent(text)}`, capabilities: capability({ limit: 4096, images: 10, video: true, intent: true, api: true, supportedModes: ["intent-url", "official-api", "copy-manual"], mode: "intent / bot-api" }) },
    { id: "whatsapp", name: "WhatsApp", labelEn: "WhatsApp", shortName: "WhatsApp", badge: "WA", category: "community", composeUrl: "https://web.whatsapp.com/", accent: "#25d366", intentUrl: (text) => `https://wa.me/?text=${encodeURIComponent(text)}`, capabilities: capability({ limit: 4096, images: 10, video: true, intent: true, supportedModes: ["intent-url", "copy-manual"], mode: "intent / copy-manual" }) },
    { id: "discord", name: "Discord", labelEn: "Discord", shortName: "Discord", badge: "D", category: "community", composeUrl: "https://discord.com/channels/@me", accent: "#5865f2", capabilities: capability({ limit: 2000, images: 10, video: true, api: true, mode: "copy-open / webhook" }) },
    { id: "zhihu", name: "知乎", labelEn: "Zhihu", shortName: "知乎", badge: "知", category: "community", composeUrl: "https://www.zhihu.com/creator", accent: "#1772f6", capabilities: capability({ limit: 20000, images: 20, video: true, titleRequired: true, longForm: true, browserFill: true, supportedModes: ["browser-fill", "copy-manual"], mode: "browser-fill / copy-manual" }) },
    { id: "threads", name: "Threads", labelEn: "Threads", shortName: "Threads", badge: "@", category: "community", composeUrl: "https://www.threads.net/", accent: "#b9c1ca", capabilities: capability({ limit: 500, images: 10, video: true, browserFill: true, supportedModes: ["browser-fill", "copy-manual"], mode: "browser-fill / copy-manual" }) },
    { id: "reddit", name: "Reddit", labelEn: "Reddit", shortName: "Reddit", badge: "R", category: "community", composeUrl: "https://www.reddit.com/submit", accent: "#ff4500", capabilities: capability({ limit: 40000, images: 20, video: true, titleRequired: true, longForm: true, api: true, mode: "copy-open / api" }) },

    { id: "youtube", name: "YouTube", labelEn: "YouTube", shortName: "YouTube", badge: "YT", category: "video", composeUrl: "https://studio.youtube.com/", accent: "#ff0033", capabilities: capability({ limit: 5000, images: 1, video: true, titleRequired: true, imageRequired: true, api: true, supportedModes: ["official-api", "copy-manual"], mode: "copy-manual / api" }) },
    { id: "douyin", name: "抖音", labelEn: "Douyin", shortName: "抖音", badge: "抖", category: "video", composeUrl: "https://creator.douyin.com/creator-micro/content/upload", accent: "#fe2c55", capabilities: capability({ limit: 2200, images: 35, video: true, titleRequired: true, imageRequired: true, hashtagLimit: 5, browserFill: true, supportedModes: ["browser-fill", "copy-manual"], mode: "browser-fill / copy-manual" }) },
    { id: "tiktok", name: "TikTok", labelEn: "TikTok", shortName: "TikTok", badge: "TT", category: "video", composeUrl: "https://www.tiktok.com/tiktokstudio/upload", accent: "#25f4ee", capabilities: capability({ limit: 2200, images: 35, video: true, titleRequired: true, imageRequired: true, hashtagLimit: 5, browserFill: true, supportedModes: ["browser-fill", "copy-manual"], mode: "browser-fill / copy-manual" }) },
    { id: "wechat-channels", name: "视频号", labelEn: "WeChat Channels", shortName: "视频号", badge: "视", category: "video", composeUrl: "https://channels.weixin.qq.com/platform", accent: "#07c160", capabilities: capability({ limit: 1500, images: 9, video: true, titleRequired: true, mode: "copy-open" }) },
    { id: "kuaishou", name: "快手", labelEn: "Kuaishou", shortName: "快手", badge: "快", category: "video", composeUrl: "https://cp.kuaishou.com/", accent: "#ff4906", capabilities: capability({ limit: 2200, images: 9, video: true, titleRequired: true, mode: "copy-open" }) },
    { id: "bilibili-dynamic", name: "B站动态", labelEn: "Bilibili Dynamic", shortName: "B站动态", badge: "B", category: "video", composeUrl: "https://t.bilibili.com/", accent: "#00aeec", capabilities: capability({ limit: 2000, images: 9, video: true, mode: "copy-open" }) }
  ].forEach((definition) => register(platform(definition)));

  window.WelinkPlatformRegistry = {
    register,
    get(id) { return registry.get(id); },
    list() { return [...registry.values()]; },
    capabilities(id) { return registry.get(id)?.capabilities || null; },
    isBridgeReady: bridgeReady,
    ping() { window.postMessage({ source: "welinkbtc-ai-ops", type: "PING" }, location.origin); }
  };
})();
