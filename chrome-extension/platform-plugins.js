(function (root) {
  const plugins = new Map();

  function register(plugin) {
    if (!plugin?.id || !plugin?.compose?.url || !plugin?.capabilities) throw new Error("无效的平台插件定义");
    plugins.set(plugin.id, Object.freeze(plugin));
    return plugin;
  }

  const capabilities = ({ contentType, textLimit, maxImages, video = false, titleRequired = false, browserFill = false, api = false, mode, adapter }) => ({
    contentType,
    text: { supported: true, limit: textLimit, titleRequired, editable: true },
    media: { images: maxImages > 0, maxImages, video },
    hashtags: { supported: true, boundarySpacing: true },
    publishing: { browserFill, api, mode, adapter: adapter || (browserFill ? "browser-fill" : api ? "api-capable" : "copy-open"), automaticSend: false, humanConfirmationRequired: true }
  });

  register({
    id: "weibo", name: "微博", category: "rich", compose: { url: "https://weibo.com/", matches: ["https://weibo.com/*", "https://*.weibo.com/*"], prepareMs: 5000 },
    capabilities: capabilities({ contentType: "rich", textLimit: 2000, maxImages: 9, video: true, browserFill: true, mode: "browser-fill" }),
    editor: { editors: ["textarea[placeholder*='新鲜事']", "textarea[placeholder*='分享']", "[contenteditable='true'][role='textbox']", "[contenteditable='true'][data-placeholder]"], files: ["input[type='file'][accept*='image']", "input[type='file'][accept*='png']", "input[type='file'][accept*='jpg']"], imageButtons: ["button[aria-label*='图片']", "button[title*='图片']", "[aria-label*='照片']"] }
  });
  register({
    id: "x", name: "X", category: "rich", compose: { url: "https://x.com/compose/post", matches: ["https://x.com/*", "https://twitter.com/*"], composePath: "\\/compose\\/post", prepareMs: 5000 },
    capabilities: capabilities({ contentType: "rich", textLimit: 280, maxImages: 4, video: true, browserFill: true, api: true, mode: "intent / browser-fill / api" }),
    editor: { editors: ["[data-testid='tweetTextarea_0']", "div[contenteditable='true'][role='textbox']"], files: ["input[data-testid='fileInput']", "input[type='file'][accept*='image']"], imageButtons: [] }
  });
  register({
    id: "binance", name: "币安广场", category: "rich", compose: { url: "https://www.binance.com/zh-CN/square/post/create", matches: ["https://www.binance.com/*/square/*"], composePath: "\\/square\\/post\\/create", prepareMs: 8000 },
    capabilities: capabilities({ contentType: "rich", textLimit: 2000, maxImages: 9, video: true, browserFill: true, mode: "browser-fill" }),
    editor: {
      editors: ["[role='dialog'] [data-testid*='editor'][contenteditable='true']", "[role='dialog'] .ProseMirror[contenteditable='true']", "[role='dialog'] [data-slate-editor='true'][contenteditable='true']", "[role='dialog'] [contenteditable='true'][role='textbox']", "[role='dialog'] [contenteditable='true'][data-placeholder*='分享']", "[role='dialog'] [contenteditable='true'][aria-label*='内容']", "[role='dialog'] [contenteditable='true'][aria-label*='Post']", "[role='dialog'] textarea[placeholder*='分享']", "[role='dialog'] textarea[placeholder*='内容']", "[role='dialog'] textarea[placeholder*='想法']", "[data-testid*='post'] [contenteditable='true'][role='textbox']", ".ProseMirror[contenteditable='true']", "[data-slate-editor='true'][contenteditable='true']", "textarea[placeholder*='分享你的想法']", "textarea[placeholder*='Share your thoughts']"],
      files: ["[role='dialog'] input[type='file'][accept*='image']", "input[type='file'][accept*='image']", "input[type='file'][accept*='png']"],
      imageButtons: ["button[aria-label*='图片']", "button[title*='图片']", "[aria-label*='上传']"],
      composerTriggers: ["a[href*='/square/post/create']", "button[aria-label='创建帖子']", "button[aria-label='创建贴文']", "button[aria-label='Create post']", "[data-testid='create-post']", "[data-testid='create-post-button']", "[data-e2e='create-post']"]
    }
  });

  [
    {
      id: "xiaohongshu", name: "小红书", category: "rich", url: "https://creator.xiaohongshu.com/publish/publish", matches: ["https://creator.xiaohongshu.com/*"], path: "\\/publish\\/publish", textLimit: 1000, maxImages: 18, titleRequired: true,
      titles: ["input[placeholder*='标题']", "textarea[placeholder*='标题']"], editors: [".ql-editor[contenteditable='true']", ".ProseMirror[contenteditable='true']", "[contenteditable='true'][role='textbox']", "textarea[placeholder*='正文']", "textarea[placeholder*='描述']"]
    },
    {
      id: "zhihu", name: "知乎", category: "community", url: "https://www.zhihu.com/creator", matches: ["https://www.zhihu.com/*"], textLimit: 20000, maxImages: 20, titleRequired: true,
      titles: ["input[placeholder*='标题']", "textarea[placeholder*='标题']"], editors: [".DraftEditor-root [contenteditable='true']", ".public-DraftEditor-content[contenteditable='true']", ".ProseMirror[contenteditable='true']", "[contenteditable='true'][role='textbox']", "textarea:not([placeholder*='标题'])"]
    },
    {
      id: "threads", name: "Threads", category: "community", url: "https://www.threads.net/", matches: ["https://www.threads.net/*"], textLimit: 500, maxImages: 10,
      editors: ["[data-lexical-editor='true'][contenteditable='true']", "[contenteditable='true'][role='textbox']", "div[contenteditable='true']"]
    },
    {
      id: "douyin", name: "抖音", category: "video", url: "https://creator.douyin.com/creator-micro/content/upload", matches: ["https://creator.douyin.com/*"], path: "\\/creator-micro\\/content\\/upload", textLimit: 2200, maxImages: 35, titleRequired: true,
      titles: ["input[placeholder*='标题']", "textarea[placeholder*='标题']"], editors: ["[contenteditable='true'][role='textbox']", ".public-DraftEditor-content[contenteditable='true']", "textarea[placeholder*='作品描述']", "textarea[placeholder*='描述']", "textarea:not([placeholder*='标题'])"]
    },
    {
      id: "tiktok", name: "TikTok", category: "video", url: "https://www.tiktok.com/tiktokstudio/upload", matches: ["https://www.tiktok.com/*"], path: "\\/tiktokstudio\\/upload", textLimit: 2200, maxImages: 35, titleRequired: true,
      titles: ["input[placeholder*='title' i]", "input[placeholder*='标题']"], editors: ["[contenteditable='true'][role='textbox']", "[data-lexical-editor='true'][contenteditable='true']", "textarea[placeholder*='caption' i]", "textarea"]
    }
  ].forEach((definition) => register({
    id: definition.id,
    name: definition.name,
    category: definition.category,
    compose: { url: definition.url, matches: definition.matches, composePath: definition.path, prepareMs: 5000 },
    capabilities: capabilities({ contentType: definition.category, textLimit: definition.textLimit, maxImages: definition.maxImages, video: true, titleRequired: definition.titleRequired, browserFill: true, mode: "browser-fill" }),
    editor: {
      titles: definition.titles || [],
      editors: definition.editors,
      files: ["input[type='file'][accept*='image']", "input[type='file'][accept*='png']", "input[type='file'][accept*='jpg']"],
      imageButtons: ["button[aria-label*='图片']", "button[title*='图片']", "button[aria-label*='image' i]", "[aria-label*='上传']"]
    }
  }));

  [
    { id: "okx", name: "OKX 星球", category: "rich", url: "https://www.okx.com/zh-hans/feed", textLimit: 2000, maxImages: 9, video: true },
    { id: "wechat", name: "公众号", category: "rich", url: "https://mp.weixin.qq.com/", textLimit: 20000, maxImages: 20, video: true, titleRequired: true, api: true },
    { id: "linkedin", name: "LinkedIn", category: "rich", url: "https://www.linkedin.com/feed/?shareActive=true", textLimit: 3000, maxImages: 9, video: true, api: true },
    { id: "facebook", name: "Facebook Page", category: "rich", url: "https://www.facebook.com/", textLimit: 63206, maxImages: 10, video: true, api: true },
    { id: "telegram", name: "Telegram", category: "community", url: "https://web.telegram.org/", textLimit: 4096, maxImages: 10, video: true, api: true },
    { id: "whatsapp", name: "WhatsApp", category: "community", url: "https://web.whatsapp.com/", textLimit: 4096, maxImages: 10, video: true },
    { id: "discord", name: "Discord", category: "community", url: "https://discord.com/channels/@me", textLimit: 2000, maxImages: 10, video: true, api: true },
    { id: "reddit", name: "Reddit", category: "community", url: "https://www.reddit.com/submit", textLimit: 40000, maxImages: 20, video: true, titleRequired: true, api: true },
    { id: "youtube", name: "YouTube", category: "video", url: "https://studio.youtube.com/", textLimit: 5000, maxImages: 1, video: true, titleRequired: true, api: true },
    { id: "wechat-channels", name: "视频号", category: "video", url: "https://channels.weixin.qq.com/platform", textLimit: 1500, maxImages: 9, video: true, titleRequired: true },
    { id: "kuaishou", name: "快手", category: "video", url: "https://cp.kuaishou.com/", textLimit: 2200, maxImages: 9, video: true, titleRequired: true },
    { id: "bilibili-dynamic", name: "B站动态", category: "video", url: "https://t.bilibili.com/", textLimit: 2000, maxImages: 9, video: true }
  ].forEach((definition) => register({
    id: definition.id,
    name: definition.name,
    category: definition.category,
    compose: { url: definition.url, matches: [], prepareMs: 0 },
    capabilities: capabilities({ contentType: definition.category, textLimit: definition.textLimit, maxImages: definition.maxImages, video: definition.video, titleRequired: definition.titleRequired, api: definition.api, mode: definition.api ? "copy-open / api" : "copy-open" }),
    editor: null
  }));

  root.WelinkPlatformPlugins = Object.freeze({
    register,
    get(id) { return plugins.get(id); },
    list() { return [...plugins.values()]; },
    browserFillPlugins() { return [...plugins.values()].filter((plugin) => plugin.capabilities.publishing.browserFill); }
  });
})(globalThis);
