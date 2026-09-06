const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("AI 运营台 exposes the complete human-review MVP surface", () => {
  const html = fs.readFileSync(path.join(root, "ai-ops.html"), "utf8");
  for (const copy of ["生成主题稿", "平台预览", "重新生成 3 张", "保存修改", "废弃", "打开 Chrome", "填充到微博发布框", "标记已发布", "系统永远不会自动点击发送"]) {
    assert.match(html, new RegExp(copy));
  }
  assert.match(html, /id="platform-catalog"/);
  assert.match(html, /data-platform-list="rich"/);
  assert.match(html, /data-platform-list="community"/);
  assert.match(html, /data-platform-list="video"/);
  assert.ok(html.indexOf('id="platform-catalog"') < html.indexOf('class="ops-status"'), "platform catalog should be above status and controls");
  assert.match(html, /href="chrome-extension\.zip"/);
  assert.match(html, /安装 \/ 连接/);
  assert.match(html, /要使用此自动 AI 运营台助手一键发帖，请先点击/);
  assert.match(html, /href="chrome-extension\.zip" download/);
  assert.match(html, /下载并安装 Chrome 发布助手插件/);
});

test("AI content endpoint returns five usable demo drafts without a key", async () => {
  const prior = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const handler = require(path.join(root, "api", "ai-ops-generate.js"));
  let statusCode = 0;
  let payload;
  const response = { status(code) { statusCode = code; return this; }, json(value) { payload = value; return this; } };
  await handler({ method: "POST", body: { count: 5, topic: "random" } }, response);
  if (prior) process.env.OPENAI_API_KEY = prior;
  assert.equal(statusCode, 200);
  assert.equal(payload.source, "demo");
  assert.equal(payload.drafts.length, 5);
  payload.drafts.forEach((draft) => {
    assert.ok(draft.title.length > 0);
    assert.ok(draft.body.length > 0);
    assert.ok(draft.topic.length > 0);
  });
});

test("Chrome bridge declares platform adapters and has no publish-button action", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "chrome-extension", "manifest.json"), "utf8"));
  const bridge = fs.readFileSync(path.join(root, "chrome-extension", "content-platform.js"), "utf8");
  const plugins = fs.readFileSync(path.join(root, "chrome-extension", "platform-plugins.js"), "utf8");
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, "0.6.1");
  assert.equal(manifest.action.default_popup, "popup.html");
  assert.match(plugins, /id: "weibo"/);
  assert.match(plugins, /id: "x"/);
  assert.match(plugins, /id: "binance"/);
  assert.doesNotMatch(bridge, /getBy(?:Text|Role).*?(?:发送|发布|Post)/);
  assert.doesNotMatch(bridge, /querySelector\([^\n]*(?:发送|发布|Post)/);
  assert.match(bridge, /requiresHumanSend: true/);
  assert.ok(fs.existsSync(path.join(root, "chrome-extension", "popup.html")));
  assert.deepEqual(manifest.content_scripts[1].js, ["platform-plugins.js", "platform-editor.js", "content-platform.js"]);
  assert.deepEqual(manifest.content_scripts[2].js, ["x-main-world.js"]);
  assert.equal(manifest.content_scripts[2].world, "MAIN");
  const adapters = fs.readFileSync(path.join(root, "ai-ops-platforms.js"), "utf8");
  assert.match(adapters, /rasterizeForUpload/);
  assert.match(adapters, /Promise\.all\(orderedImages\.map\(rasterizeForUpload\)\)/);
  assert.match(adapters, /images: uploadImages\.map/);
  assert.match(adapters, /canvas\.toDataURL\("image\/png"/);
});

test("Chrome bridge uses minimum permissions and rejects risky data access", () => {
  const extensionRoot = path.join(root, "chrome-extension");
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, "manifest.json"), "utf8"));
  const source = fs.readdirSync(extensionRoot)
    .filter((file) => /\.(?:js|json|html)$/.test(file))
    .map((file) => fs.readFileSync(path.join(extensionRoot, file), "utf8"))
    .join("\n");
  const permissions = manifest.permissions || [];
  for (const permission of ["tabs", "clipboardRead", "clipboardWrite", "cookies", "history", "downloads", "nativeMessaging", "management", "bookmarks", "webRequest"]) {
    assert.ok(!permissions.includes(permission), `must not request ${permission}`);
  }
  assert.doesNotMatch(source, /navigator\.clipboard|document\.execCommand\(\s*["'](?:copy|cut|paste)|chrome\.(?:cookies|history|downloads|bookmarks|management)|sendNativeMessage/);
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|eval)\s*\(/);
  assert.doesNotMatch(fs.readFileSync(path.join(extensionRoot, "popup.js"), "utf8"), /tabs\.query\(\{\s*\}\)/);
  assert.doesNotMatch(fs.readFileSync(path.join(extensionRoot, "background.js"), "utf8"), /requestedUrl/);
  assert.ok(fs.existsSync(path.join(root, "chrome-extension-privacy.html")));
});

test("AI Ops previews candidate images and matches the dashboard tool set", () => {
  const html = fs.readFileSync(path.join(root, "ai-ops.html"), "utf8");
  assert.match(html, /id="image-preview-dialog"/);
  assert.match(html, /class="image-preview-trigger"/);
  assert.match(html, /ui-translations\.js/);
  assert.match(html, /币安聊天室/);
  assert.match(html, /linktr\.ee\/welinkBTC/);
  assert.match(html, /class="image-nav image-prev"/);
  assert.match(html, /class="image-nav image-next"/);
  assert.match(html, /滑动选择/);
});

test("platform bridge commits X text and targets the Binance composer", () => {
  const bridge = fs.readFileSync(path.join(root, "chrome-extension", "content-platform.js"), "utf8");
  const editor = fs.readFileSync(path.join(root, "chrome-extension", "platform-editor.js"), "utf8");
  const xMain = fs.readFileSync(path.join(root, "chrome-extension", "x-main-world.js"), "utf8");
  const background = fs.readFileSync(path.join(root, "chrome-extension", "background.js"), "utf8");
  const plugins = fs.readFileSync(path.join(root, "chrome-extension", "platform-plugins.js"), "utf8");
  assert.match(editor, /execCommand\("insertText"/);
  assert.match(editor, /execCommand\("insertParagraph"/);
  assert.match(editor, /execCommand\("insertLineBreak"/);
  assert.match(editor, /commitXEditorState/);
  assert.match(editor, /dispatchPlainTextPaste/);
  assert.match(editor, /new view\.ClipboardEvent\("paste"/);
  assert.match(editor, /pasteHandled && exact && stable/);
  assert.match(xMain, /async function commitXEditorState/);
  assert.doesNotMatch(xMain, /WelinkEditorFill/);
  assert.match(xMain, /X_MAIN_READY/);
  assert.match(xMain, /inflightRequests\.has\(requestId\)/);
  assert.match(xMain, /completedRequests\.has\(requestId\)/);
  assert.match(xMain, /new ClipboardEvent\("paste"/);
  assert.match(xMain, /transfer\.setData\("text\/plain", text\)/);
  assert.match(xMain, /pasteHandled && exact && stable/);
  assert.doesNotMatch(xMain, /\.execCommand\(/);
  assert.doesNotMatch(xMain, /Array\.from\(lines\[lineIndex\]\)/);
  assert.match(bridge, /ensureTextCommitted/);
  assert.match(bridge, /commitXText/);
  assert.match(bridge, /setInterval\(send, 300\)/);
  assert.ok(fs.existsSync(path.join(root, "tests", "x-main-bridge-harness.html")));
  assert.match(bridge, /!xCommit\.exact \|\| !xCommit\.stateAccepted/);
  assert.match(bridge, /if \(platform !== "x"\) await ensureTextCommitted/);
  assert.match(bridge, /inflightFills\.get\(transactionId\)/);
  assert.match(bridge, /completedFills\.has\(transactionId\)/);
  assert.doesNotMatch(bridge, /X 只显示了表面文字/);
  assert.match(bridge, /xStateCommitted/);
  assert.match(bridge, /files\.forEach\(\(file\) => transfer\.items\.add\(file\)\)/);
  assert.match(bridge, /imageUploadedCount/);
  const xBranch = bridge.match(/let upload;\s*if \(platform === "x"\) \{([\s\S]*?)\} else \{/)[1];
  assert.ok(xBranch.indexOf("attachImages") < xBranch.indexOf("commitXText"), "X must finish attaching images before committing text");
  assert.equal((xBranch.match(/commitXText\(/g) || []).length, 1, "X fill must commit text exactly once");
  assert.match(plugins, /\.ProseMirror\[contenteditable='true'\]/);
  assert.match(plugins, /创建帖子/);
  assert.match(background, /composePath/);
  assert.match(background, /return \{ text, title, bodyText, images \}/);
  assert.match(plugins, /square\\\\\/post\\\\\/create/);
  assert.match(background, /await wait\(plugin\.compose\.prepareMs\)/);
  assert.match(background, /const readiness = await sendReadyCheck/);
  assert.match(background, /editorReady: Boolean\(readiness\.editorReady\)/);
  assert.match(background, /sendFill\(tab\.id, message\.platform, payload, message\.requestId\)/);
});

test("platform preview can copy the final formatted draft with line breaks", () => {
  const html = fs.readFileSync(path.join(root, "ai-ops.html"), "utf8");
  const source = fs.readFileSync(path.join(root, "ai-ops.js"), "utf8");
  const styles = fs.readFileSync(path.join(root, "ai-ops.css"), "utf8");
  assert.match(html, /class="copy-preview"/);
  assert.match(html, /一键复制平台预览完整文稿/);
  assert.match(source, /copyPlatformPreview\(adapter\.preview\(copyPost\)\)/);
  assert.match(source, /navigator\.clipboard\.writeText\(value\)/);
  assert.match(source, /replace\(\/\\r\\n\?\/g, "\\n"\)/);
  assert.match(styles, /white-space: pre-wrap/);
});

test("fill action opens exactly one platform tab before sending all three images", () => {
  const ops = fs.readFileSync(path.join(root, "ai-ops.js"), "utf8");
  assert.match(ops, /activePublishMode === "browser-fill"/);
  assert.match(ops, /const result = await adapter\.fill/);
  assert.match(ops, /正在准备 \$\{MODE_LABELS\[activePublishMode\]\}/);
  const background = fs.readFileSync(path.join(root, "chrome-extension", "background.js"), "utf8");
  const fillBlock = background.match(/if \(message\.action === "fill"\) \{([\s\S]*?)sendResponse\(\{ ok: true, result \}\);/)[1];
  assert.equal((fillBlock.match(/openPlatform\(/g) || []).length, 1);
  assert.match(background, /const MAX_IMAGES = 3/);
  assert.match(background, /rawImages\.length > MAX_IMAGES/);
});

test("platform text normalizes hashtag boundaries and preserves multiline content", () => {
  const { normalizeHashtags, formatForPlatform } = require(path.join(root, "platform-text.js"));
  assert.equal(normalizeHashtags("观点#BTC#链上，继续"), "观点 #BTC #链上 ，继续");
  assert.equal(normalizeHashtags("第一行\n\n第二行 #AI"), "第一行\n\n第二行 #AI");
  const formatted = formatForPlatform("标题\n\n正文#BTC", "x", 280);
  assert.equal(formatted, "标题\n\n正文 #BTC");
});

test("candidate drafts keep up to three selectable images", () => {
  const source = fs.readFileSync(path.join(root, "ai-ops.js"), "utf8");
  assert.match(source, /Array\.from\(\{ length: 3 \}/);
  assert.match(source, /selectedImageIndex/);
  assert.match(source, /touchstart/);
  assert.match(source, /touchend/);
  assert.match(source, /images\.length < 3/);
});

test("main navigation places AI Ops immediately after the on-chain dashboard", () => {
  for (const file of ["index.html", "dashboard.html", "alphaops.html", "alpha-radar.html"]) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    const dashboard = html.indexOf('href="dashboard.html"');
    const aiOps = html.indexOf('href="ai-ops.html"');
    assert.ok(dashboard >= 0 && aiOps > dashboard, `${file} must place AI Ops after dashboard`);
  }
});

test("AI Ops exposes three candidate sources and a right-side material library", () => {
  const html = fs.readFileSync(path.join(root, "ai-ops.html"), "utf8");
  const source = fs.readFileSync(path.join(root, "ai-ops.js"), "utf8");
  const styles = fs.readFileSync(path.join(root, "ai-ops.css"), "utf8");
  for (const copy of ["精选主题", "AI 主题", "素材库主题", "新闻主题", "X · 指定账号热门帖", "微博 · 实时热搜", "手动导入公开素材"]) assert.match(html, new RegExp(copy));
  assert.match(html, /id="material-drawer"/);
  assert.match(styles, /\.material-drawer\.is-open/);
  assert.match(source, /function openLibrary\(/);
  assert.match(source, /\/api\/ai-ops-library/);
  assert.match(source, /\/api\/ai-ops-polish/);
});

test("OpenAI configuration status is server-only and auto-detectable", async () => {
  const prior = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const handler = require(path.join(root, "api", "ai-ops-config.js"));
  let payload;
  const response = { status() { return this; }, json(value) { payload = value; return this; } };
  await handler({ method: "GET" }, response);
  if (prior) process.env.OPENAI_API_KEY = prior;
  assert.equal(payload.openai.configured, false);
  assert.equal(payload.security.serverOnly, true);
  assert.equal(payload.security.keyExposedToBrowser, false);
  assert.equal(payload.security.automaticPublish, false);
  assert.equal(Object.hasOwn(payload, "OPENAI_API_KEY"), false);
  assert.match(fs.readFileSync(path.join(root, "ai-ops.html"), "utf8"), /platform\.openai\.com\/api-keys/);
});

test("material library supports manual import and fails clearly when X credentials are absent", async () => {
  const prior = process.env.X_BEARER_TOKEN;
  delete process.env.X_BEARER_TOKEN;
  const handler = require(path.join(root, "api", "ai-ops-library.js"));
  const invoke = async (body) => {
    let statusCode = 0; let payload;
    const response = { status(code) { statusCode = code; return this; }, json(value) { payload = value; return this; } };
    await handler({ method: "POST", body }, response);
    return { statusCode, payload };
  };
  const manual = await invoke({ source: "manual", platform: "binance", account: "公开账号", manualText: "第一条公开素材\n\n第二条公开素材", limit: 10 });
  assert.equal(manual.statusCode, 200);
  assert.equal(manual.payload.items.length, 2);
  assert.ok(manual.payload.items.every((item) => item.sourceType === "manual"));
  const x = await invoke({ source: "x-account", account: "wangchangfu88", days: 90, limit: 20 });
  if (prior) process.env.X_BEARER_TOKEN = prior;
  assert.equal(x.statusCode, 409);
  assert.equal(x.payload.code, "X_TOKEN_REQUIRED");
  assert.match(x.payload.error, /X_BEARER_TOKEN/);
});

test("featured on-chain candidate uses live cost-basis data and a fullscreen snapshot", () => {
  const html = fs.readFileSync(path.join(root, "ai-ops.html"), "utf8");
  const source = fs.readFileSync(path.join(root, "ai-ops.js"), "utf8");
  for (const value of ["cost-basis", "sth-ratio", "realized-profit-loss", "median-realized-price", "lth-realized-price", "alphaops", "alpha-radar", "all"]) assert.match(html, new RegExp(`value="${value}"`));
  assert.match(source, /fetchFeaturedJson\("\/api\/cost-basis"/);
  assert.match(source, /costBasisSnapshotVisual/);
  assert.match(source, /trendSnapshotVisual/);
  assert.match(source, /rankedSnapshotVisual/);
  assert.match(source, /\/api\/alphaops-projects/);
  assert.match(source, /\/api\/alpha-scan/);
  assert.match(source, /\/api\/realized-profit-loss/);
  assert.match(source, /\/api\/median-realized-price/);
  assert.match(source, /\/api\/lth-realized-price/);
  assert.match(source, /canvas\.width = 1600/);
  assert.match(source, /Why It Matters/);
  assert.match(source, /sourceType, sourceMeta/);
});

test("platform registry defines per-platform capabilities without changing the main flow", () => {
  const adapters = fs.readFileSync(path.join(root, "ai-ops-platforms.js"), "utf8");
  const extensionPlugins = fs.readFileSync(path.join(root, "chrome-extension", "platform-plugins.js"), "utf8");
  for (const id of ["weibo", "x", "binance", "okx", "xiaohongshu", "wechat", "linkedin", "facebook", "telegram", "whatsapp", "discord", "zhihu", "threads", "reddit", "youtube", "douyin", "tiktok", "wechat-channels", "kuaishou", "bilibili-dynamic"]) {
    assert.match(adapters, new RegExp(`id: "${id}"`));
    assert.match(extensionPlugins, new RegExp(`id: "${id}"`));
  }
  for (const capability of ["contentType", "text", "media", "hashtags", "publishing", "adapter", "humanConfirmationRequired", "automaticSend"]) assert.match(adapters, new RegExp(capability));
  for (const category of ["rich", "community", "video"]) assert.match(adapters, new RegExp(`category: "${category}"`));
  assert.match(adapters, /capabilities\.publishing\.browserFill && bridgeReady\(\)/);
  assert.match(adapters, /if \(!capabilities\.publishing\.browserFill\)/);
  assert.match(adapters, /mode: "copy-open"/);
  assert.match(adapters, /capabilities\(id\)/);
  assert.match(extensionPlugins, /browserFillPlugins/);
  assert.match(extensionPlugins, /automaticSend: false/);
  assert.match(fs.readFileSync(path.join(root, "chrome-extension", "background.js"), "utf8"), /importScripts\("platform-plugins\.js"\)/);
});

test("all-platform console exposes four freely selectable publishing methods", () => {
  const html = fs.readFileSync(path.join(root, "ai-ops.html"), "utf8");
  const source = fs.readFileSync(path.join(root, "ai-ops.js"), "utf8");
  assert.match(html, /全平台自动 AI/);
  assert.match(html, /class="aiops-upper-panel"/);
  assert.match(html, /class="aiops-lower-panel"/);
  for (const mode of ["browser-fill", "intent-url", "official-api", "copy-manual"]) assert.match(html, new RegExp(`value="${mode}"`));
  assert.ok(html.indexOf('id="platform-catalog"') < html.indexOf('id="publishing-modes"'));
  assert.match(source, /function executePublishing\(/);
  assert.match(source, /function writePublishLog\(/);
  assert.match(source, /stage: "browser-filled"/);
  assert.match(source, /stage: "intent-opened"/);
  assert.match(source, /stage: "api-published"/);
  assert.match(source, /stage: "copied-for-manual"/);
});

test("master drafts are adapted to validated platform posts", async () => {
  const prior = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const handler = require(path.join(root, "api", "ai-ops-adapt.js"));
  const invoke = async (platformId, draft) => {
    let statusCode = 0; let payload;
    const response = { status(code) { statusCode = code; return this; }, json(value) { payload = value; return this; } };
    await handler({ method: "POST", body: { platformId, draft, imageCount: 3 } }, response);
    return { statusCode, payload };
  };
  const draft = { title: "主草稿标题", body: "第一段观点。\n\n第二段行动建议。#AI运营 #内容增长" };
  const x = await invoke("x", draft);
  const xhs = await invoke("xiaohongshu", draft);
  if (prior) process.env.OPENAI_API_KEY = prior;
  assert.equal(x.statusCode, 200);
  assert.equal(x.payload.platformPost.platformId, "x");
  assert.ok(x.payload.platformPost.text.includes("主草稿标题"));
  assert.ok(x.payload.platformPost.text.length <= 280);
  assert.equal(xhs.payload.platformPost.platformId, "xiaohongshu");
  assert.equal(xhs.payload.platformPost.title, "主草稿标题");
  assert.equal(xhs.payload.validation.valid, true);
});

test("official API publishing is gated by human confirmation and credentials", async () => {
  const handler = require(path.join(root, "api", "ai-ops-publish.js"));
  const invoke = async (body) => {
    let statusCode = 0; let payload;
    const response = { status(code) { statusCode = code; return this; }, json(value) { payload = value; return this; } };
    await handler({ method: "POST", body }, response);
    return { statusCode, payload };
  };
  const noConfirm = await invoke({ platformId: "telegram", platformPost: { body: "hello" } });
  assert.equal(noConfirm.statusCode, 400);
  assert.equal(noConfirm.payload.code, "HUMAN_CONFIRMATION_REQUIRED");
  const priorToken = process.env.TELEGRAM_BOT_TOKEN; const priorChat = process.env.TELEGRAM_CHAT_ID;
  delete process.env.TELEGRAM_BOT_TOKEN; delete process.env.TELEGRAM_CHAT_ID;
  const noCredentials = await invoke({ confirmed: true, platformId: "telegram", platformPost: { body: "hello", hashtags: [] } });
  if (priorToken) process.env.TELEGRAM_BOT_TOKEN = priorToken; if (priorChat) process.env.TELEGRAM_CHAT_ID = priorChat;
  assert.equal(noCredentials.statusCode, 409);
  assert.equal(noCredentials.payload.requiresSetup, true);
});

test("Chrome v0.6 limits Browser Fill to explicit platform hosts", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "chrome-extension", "manifest.json"), "utf8"));
  for (const host of ["https://creator.xiaohongshu.com/*", "https://www.zhihu.com/*", "https://www.threads.net/*", "https://creator.douyin.com/*", "https://www.tiktok.com/*"]) {
    assert.ok(manifest.host_permissions.includes(host));
  }
  assert.ok(!manifest.host_permissions.includes("<all_urls>"));
  const plugins = fs.readFileSync(path.join(root, "chrome-extension", "platform-plugins.js"), "utf8");
  for (const id of ["xiaohongshu", "zhihu", "threads", "douyin", "tiktok"]) assert.match(plugins, new RegExp(`id: "${id}"`));
});

test("core workflow tracks seven steps and validates the latest extension", () => {
  const html = fs.readFileSync(path.join(root, "ai-ops.html"), "utf8");
  const source = fs.readFileSync(path.join(root, "ai-ops.js"), "utf8");
  const contentOps = fs.readFileSync(path.join(root, "chrome-extension", "content-ops.js"), "utf8");
  const contentPlatform = fs.readFileSync(path.join(root, "chrome-extension", "content-platform.js"), "utf8");
  for (const step of ["install", "platform", "mode", "chrome", "generate", "preview", "publish"]) assert.match(html, new RegExp(`data-flow-step="${step}"`));
  assert.match(source, /EXPECTED_EXTENSION_VERSION = "0\.6\.1"/);
  assert.match(source, /detectedExtensionVersion === EXPECTED_EXTENSION_VERSION/);
  assert.match(contentOps, /chrome\.runtime\.getManifest\(\)\.version/);
  assert.match(contentOps, /type: "PONG", version: extensionVersion/);
  assert.match(contentPlatform, /WELINKBTC_CHECK_READY/);
  assert.match(contentPlatform, /editorReady: Boolean\(editor\)/);
});

test("four topic libraries keep independent status counts", () => {
  const html = fs.readFileSync(path.join(root, "ai-ops.html"), "utf8");
  const source = fs.readFileSync(path.join(root, "ai-ops.js"), "utf8");
  for (const library of ["featured", "ai", "library", "news"]) {
    assert.match(html, new RegExp(`data-source="${library}"`));
    for (const status of ["pending", "published", "discarded"]) assert.match(html, new RegExp(`data-source-count="${library}-${status}"`));
  }
  assert.match(source, /for \(const source of \["featured", "ai", "library", "news"\]\)/);
  assert.match(source, /activeCounts = sourceCounts\[activeSource\]/);
  assert.match(source, /async function generateNews\(\)/);
  assert.match(source, /source: "weibo-hot"/);
  assert.match(source, /sourceType: "news"/);
});

test("platform capsules use local brand icons and core workflow stays compact", () => {
  const adapters = fs.readFileSync(path.join(root, "ai-ops-platforms.js"), "utf8");
  const source = fs.readFileSync(path.join(root, "ai-ops.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "ai-ops.css"), "utf8");
  const iconFiles = [
    "weibo.svg", "x.svg", "binance.svg", "okx.svg", "xiaohongshu.svg", "wechat.svg", "linkedin.svg", "facebook.svg",
    "telegram.svg", "whatsapp.svg", "discord.svg", "zhihu.svg", "threads.svg", "reddit.svg", "youtube.svg", "douyin.svg",
    "tiktok.svg", "wechat_channels.svg", "kuaishou.svg", "bilibili_dynamic.svg"
  ];
  for (const file of iconFiles) assert.ok(fs.existsSync(path.join(root, "assets", "platform-icons", file)), `missing ${file}`);
  assert.match(adapters, /const ICON_PATHS =/);
  assert.match(source, /--platform-icon/);
  assert.match(css, /mask: var\(--platform-icon\) center \/ contain no-repeat/);
  assert.match(css, /\.core-flow-step \{[^}]*min-height: 112px/);
  assert.match(css, /\.core-operations \{ padding: 12px 14px/);
});

test("floating Xiaowei assistant connects every selected platform to SURF with OpenAI fallback", () => {
  const html = fs.readFileSync(path.join(root, "ai-ops.html"), "utf8");
  const source = fs.readFileSync(path.join(root, "surf-assistant.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "ai-ops.css"), "utf8");
  const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  assert.match(html, /id="surf-assistant"/);
  assert.match(html, /小微深度研究/);
  assert.match(html, /SURF × OPENAI/);
  assert.match(html, /id="surf-bot-effort"/);
  assert.match(html, /src="surf-assistant\.js"/);
  assert.match(source, /activePlatform\(\)/);
  assert.match(source, /platformId: platform\.id/);
  assert.match(source, /pointermove/);
  assert.match(source, /welinkbtc-surf-bot-top/);
  assert.match(css, /\.surf-assistant \{[^}]*position: fixed/);
  assert.match(css, /right: 16px/);
  assert.equal(vercel.functions["api/surf-research.js"].maxDuration, 300);
});

test("Xiaowei is a shared welinkBTC research layer across every main surface", () => {
  const pages = ["index.html", "alphaops.html", "alpha-radar.html", "dashboard.html", "ai-ops.html"];
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), "utf8");
    assert.match(html, /href="surf-assistant\.css"/);
    assert.match(html, /src="surf-assistant\.js"/);
  }
  const source = fs.readFileSync(path.join(root, "surf-assistant.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "surf-assistant.css"), "utf8");
  for (const context of ["index.html", "alphaops.html", "alpha-radar.html", "dashboard.html", "ai-ops.html"]) assert.match(source, new RegExp(context.replace(".", "\\.")));
  assert.match(source, /document\.body\.append\(assistant\)/);
  assert.match(source, /WELINKBTC × SURF/);
  assert.match(source, /当前工作台/);
  assert.match(source, /当前看板/);
  assert.match(css, /--xw-green: #75ff9b/);
  assert.match(css, /linear-gradient\(rgba\(117,255,155,\.035\) 1px/);
  assert.match(css, /animation: xwOrbit/);
  assert.match(css, /animation: xwScan/);
});

test("SURF research stays server-side and returns grounded response text", async () => {
  const handler = require(path.join(root, "api", "surf-research.js"));
  const previousKey = process.env.SURF_API_KEY;
  const previousOpenAIKey = process.env.OPENAI_API_KEY;
  const previousFetch = global.fetch;
  const invoke = async (body) => {
    let statusCode = 0; let payload; const headers = {};
    const response = {
      setHeader(name, value) { headers[name] = value; },
      status(code) { statusCode = code; return this; },
      json(value) { payload = value; return this; }
    };
    await handler({ method: "POST", body }, response);
    return { statusCode, payload, headers };
  };
  delete process.env.SURF_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const missing = await invoke({ query: "研究 BTC" });
  assert.equal(missing.statusCode, 503);
  process.env.SURF_API_KEY = "test-server-only-key";
  let upstreamBody; let authorization;
  global.fetch = async (_url, options) => {
    upstreamBody = JSON.parse(options.body); authorization = options.headers.Authorization;
    return { ok: true, status: 200, async json() { return { id: "resp_test123", model: "surf-2.0", status: "completed", output_text: "结论与来源 https://example.com/source", usage: { total_tokens: 42 } }; } };
  };
  const success = await invoke({ query: "研究 BTC ETF 资金流", platformId: "x", platformName: "推特 / X", effort: "high" });
  global.fetch = previousFetch;
  if (previousKey) process.env.SURF_API_KEY = previousKey; else delete process.env.SURF_API_KEY;
  if (previousOpenAIKey) process.env.OPENAI_API_KEY = previousOpenAIKey; else delete process.env.OPENAI_API_KEY;
  assert.equal(success.statusCode, 200);
  assert.equal(success.payload.provider, "surf");
  assert.equal(success.payload.fallback, false);
  assert.equal(success.payload.answer, "结论与来源 https://example.com/source");
  assert.equal(success.payload.responseId, "resp_test123");
  assert.equal(upstreamBody.model, "surf-2.0");
  assert.equal(upstreamBody.reasoning.effort, "high");
  assert.equal(upstreamBody.metadata.platform, "x");
  assert.equal(authorization, "Bearer test-server-only-key");
  assert.doesNotMatch(JSON.stringify(success.payload), /test-server-only-key/);
});

test("Xiaowei falls back to OpenAI web research when SURF returns no result", async () => {
  const handler = require(path.join(root, "api", "surf-research.js"));
  const previousSurfKey = process.env.SURF_API_KEY;
  const previousOpenAIKey = process.env.OPENAI_API_KEY;
  const previousModel = process.env.OPENAI_RESEARCH_MODEL;
  const previousFetch = global.fetch;
  process.env.SURF_API_KEY = "test-surf-key";
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.OPENAI_RESEARCH_MODEL = "gpt-5.6-terra";
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    if (calls.length === 1) {
      return { ok: false, status: 504, async json() { return { error: { message: "SURF timed out upstream" } }; } };
    }
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          id: "resp_openai123",
          model: "gpt-5.6-terra",
          status: "completed",
          output: [{ type: "message", content: [{
            type: "output_text",
            text: "OpenAI 接力结论",
            annotations: [{ type: "url_citation", url: "https://example.com/research", title: "Primary research" }]
          }] }],
          usage: { total_tokens: 88 }
        };
      }
    };
  };
  let statusCode = 0; let payload;
  const response = {
    setHeader() {},
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return this; }
  };
  try {
    await handler({ method: "POST", body: {
      query: "研究 BTC 实时资金流",
      effort: "low",
      platformId: "alpha-radar",
      platformName: "Alpha Radar",
      surfPreviousResponseId: "resp_surf_previous",
      openaiPreviousResponseId: "resp_openai_previous"
    } }, response);
  } finally {
    global.fetch = previousFetch;
    if (previousSurfKey) process.env.SURF_API_KEY = previousSurfKey; else delete process.env.SURF_API_KEY;
    if (previousOpenAIKey) process.env.OPENAI_API_KEY = previousOpenAIKey; else delete process.env.OPENAI_API_KEY;
    if (previousModel) process.env.OPENAI_RESEARCH_MODEL = previousModel; else delete process.env.OPENAI_RESEARCH_MODEL;
  }
  assert.equal(statusCode, 200);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /asksurf\.ai/);
  assert.match(calls[1].url, /api\.openai\.com\/v1\/responses/);
  assert.equal(calls[1].options.headers.Authorization, "Bearer test-openai-key");
  assert.equal(calls[1].body.model, "gpt-5.6-terra");
  assert.deepEqual(calls[1].body.tools, [{ type: "web_search" }]);
  assert.equal(calls[1].body.previous_response_id, "resp_openai_previous");
  assert.equal(payload.provider, "openai");
  assert.equal(payload.fallback, true);
  assert.equal(payload.fallbackFrom, "surf");
  assert.equal(payload.openaiResponseId, "resp_openai123");
  assert.match(payload.answer, /OpenAI 接力结论/);
  assert.match(payload.answer, /https:\/\/example\.com\/research/);
  assert.doesNotMatch(JSON.stringify(payload), /test-openai-key|test-surf-key/);
});

test("Xiaowei frontend keeps provider conversations separate and reports the fallback engine", () => {
  const source = fs.readFileSync(path.join(root, "surf-assistant.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "surf-assistant.css"), "utf8");
  const config = fs.readFileSync(path.join(root, "api", "ai-ops-config.js"), "utf8");
  assert.match(source, /surfPreviousResponseId/);
  assert.match(source, /openaiPreviousResponseId/);
  assert.match(source, /OpenAI 自动接力完成/);
  assert.match(source, /SURF 主引擎/);
  assert.match(source, /normalizeResearchDisplayText/);
  assert.match(source, /research: true/);
  assert.match(css, /\.surf-research-copy h3/);
  assert.match(config, /researchModel/);
  assert.match(config, /fallbackProvider: "openai"/);
});

test("Xiaowei cleans raw Markdown, emoji, broken characters and English quotes from Chinese research", () => {
  const { normalizeResearchAnswer } = require(path.join(root, "api", "surf-research.js"));
  const raw = `# BTC 实现利润与实现损失比\n\n## TL;DR\n\n**BTC 指标**可以理解为市场中"卖出赚钱"与"卖出亏钱"的强弱。\n\n---\n\n## 核心结论\n\n1. **1** 通常表示获利了结占优。\n2. 低于 1 需要结合价格趋势。 🚀\uFFFD`;
  const result = normalizeResearchAnswer(raw, "zh");
  assert.match(result, /【BTC 实现利润与实现损失比】/);
  assert.match(result, /【摘要】/);
  assert.match(result, /【核心结论】/);
  assert.match(result, /“卖出赚钱”与“卖出亏钱”/);
  assert.match(result, /1．1 通常表示获利了结占优。/);
  assert.doesNotMatch(result, /^\s*#/m);
  assert.doesNotMatch(result, /\*\*|---|```|🚀|\uFFFD|"/u);
});
