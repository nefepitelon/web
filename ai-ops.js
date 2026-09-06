(function () {
  const STORAGE_KEY = "welinkbtc-ai-ops-v1";
  const EXPECTED_EXTENSION_VERSION = "0.6.1";
  const TODAY = () => new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
  const TOPICS = ["币圈热门", "搞钱主意", "降本增效", "AI 获客", "上手敲门", "先发优势"];
  const LOCAL_DRAFTS = [
    { topic: "币圈热门", title: "行情越热，越要把注意力放回链上", body: "热搜给你情绪，链上数据才给你位置。\n\n今天别急着追涨，先看三个信号：交易所净流入有没有扩大、长期持有者是否松动、资金费率有没有连续过热。把这三个答案放在一起，再决定是进攻还是等待。\n\n真正的先手，不是比别人更快下单，而是比别人更早看见风险。#比特币 #链上数据" },
    { topic: "搞钱主意", title: "把一次研究，拆成一周能复用的内容资产", body: "同一份 BTC 周报，不该只发一次。\n\n先提炼一条结论做短帖，再把数据图做成看板截图，把判断过程改成长文，最后整理成社群问答。一次研究，变成 4 种内容、覆盖 3 个平台。\n\n搞钱不是持续制造新东西，而是让好东西被更多次看见。#内容复利 #AI运营" },
    { topic: "降本增效", title: "AI 运营最值钱的环节，不是代写，是减少返工", body: "运营团队最大的隐形成本，不是写得慢，而是方向错了以后整篇重来。\n\n先让 AI 一次给出 5 个角度，人只做选题判断；选中后再扩写、出图、适配平台。把人的时间留给事实核验和最后一公里表达。\n\n流程对了，效率自然会来。#降本增效 #AI工作流" },
    { topic: "AI 获客", title: "别让 AI 写“高级文案”，让它先回答客户为什么停留", body: "真正有效的获客内容只有三个动作：说中一个具体问题，给出一个能立刻执行的方法，再留下一个低门槛入口。\n\n少一点空泛趋势，多一点真实场景；少一点产品功能，多一点用户结果。AI 负责铺路，你负责留下可信的经验和证据。#AI获客 #内容增长" },
    { topic: "先发优势", title: "先发优势不是第一个发，而是第一个形成反馈闭环", body: "别人还在追热点时，你已经把“发现信号—生成草稿—人工审核—发布复盘”变成固定动作。\n\n真正拉开差距的不是偶尔爆一条，而是每天稳定产出、每周复盘数据、持续修正选题。工具会被复制，反馈速度不会。#先发优势 #运营系统" },
    { topic: "上手敲门", title: "今天就能上手的 AI 运营：从 15 分钟审核开始", body: "不用先搭一套复杂系统。今天只做一件事：让 AI 生成 5 条候选稿，你花 15 分钟删掉不真实的句子、补上自己的判断，然后亲自发布。\n\n先把人工审核跑顺，再谈自动化。可信，比速度更重要。#上手敲门 #人机协作" }
  ];
  const LOCAL_NEWS_DRAFTS = [
    { topic: "新闻主题", title: "一条加密新闻值不值得发，先看三层证据", body: "先确认原始公告是否存在，再核对事件发生时间和适用范围，最后区分事实、市场解读与个人推测。\n\n新闻内容的价值不是抢先转发，而是帮助读者更快知道：发生了什么、还缺什么信息、下一步该关注什么。发布前必须补上原始来源。#新闻核验 #内容运营" },
    { topic: "新闻主题", title: "热点出现时，先做时间线再写观点", body: "把公开信息按时间排序：官方公告、链上变化、市场反应、后续澄清。只写已经确认的事实，把尚未证实的部分明确标注为待核验。\n\n速度重要，但可信度决定内容能否长期复用。#热点观察 #事实核验" },
    { topic: "新闻主题", title: "新闻稿最有用的部分，是告诉读者下一步看什么", body: "不要只复述标题。补充事件影响的对象、可能变化的指标和后续确认节点，让读者知道该去哪里核对。\n\n不预测收益，不把短期价格波动包装成确定性结论。#新闻解读 #风险提示" }
  ];

  const state = loadState();
  let activeView = "pending";
  let activeSource = state.source || "ai";
  let activePlatform = state.platform || "weibo";
  let activePublishMode = state.publishMode || "browser-fill";
  let activeGenerationType = state.generationType || activeSource;
  let bridgeConnected = document.documentElement.dataset.welinkbtcExtension === "ready";
  let detectedExtensionVersion = document.documentElement.dataset.welinkbtcExtensionVersion || "";
  let searchTerm = "";
  let aiConfig = { configured: false };
  let materialItems = [];
  let currentLanguage = localStorage.getItem("welinkbtc-language") || "zh";
  let currentTheme = localStorage.getItem("welinkbtc-theme") || "dark";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const uiTranslator = window.WelinkUiTranslator?.create({
    roots: document.body,
    profile: "aiops",
    exclude: ".draft-title,.draft-body,.preview-post p"
  });

  function applyTheme() {
    document.body.dataset.theme = currentTheme;
    const label = currentTheme === "dark"
      ? (currentLanguage === "zh" ? "浅色" : "Light")
      : (currentLanguage === "zh" ? "深色" : "Dark");
    $$(".theme-toggle").forEach((button) => { button.textContent = label; });
  }

  function applyLanguage() {
    document.documentElement.lang = currentLanguage === "zh" ? "zh-CN" : "en";
    uiTranslator?.setLanguage(currentLanguage);
    $$(".lang-toggle").forEach((button) => { button.textContent = currentLanguage === "zh" ? "EN" : "中"; });
    applyTheme();
    renderPlatformCatalog();
  }

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        drafts: Array.isArray(parsed.drafts) ? parsed.drafts.map((draft, index) => ensureDraftModel({ sourceType: draft.sourceType || "ai", ...normalizeDraftImages(draft, index / 11) })) : [],
        platform: parsed.platform || "weibo",
        publishMode: parsed.publishMode || "browser-fill",
        source: parsed.source || "ai",
        generationType: parsed.generationType || parsed.source || "ai",
        platformReady: parsed.platformReady || null,
        publishLogs: Array.isArray(parsed.publishLogs) ? parsed.publishLogs.slice(0, 200) : []
      };
    } catch { return { drafts: [], platform: "weibo", publishMode: "browser-fill", source: "ai", generationType: "ai", platformReady: null, publishLogs: [] }; }
  }

  function persist(showFailure = false) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; }
    catch {
      if (showFailure) toast("保存失败", "浏览器本地空间不足。内容仍保留在当前页面，请先发布或废弃部分草稿。", "error");
      return false;
    }
  }

  function toast(title, message, type = "success", duration = 4200) {
    const item = document.createElement("div");
    item.className = `toast ${type}`;
    const icon = document.createElement("span"); icon.textContent = type === "error" ? "!" : type === "info" ? "i" : "✓";
    const copy = document.createElement("div"); const strong = document.createElement("strong"); const p = document.createElement("p");
    strong.textContent = title; p.textContent = message; copy.append(strong, p); item.append(icon, copy); $("#toast-stack").append(item);
    const alert = $("#ops-alert");
    if (type === "error" && alert) { $("strong", alert).textContent = title; $("span", alert).textContent = message; alert.hidden = false; }
    setTimeout(() => item.remove(), duration);
  }

  function makeId() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }
  function escapeXml(value) { return String(value).replace(/[<>&'\"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;" }[char])); }

  function localVisual(draft, seed = Math.random()) {
    const hue = Math.floor((seed * 240 + draft.title.length * 9) % 360);
    const accent = `hsl(${hue} 88% 66%)`;
    const words = draft.title.replace(/[，。！？：]/g, " ").split(/\s+/).filter(Boolean);
    const line1 = escapeXml((words[0] || draft.title).slice(0, 12));
    const line2 = escapeXml((words.slice(1).join(" ") || draft.topic).slice(0, 14));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#07100c"/><stop offset="1" stop-color="#101924"/></linearGradient><radialGradient id="r"><stop stop-color="${accent}" stop-opacity=".34"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs><rect width="1024" height="1024" fill="url(#g)"/><circle cx="780" cy="240" r="430" fill="url(#r)"/><g fill="none" stroke="${accent}" opacity=".28"><circle cx="780" cy="240" r="180"/><circle cx="780" cy="240" r="260"/><path d="M0 760L1024 360M0 850L1024 450M160 0V1024M260 0V1024"/></g><rect x="74" y="72" width="150" height="46" rx="23" fill="${accent}"/><text x="149" y="102" text-anchor="middle" fill="#07100c" font-family="Arial" font-size="20" font-weight="800">WELINKBTC</text><text x="74" y="642" fill="#fff" font-family="Arial,Microsoft YaHei" font-size="74" font-weight="800">${line1}</text><text x="74" y="728" fill="#fff" font-family="Arial,Microsoft YaHei" font-size="74" font-weight="800">${line2}</text><text x="76" y="792" fill="${accent}" font-family="Arial,Microsoft YaHei" font-size="30" font-weight="700">${escapeXml(draft.topic)} · AI CONTENT COPILOT</text><text x="76" y="938" fill="#7f9189" font-family="monospace" font-size="22">HUMAN REVIEW REQUIRED / 2026</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function createLocalImageSet(draft, seed = Math.random()) {
    const baseSeed = Number.isFinite(seed) ? seed : Math.random();
    draft.images = Array.from({ length: 3 }, (_, index) => localVisual(draft, (baseSeed + index * 0.271) % 1));
    draft.imageSources = ["local", "local", "local"];
    draft.selectedImageIndex = 0;
    draft.image = draft.images[0];
    draft.imageSource = "local";
    return draft;
  }

  function normalizeDraftImages(draft, seed = Math.random()) {
    const images = Array.isArray(draft.images) ? draft.images.filter((image) => typeof image === "string" && image).slice(0, 3) : [];
    if (!images.length && typeof draft.image === "string" && draft.image) images.push(draft.image);
    while (images.length < 3) images.push(localVisual(draft, (seed + images.length * 0.271) % 1));
    draft.images = images.slice(0, 3);
    draft.imageSources = Array.isArray(draft.imageSources)
      ? draft.imageSources.slice(0, 3)
      : [draft.imageSource || "local"];
    while (draft.imageSources.length < draft.images.length) draft.imageSources.push("local");
    draft.selectedImageIndex = Math.max(0, Math.min(draft.images.length - 1, Number(draft.selectedImageIndex) || 0));
    draft.image = draft.images[draft.selectedImageIndex];
    draft.imageSource = draft.imageSources[draft.selectedImageIndex] || "local";
    return draft;
  }

  function optimizeImageForStorage(dataUrl) {
    if (!dataUrl || dataUrl.startsWith("data:image/svg+xml")) return Promise.resolve(dataUrl);
    return new Promise((resolve) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        try {
          const size = 768;
          const canvas = document.createElement("canvas");
          canvas.width = size; canvas.height = size;
          const context = canvas.getContext("2d");
          context.fillStyle = "#0a0d0c"; context.fillRect(0, 0, size, size);
          context.drawImage(image, 0, 0, size, size);
          resolve(canvas.toDataURL("image/webp", 0.8));
        } catch { resolve(dataUrl); }
      };
      image.onerror = () => resolve(dataUrl);
      image.src = dataUrl;
    });
  }

  function counts() {
    const today = TODAY();
    return {
      generated: state.drafts.filter((d) => d.createdDate === today).length,
      pending: state.drafts.filter((d) => d.status === "pending").length,
      published: state.drafts.filter((d) => d.status === "published" && d.publishedDate === today).length,
      discarded: state.drafts.filter((d) => d.status === "discarded").length
    };
  }

  function refreshCounts() {
    const c = counts();
    $("#stat-generated").textContent = c.generated; $("#stat-pending").textContent = c.pending; $("#stat-published").textContent = c.published;
    const sourceCounts = {};
    for (const source of ["featured", "ai", "library", "news"]) {
      const drafts = state.drafts.filter((draft) => (draft.sourceType || "ai") === source);
      sourceCounts[source] = {
        pending: drafts.filter((draft) => draft.status === "pending").length,
        published: drafts.filter((draft) => draft.status === "published").length,
        discarded: drafts.filter((draft) => draft.status === "discarded").length
      };
      for (const status of ["pending", "published", "discarded"]) {
        const target = document.querySelector(`[data-source-count="${source}-${status}"]`);
        if (target) target.textContent = sourceCounts[source][status];
      }
    }
    const activeCounts = sourceCounts[activeSource] || { pending: 0, published: 0, discarded: 0 };
    $("#tab-pending-count").textContent = activeCounts.pending; $("#tab-published-count").textContent = activeCounts.published; $("#tab-discarded-count").textContent = activeCounts.discarded;
    updateCoreFlow(sourceCounts);
  }

  function filteredDrafts() {
    return state.drafts.filter((draft) => draft.status === activeView && (draft.sourceType || "ai") === activeSource && (!searchTerm || `${draft.title} ${draft.body}`.toLowerCase().includes(searchTerm)));
  }

  function platformAdapter() { return window.WelinkPlatformRegistry.get(activePlatform); }

  const MODE_LABELS = {
    "browser-fill": "Browser Fill",
    "intent-url": "Intent URL",
    "official-api": "官方 API",
    "copy-manual": "复制 + 人工发布"
  };
  const GENERATION_LABELS = { featured: "精选主题", ai: "AI 主题", library: "素材库主题", news: "新闻主题" };

  function markFlowStep(step, complete, optional = false) {
    const item = document.querySelector(`.core-flow-step[data-flow-step="${step}"]`);
    if (!item) return;
    item.classList.toggle("is-complete", Boolean(complete));
    item.classList.toggle("is-optional", Boolean(optional && !complete));
    const status = $(".flow-status", item);
    if (status) status.textContent = complete ? "已完成" : optional ? "可选校验" : "待完成";
  }

  function updateCoreFlow(sourceCounts) {
    if (!document.querySelector("#core-operations")) return;
    const adapter = platformAdapter();
    const installReady = bridgeConnected && detectedExtensionVersion === EXPECTED_EXTENSION_VERSION;
    const allSourceCounts = sourceCounts || Object.fromEntries(["featured", "ai", "library", "news"].map((source) => {
      const drafts = state.drafts.filter((draft) => (draft.sourceType || "ai") === source);
      return [source, { pending: drafts.filter((draft) => draft.status === "pending").length, published: drafts.filter((draft) => draft.status === "published").length, discarded: drafts.filter((draft) => draft.status === "discarded").length }];
    }));
    const selectedCounts = allSourceCounts[activeGenerationType] || { pending: 0, published: 0, discarded: 0 };
    const generated = selectedCounts.pending + selectedCounts.published + selectedCounts.discarded > 0;
    const platformReady = state.platformReady?.platformId === activePlatform && Boolean(state.platformReady?.ready);
    const previewed = (state.publishLogs || []).some((log) => log.platformId === activePlatform && ["browser-filled", "intent-opened", "copied-for-manual", "api-published"].includes(log.stage));
    const published = (allSourceCounts[activeSource]?.published || 0) > 0 || (state.publishLogs || []).some((log) => log.stage === "api-published");
    $("#extension-version-state").textContent = installReady ? `已安装最新版本 v${EXPECTED_EXTENSION_VERSION}` : bridgeConnected ? `检测到 v${detectedExtensionVersion || "未知"}，请更新至 v${EXPECTED_EXTENSION_VERSION}` : `未检测到 Chrome 发布助手 v${EXPECTED_EXTENSION_VERSION}`;
    $("#flow-platform-name").textContent = `已选择：${adapter.name}`;
    $("#flow-mode-name").textContent = MODE_LABELS[activePublishMode];
    $("#flow-generation-name").textContent = GENERATION_LABELS[activeGenerationType];
    $("#platform-ready-state").textContent = platformReady ? `${adapter.name}编辑页已确认` : `等待定位${adapter.name}发布编辑页`;
    $("#confirm-platform-ready").checked = platformReady;
    markFlowStep("install", installReady);
    markFlowStep("platform", Boolean(activePlatform));
    markFlowStep("mode", Boolean(activePublishMode));
    markFlowStep("chrome", platformReady);
    markFlowStep("generate", generated);
    markFlowStep("preview", previewed, true);
    markFlowStep("publish", published, true);
  }

  function extractHashtags(value) {
    return [...new Set((String(value || "").match(/#[^\s#，。！？、；;]+/g) || []).map((tag) => tag.trim()))];
  }

  function ensureDraftModel(draft) {
    draft.masterDraft = draft.masterDraft || { title: draft.title || "", body: draft.body || "", hashtags: extractHashtags(draft.body) };
    draft.title = draft.masterDraft.title || draft.title || "";
    draft.body = draft.masterDraft.body || draft.body || "";
    draft.masterDraft.hashtags = Array.isArray(draft.masterDraft.hashtags) ? draft.masterDraft.hashtags : extractHashtags(draft.body);
    draft.platformPosts = draft.platformPosts && typeof draft.platformPosts === "object" ? draft.platformPosts : {};
    draft.publishState = draft.publishState && typeof draft.publishState === "object" ? draft.publishState : {};
    return draft;
  }

  function localPlatformPost(draft, adapter = platformAdapter()) {
    ensureDraftModel(draft);
    return adapter.createPlatformPost(draft.masterDraft);
  }

  function platformPostFor(draft, adapter = platformAdapter()) {
    ensureDraftModel(draft);
    return draft.platformPosts[adapter.id] || localPlatformPost(draft, adapter);
  }

  async function adaptDraftForPlatform(draft, adapter = platformAdapter(), force = false) {
    ensureDraftModel(draft);
    if (!force && draft.platformPosts[adapter.id]) return draft.platformPosts[adapter.id];
    const response = await fetch("/api/ai-ops-adapt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platformId: adapter.id, draft: draft.masterDraft, imageCount: draft.images?.length || 0 })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.platformPost) throw new Error(data.error || "平台稿生成失败");
    draft.platformPosts[adapter.id] = { ...data.platformPost, adaptedFrom: draft.updatedAt || draft.createdAt, source: data.source || data.platformPost.source || "rules" };
    persist();
    return draft.platformPosts[adapter.id];
  }

  async function adaptDraftBatch(drafts, adapter = platformAdapter()) {
    const results = await Promise.allSettled(drafts.map((draft) => adaptDraftForPlatform(draft, adapter)));
    if (results.some((result) => result.status === "fulfilled")) render();
    return results;
  }

  function writePublishLog({ draft, stage, status = "success", message = "", publishUrl = "" }) {
    state.publishLogs = state.publishLogs || [];
    state.publishLogs.unshift({
      id: makeId(),
      createdAt: new Date().toISOString(),
      draftId: draft?.id || "",
      title: draft?.title || "",
      platformId: activePlatform,
      platformName: platformAdapter().name,
      mode: activePublishMode,
      stage,
      status,
      message,
      publishUrl
    });
    state.publishLogs = state.publishLogs.slice(0, 200);
    persist();
    renderPublishLog(); updateCoreFlow();
  }

  function renderPublishLog() {
    const list = $("#publish-log-list");
    const count = state.publishLogs?.length || 0;
    if ($("#publish-log-count")) $("#publish-log-count").textContent = count;
    if (!list) return;
    list.replaceChildren(...(state.publishLogs || []).map((log) => {
      const item = document.createElement("article"); item.className = "publish-log-item";
      const time = document.createElement("time"); time.textContent = new Date(log.createdAt).toLocaleString("zh-CN", { hour12: false });
      const copy = document.createElement("div"); const strong = document.createElement("strong"); const span = document.createElement("span");
      strong.textContent = `${log.platformName} · ${MODE_LABELS[log.mode] || log.mode} · ${log.title || "候选稿"}`;
      span.textContent = `${log.stage}${log.message ? ` · ${log.message}` : ""}`;
      copy.append(strong, span);
      const status = log.publishUrl ? document.createElement("a") : document.createElement("b");
      status.className = "publish-log-status"; status.textContent = log.publishUrl ? "查看发布" : log.status === "success" ? "已记录" : "需处理";
      if (log.publishUrl) { status.href = log.publishUrl; status.target = "_blank"; status.rel = "noopener noreferrer"; }
      item.append(time, copy, status); return item;
    }));
  }

  function renderPublishModeState() {
    const adapter = platformAdapter();
    const publishing = adapter.capabilities.publishing;
    $$('input[name="publish-mode"]').forEach((input) => {
      input.checked = input.value === activePublishMode;
      input.closest(".publish-mode-card")?.classList.toggle("is-active", input.checked);
    });
    const nativeSupport = publishing.supportedModes.includes(activePublishMode);
    const recommended = publishing.recommendedMode || "copy-manual";
    const summary = $("#publish-mode-summary");
    if (summary) summary.textContent = nativeSupport
      ? `${adapter.name} 已原生支持 ${MODE_LABELS[activePublishMode]}；Browser Fill 仍是通用优先选择。`
      : `${adapter.name} 暂未原生支持 ${MODE_LABELS[activePublishMode]}，执行时会安全降级为复制文案 + 人工发布。推荐：${MODE_LABELS[recommended]}。`;
  }

  function fillButtonLabel(adapter) {
    if (activePublishMode === "intent-url") return `通过 Intent URL 打开${adapter.shortName}`;
    if (activePublishMode === "official-api") return `确认后通过${adapter.shortName} API 发布`;
    if (activePublishMode === "copy-manual") return "复制文案并下载图片";
    return adapter.capabilities.publishing.browserFill ? `填充到${adapter.shortName}发布框` : `复制并打开${adapter.shortName}`;
  }

  async function copyPlatformPreview(text) {
    const value = String(text || "").replace(/\r\n?/g, "\n");
    if (!value) throw new Error("平台预览为空，暂时无法复制。");
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    if (!copied) throw new Error("浏览器未允许复制，请选中平台预览后手动复制。");
  }

  function render() {
    const list = $("#draft-list"); list.replaceChildren();
    const drafts = filteredDrafts();
    $("#empty-state").hidden = drafts.length > 0;
    if (!drafts.length) {
      const title = $("#empty-state h2"), text = $("#empty-state p");
      if (state.drafts.length && (activeView !== "pending" || searchTerm)) { title.textContent = searchTerm ? "没有找到匹配内容" : activeView === "published" ? "还没有已发布内容" : "废弃箱是空的"; text.textContent = searchTerm ? "换个关键词试试，或清空搜索条件。" : "完成相应操作后，内容会出现在这里。"; }
      else { title.textContent = "今天的内容，从一个好主题开始"; text.textContent = "点击「生成主题稿」，一次获得 5 条带平台预览和配图的候选内容。"; }
    }
    drafts.forEach((draft, index) => list.append(renderDraft(draft, index)));
    refreshCounts();
  }

  function renderDraft(draft, index) {
    const fragment = $("#draft-template").content.cloneNode(true); const card = $(".draft-card", fragment); const adapter = platformAdapter();
    normalizeDraftImages(draft, index / 7); ensureDraftModel(draft);
    const platformPost = platformPostFor(draft, adapter);
    card.dataset.id = draft.id; card.dataset.status = draft.status;
    updateImageCard(draft, card); $(".topic-badge", card).textContent = draft.topic; $(".source-badge", card).textContent = draft.sourceType === "featured" ? "精选主题" : draft.sourceType === "library" ? "素材库主题" : draft.sourceType === "news" ? "新闻主题" : "AI 生成"; $(".draft-id", card).textContent = `#${String(state.drafts.indexOf(draft) + 1).padStart(2, "0")}`;
    $("time", card).textContent = new Date(draft.updatedAt || draft.createdAt).toLocaleString("zh-CN", { hour12: false });
    $(".draft-title", card).value = draft.title; $(".draft-body", card).value = draft.body; $(".char-count", card).textContent = draft.body.length;
    $(".preview-platform", card).textContent = `${adapter.name} · ${platformPost.source === "openai" ? "AI 平台稿" : "规则平台稿"}`; $(".preview-post p", card).textContent = adapter.preview(platformPost);
    $(".fill-platform", card).textContent = fillButtonLabel(adapter);
    const badge = $(".state-badge", card); badge.textContent = draft.status === "published" ? "已发布" : draft.status === "discarded" ? "已废弃" : "待审核";
    if (draft.status !== "pending") {
      $$("input,textarea", card).forEach((field) => field.disabled = true);
      $$(".save-draft,.discard-draft,.fill-platform,.mark-published,.human-check,.regen-image", card).forEach((element) => element.hidden = true);
    }
    const updatePreview = () => {
      const temp = { ...draft, title: $(".draft-title", card).value.trim(), body: $(".draft-body", card).value.trim() };
      const tempPost = adapter.createPlatformPost({ title: temp.title, body: temp.body, hashtags: extractHashtags(temp.body) });
      $(".preview-post p", card).textContent = adapter.preview(tempPost); $(".preview-platform", card).textContent = `${adapter.name} · 待保存适配`; $(".char-count", card).textContent = temp.body.length;
    };
    $(".draft-title", card).addEventListener("input", updatePreview); $(".draft-body", card).addEventListener("input", updatePreview);
    $(".save-draft", card).addEventListener("click", () => saveCard(card, draft));
    $(".discard-draft", card).addEventListener("click", () => changeStatus(draft, "discarded"));
    $(".mark-published", card).addEventListener("click", () => changeStatus(draft, "published"));
    $(".regen-image", card).addEventListener("click", (event) => regenerateImage(draft, event.currentTarget, card));
    $(".image-prev", card).addEventListener("click", () => selectDraftImage(draft, draft.selectedImageIndex - 1, card));
    $(".image-next", card).addEventListener("click", () => selectDraftImage(draft, draft.selectedImageIndex + 1, card));
    let touchStartX = 0; let suppressPreview = false;
    $(".image-preview-trigger", card).addEventListener("touchstart", (event) => { touchStartX = event.changedTouches[0]?.clientX || 0; }, { passive: true });
    $(".image-preview-trigger", card).addEventListener("touchend", (event) => {
      const delta = (event.changedTouches[0]?.clientX || 0) - touchStartX;
      if (Math.abs(delta) < 36) return;
      suppressPreview = true;
      selectDraftImage(draft, draft.selectedImageIndex + (delta < 0 ? 1 : -1), card);
      setTimeout(() => { suppressPreview = false; }, 350);
    }, { passive: true });
    $(".image-preview-trigger", card).addEventListener("click", () => { if (!suppressPreview) openImagePreview(draft, card); });
    $(".copy-preview", card).addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const temp = { ...draft, title: $(".draft-title", card).value.trim(), body: $(".draft-body", card).value.trim() };
      try {
        const unchanged = temp.title === draft.title && temp.body === draft.body;
        const copyPost = unchanged ? platformPostFor(draft, adapter) : adapter.createPlatformPost({ title: temp.title, body: temp.body, hashtags: extractHashtags(temp.body) });
        await copyPlatformPreview(adapter.preview(copyPost));
        button.classList.add("is-copied");
        button.textContent = currentLanguage === "zh" ? "已复制" : "Copied";
        toast(
          currentLanguage === "zh" ? "平台文稿已复制" : "Platform draft copied",
          currentLanguage === "zh" ? "标题、正文、空行和标签格式已完整复制，可以直接粘贴到发布框。" : "Title, body, blank lines, and hashtags were copied with their formatting.",
          "success"
        );
        setTimeout(() => { button.classList.remove("is-copied"); button.textContent = currentLanguage === "zh" ? "一键复制" : "Copy"; }, 1800);
      } catch (error) { toast("复制失败", error.message || "请检查浏览器剪贴板权限。", "error"); }
    });
    $(".fill-platform", card).addEventListener("click", () => executePublishing(draft, card));
    return fragment;
  }

  function updateImageCard(draft, card) {
    normalizeDraftImages(draft);
    const current = draft.selectedImageIndex;
    $(".draft-media img", card).src = draft.images[current];
    $(".image-page-current", card).textContent = String(current + 1);
    $(".image-page-total", card).textContent = String(draft.images.length);
    $(".image-prev", card).disabled = draft.images.length < 2;
    $(".image-next", card).disabled = draft.images.length < 2;
    const source = draft.imageSources[current] || "local";
    $(".image-state", card).textContent = `${source === "ai" ? "AI" : "LOCAL"} VISUAL · ${current + 1}/${draft.images.length}`;
  }

  function selectDraftImage(draft, requestedIndex, card) {
    normalizeDraftImages(draft);
    const total = draft.images.length;
    draft.selectedImageIndex = ((requestedIndex % total) + total) % total;
    draft.image = draft.images[draft.selectedImageIndex];
    draft.imageSource = draft.imageSources[draft.selectedImageIndex] || "local";
    draft.updatedAt = new Date().toISOString();
    updateImageCard(draft, card); persist(true);
  }

  function openImagePreview(draft, card) {
    const dialog = $("#image-preview-dialog");
    const source = $(".draft-media img", card).src || draft.image;
    $("#image-preview-full").src = source;
    $("#image-preview-title").textContent = draft.title || "候选稿配图";
    const download = $("#image-preview-download");
    download.href = source;
    download.download = `welinkbtc-${draft.id || "draft"}.png`;
    dialog.showModal();
  }

  function readCard(card, draft) {
    return { ...draft, title: $(".draft-title", card).value.trim(), body: $(".draft-body", card).value.trim(), updatedAt: new Date().toISOString() };
  }

  function saveCard(card, draft, quiet = false) {
    const next = readCard(card, draft);
    if (!next.title || !next.body) { toast("无法保存", "标题和正文都不能为空。", "error"); return null; }
    const changed = next.title !== draft.title || next.body !== draft.body;
    Object.assign(draft, next);
    draft.masterDraft = { title: next.title, body: next.body, hashtags: extractHashtags(next.body) };
    if (changed) draft.platformPosts = {};
    card.classList.add("is-saving"); setTimeout(() => card.classList.remove("is-saving"), 450); persist(true);
    if (!quiet) {
      toast("主草稿已保存", "正在按当前平台规则重新生成平台稿。", "success");
      adaptDraftForPlatform(draft, platformAdapter(), true).then(render).catch((error) => toast("平台稿使用规则适配", error.message, "info"));
    }
    return draft;
  }

  function changeStatus(draft, status) {
    draft.status = status; draft.updatedAt = new Date().toISOString();
    if (status === "published") {
      draft.publishedAt = draft.updatedAt; draft.publishedDate = TODAY();
      writePublishLog({ draft, stage: "marked-published", message: "用户已在平台完成发送并手动标记" });
      toast("已标记为发布", "今日已发数量与 PublishLog 已更新。系统没有替你点击平台发送。", "success");
    }
    else toast("草稿已废弃", "内容已移入废弃箱，可通过清空演示数据彻底移除。", "info");
    persist(true); render();
  }

  function downloadDraftImages(draft) {
    const images = (draft.images || []).slice(0, 3);
    images.forEach((source, index) => {
      const link = document.createElement("a");
      link.href = source; link.download = `welinkbtc-${draft.id}-${index + 1}.png`; link.style.display = "none";
      document.body.append(link); link.click(); link.remove();
    });
    return images.length;
  }

  async function executePublishing(draft, card) {
    const confirmed = $(".human-check input", card).checked;
    if (!confirmed) { toast("请先完成人工确认", `勾选“我已确认平台登录”，再执行 ${MODE_LABELS[activePublishMode]}。`, "error"); return; }
    const saved = saveCard(card, draft, true); if (!saved) return;
    const adapter = platformAdapter();
    const button = $(".fill-platform", card); button.disabled = true; button.textContent = `正在准备 ${MODE_LABELS[activePublishMode]}…`;
    try {
      const platformPost = await adaptDraftForPlatform(saved, adapter);
      const validation = adapter.validate(platformPost, saved.images?.length || 0);
      if (!validation.valid) throw new Error(validation.errors.join("；"));
      const supported = adapter.capabilities.publishing.supportedModes.includes(activePublishMode);
      if (!supported) {
        await adapter.copy(platformPost); const downloaded = downloadDraftImages(saved); await adapter.open();
        writePublishLog({ draft: saved, stage: "safe-fallback", message: `${MODE_LABELS[activePublishMode]} 不受支持，已降级复制文案并下载 ${downloaded} 张图片` });
        toast("已安全降级为人工发布", `${adapter.name}暂不原生支持所选方式；文案已复制、${downloaded} 张图片已下载。请人工发布。`, "info", 7000);
      } else if (activePublishMode === "browser-fill") {
        const result = await adapter.fill({ ...saved, ...platformPost, title: platformPost.title || saved.title, body: platformPost.body, text: platformPost.text });
        const uploadedCount = Number(result.imageUploadedCount) || Math.min(3, saved.images?.length || 0);
        writePublishLog({ draft: saved, stage: "browser-filled", message: `已填充文字并提交 ${uploadedCount} 张图片，等待真人发送` });
        toast("已填入发布框", `平台稿和 ${uploadedCount} 张图片已交给${adapter.name}编辑页。请检查后由你亲自点击发送。`, "success", 6000);
      } else if (activePublishMode === "intent-url") {
        const url = adapter.buildIntentUrl(platformPost);
        if (!url) throw new Error(`${adapter.name}没有可用的 Intent URL。`);
        const opened = window.open(url, "_blank", "noopener,noreferrer");
        if (!opened) throw new Error("浏览器阻止了新窗口，请允许弹窗后重试。");
        writePublishLog({ draft: saved, stage: "intent-opened", message: "已把纯文本交给平台 Intent，等待真人确认" });
        toast("Intent 已打开", `已唤起${adapter.name}纯文本发布页。图片不会自动附加，请检查后人工发送。`, "success", 6500);
      } else if (activePublishMode === "official-api") {
        const response = await fetch("/api/ai-ops-publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmed: true, platformId: adapter.id, platformPost, imageCount: saved.images?.length || 0 }) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) throw new Error(data.error || "平台官方 API 发布失败");
        draft.publishState[adapter.id] = { mode: activePublishMode, publishUrl: data.publishUrl || "", externalId: data.externalId || "", preparedAt: new Date().toISOString() };
        writePublishLog({ draft: saved, stage: "api-published", message: `${data.provider} 已返回成功结果`, publishUrl: data.publishUrl || "" });
        toast("官方 API 已完成", `${adapter.name}已返回成功结果。请核对平台内容，再点击“标记已发布”。`, "success", 7000);
      } else {
        await adapter.copy(platformPost); const downloaded = downloadDraftImages(saved);
        writePublishLog({ draft: saved, stage: "copied-for-manual", message: `文案已复制，已下载 ${downloaded} 张图片，等待人工发布` });
        toast("人工发布素材已准备", `完整平台文案已复制，${downloaded} 张图片已下载。请前往 App 发布后回来标记已发布。`, "success", 7000);
      }
      if (validation.warnings.length) toast("平台规则提醒", validation.warnings.join("；"), "info", 6000);
    } catch (error) {
      writePublishLog({ draft: saved, stage: "publish-action-failed", status: "error", message: error.message || "发布动作失败" });
      toast("发布准备失败", error.message || "请确认平台配置、扩展和目标页面均可用。", "error", 7000);
    }
    finally { button.disabled = false; button.textContent = fillButtonLabel(adapter); }
  }

  async function regenerateImage(draft, button, card) {
    button.disabled = true; button.textContent = "AI 正在生成 3 张…"; $(".image-state", card).textContent = "GENERATING · 0/3";
    const requests = Array.from({ length: 3 }, async (_, variation) => {
      const response = await fetch("/api/ai-ops-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: draft.title, body: draft.body, topic: draft.topic, variation: variation + 1 }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.image) throw new Error(data.error || "图片服务暂时不可用");
      return optimizeImageForStorage(data.image);
    });
    try {
      const results = await Promise.allSettled(requests);
      const aiImages = results.filter((result) => result.status === "fulfilled").map((result) => result.value).filter(Boolean).slice(0, 3);
      const localImages = Array.from({ length: 3 - aiImages.length }, (_, index) => localVisual(draft, (Math.random() + index * 0.271) % 1));
      draft.images = [...aiImages, ...localImages];
      draft.imageSources = [...aiImages.map(() => "ai"), ...localImages.map(() => "local")];
      draft.selectedImageIndex = 0; draft.image = draft.images[0]; draft.imageSource = draft.imageSources[0]; draft.updatedAt = new Date().toISOString();
      updateImageCard(draft, card); persist(true);
      if (aiImages.length) toast("配图已更新", `已生成 ${aiImages.length} 张 AI 图，并补齐到 3 张候选图。左右滑动即可选择。`, "success");
      else toast("已生成本地视觉稿", "AI 图片服务暂时不可用，已生成 3 张本地品牌视觉图。", "info");
    } catch (error) {
      createLocalImageSet(draft, Math.random()); updateImageCard(draft, card); persist();
      toast("图片生成失败", `${error.message || "图片服务暂时不可用"}，已改用 3 张本地品牌视觉图。`, "error");
    } finally { button.disabled = false; button.textContent = "↻ 重新生成 3 张"; updateImageCard(draft, card); }
  }

  async function loadAiConfig() {
    try {
      const response = await fetch("/api/ai-ops-config", { headers: { Accept: "application/json" } });
      const data = await response.json();
      aiConfig = data.openai || { configured: false };
    } catch { aiConfig = { configured: false }; }
    const configured = Boolean(aiConfig.configured);
    $("#api-status").textContent = configured ? "实时 AI" : "演示模式";
    $("#api-dot").classList.toggle("offline", !configured);
    $("#ai-setup-dot").classList.toggle("offline", !configured);
    $("#ai-setup-title").textContent = configured ? "OpenAI 已安全连接" : "尚未配置 OPENAI_API_KEY";
    $("#ai-setup-copy").textContent = configured
      ? `实时成稿：${aiConfig.textModel} · 实时出图：${aiConfig.imageModel}`
      : "配置生产环境变量后会自动启用；密钥不会发送到浏览器。";
  }

  function setActiveSource(source, { openDrawer = true } = {}) {
    if (!["featured", "ai", "library", "news"].includes(source)) return;
    activeSource = source; activeGenerationType = source; state.source = source; state.generationType = source; activeView = "pending"; persist();
    $$(".source-tabs button").forEach((button) => button.classList.toggle("active", button.dataset.source === source));
    $("#generation-type").value = source;
    const generate = $("#generate-drafts");
    generate.textContent = source === "featured" ? "生成精选主题" : source === "library" ? "打开素材库" : source === "news" ? "生成新闻主题" : "生成 AI 主题";
    $(".featured-select").hidden = source !== "featured";
    $(".topic-select").hidden = source !== "ai";
    $(".count-select").hidden = !["ai", "news"].includes(source);
    $("#generation-help").textContent = source === "featured" ? "从链上看板、AlphaOps 和 Alpha Radar 拉取实时指标生成精选候选稿。" : source === "library" ? "打开素材库抓取或导入公开素材，再由 AI 润色为候选稿。" : source === "news" ? "从实时公开热榜提炼新闻主题，保留来源并在发布前人工核验。" : "先生成平台无关的主草稿，再按当前平台规则生成可发布版本。";
    setActiveViewButton(); render();
    if (source === "library" && openDrawer) openLibrary();
  }

  function openLibrary() {
    $("#material-drawer").classList.add("is-open");
    $("#material-drawer").setAttribute("aria-hidden", "false");
    $("#library-backdrop").hidden = false;
    document.body.classList.add("drawer-open");
    setTimeout(() => $("#library-source").focus(), 50);
  }

  function closeLibrary() {
    $("#material-drawer").classList.remove("is-open");
    $("#material-drawer").setAttribute("aria-hidden", "true");
    $("#library-backdrop").hidden = true;
    document.body.classList.remove("drawer-open");
  }

  function updateLibraryFields() {
    const source = $("#library-source").value;
    $$('[data-library-field]').forEach((field) => { field.hidden = true; });
    if (source === "x-account") $('[data-library-field="account"]').hidden = false;
    if (source === "x-hot") $('[data-library-field="query"]').hidden = false;
    if (source === "manual") {
      $('[data-library-field="platform"]').hidden = false;
      $('[data-library-field="manual"]').hidden = false;
    }
    $("#library-days").disabled = !["x-account"].includes(source);
    $("#library-notice").textContent = source === "binance-hot"
      ? "币安广场没有稳定公开的内容读取接口；系统会引导你切换到手动导入，不调用未公开接口。"
      : source === "manual" ? "手动粘贴公开素材，不会读取剪贴板或本机文件。" : "实时结果只用于选题研究，导入前请核对来源与时间。";
  }

  function materialMetric(item) {
    const metrics = item.metrics || {};
    if (Number.isFinite(metrics.hot)) return `热度 ${Number(metrics.hot).toLocaleString("zh-CN")}`;
    const parts = [];
    if (Number.isFinite(metrics.like_count)) parts.push(`赞 ${metrics.like_count}`);
    if (Number.isFinite(metrics.retweet_count)) parts.push(`转 ${metrics.retweet_count}`);
    if (Number.isFinite(metrics.reply_count)) parts.push(`评 ${metrics.reply_count}`);
    return parts.join(" · ") || "公开素材";
  }

  function renderMaterials() {
    const list = $("#material-result-list"); list.replaceChildren();
    materialItems.forEach((item, index) => {
      const article = document.createElement("article"); article.className = "material-item"; article.dataset.index = String(index);
      const check = document.createElement("input"); check.type = "checkbox"; check.checked = Boolean(item.selected); check.setAttribute("aria-label", `选择素材 ${index + 1}`);
      const copy = document.createElement("div"); const head = document.createElement("header"); const account = document.createElement("strong"); const metric = document.createElement("span");
      account.textContent = item.account || item.platform; metric.textContent = materialMetric(item); head.append(account, metric);
      const text = document.createElement("p"); text.textContent = item.text;
      const footer = document.createElement("footer"); const time = document.createElement("span"); time.textContent = item.createdAt ? new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false }) : "时间未知"; footer.append(time);
      if (item.url) { const link = document.createElement("a"); link.href = item.url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = "查看原文 ↗"; footer.append(link); }
      copy.append(head, text, footer); article.append(check, copy); list.append(article);
      check.addEventListener("change", () => { item.selected = check.checked; updateMaterialSelection(); });
    });
    updateMaterialSelection();
  }

  function updateMaterialSelection() {
    const selected = materialItems.filter((item) => item.selected).length;
    $("#material-selected-count").textContent = `已选 ${selected} 条`;
    $("#import-materials").disabled = selected === 0;
  }

  async function fetchLibrary() {
    const button = $("#fetch-library"); button.disabled = true; button.textContent = "正在抓取公开信息…";
    const source = $("#library-source").value;
    const body = {
      source,
      account: $("#library-account").value,
      query: $("#library-query").value,
      days: Number($("#library-days").value),
      limit: Number($("#library-limit").value),
      platform: $("#library-manual-platform").value,
      manualText: $("#library-manual-text").value
    };
    try {
      const response = await fetch("/api/ai-ops-library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(data.items)) throw new Error(data.error || "素材源没有返回有效内容");
      materialItems = data.items.map((item) => ({ ...item, selected: false }));
      $("#material-result-meta").textContent = `${data.meta?.provider || "公开来源"} · 抓取 ${data.meta?.fetched ?? materialItems.length} 条 · 展示 ${materialItems.length} 条`;
      renderMaterials();
      toast("素材抓取完成", `已载入 ${materialItems.length} 条公开素材，请选择后生成候选稿。`, "success");
    } catch (error) {
      materialItems = []; renderMaterials(); $("#material-result-meta").textContent = "抓取未完成";
      toast("素材抓取失败", error.message, "error", 7000);
      if (source === "binance-hot") { $("#library-source").value = "manual"; updateLibraryFields(); }
    } finally { button.disabled = false; button.textContent = source === "manual" ? "导入素材" : "开始实时抓取"; }
  }

  function makeDraftFromData(item, sourceType, image) {
    const now = new Date().toISOString();
    const draft = {
      id: makeId(), topic: item.topic || (sourceType === "featured" ? "链上精选" : "素材库"), title: item.title || "待完善的主题", body: item.body || "请补充正文。",
      sourceType, sourceMeta: item.sourceMeta || null, status: "pending", createdAt: now, updatedAt: now, createdDate: TODAY(), imageSource: image ? "snapshot" : "local"
    };
    ensureDraftModel(draft);
    createLocalImageSet(draft, Math.random());
    if (image) { draft.images[0] = image; draft.imageSources[0] = "snapshot"; draft.image = image; draft.imageSource = "snapshot"; }
    return draft;
  }

  async function polishMaterial(material) {
    const response = await fetch("/api/ai-ops-polish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ material }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.draft) throw new Error(data.error || "AI 没有返回有效候选稿");
    return { ...data.draft, sourceMeta: material };
  }

  async function importMaterials() {
    const selected = materialItems.filter((item) => item.selected).slice(0, 5);
    if (!selected.length) return;
    const button = $("#import-materials"); button.disabled = true; button.textContent = `正在生成 0 / ${selected.length}`;
    const created = [];
    for (let index = 0; index < selected.length; index += 1) {
      try {
        const polished = await polishMaterial(selected[index]);
        created.push(makeDraftFromData(polished, "library", selected[index].image));
      } catch (error) { toast(`第 ${index + 1} 条素材未导入`, error.message, "error"); }
      button.textContent = `正在生成 ${index + 1} / ${selected.length}`;
    }
    if (created.length) {
      state.drafts.unshift(...created); persist(true); setActiveSource("library", { openDrawer: false }); closeLibrary(); render();
      toast("素材候选稿已生成", `已生成 ${created.length} 条可编辑候选稿，原始来源已保留供核对。`, "success");
      adaptDraftBatch(created);
      if (aiConfig.configured) upgradeImages(created);
    }
    button.disabled = false; button.textContent = "AI 润色并生成候选稿"; updateMaterialSelection();
  }

  function costBasisSnapshotVisual(payload) {
    const canvas = document.createElement("canvas"); canvas.width = 1600; canvas.height = 900; const ctx = canvas.getContext("2d");
    const series = (payload.series || []).filter((row) => Number.isFinite(row.price) && Number.isFinite(row.sth) && Number.isFinite(row.tmmp)).slice(-365);
    const snapshot = payload.snapshot || {}; const colors = { bg: "#07100c", grid: "#213128", price: "#f5f7f3", sth: "#6ffc92", tmmp: "#8d7cff", muted: "#91a099" };
    const gradient = ctx.createLinearGradient(0, 0, 1600, 900); gradient.addColorStop(0, "#07100c"); gradient.addColorStop(1, "#101722"); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1600, 900);
    ctx.fillStyle = colors.sth; ctx.font = "800 24px Arial"; ctx.fillText("WELINKBTC · ON-CHAIN FULLSCREEN SNAPSHOT", 70, 64);
    ctx.fillStyle = colors.price; ctx.font = "800 48px Arial"; ctx.fillText("BTC Cost Basis Cycle Monitor", 70, 126);
    ctx.fillStyle = colors.muted; ctx.font = "24px Arial"; ctx.fillText(`On-chain ${snapshot.onchainAsOf || "--"} · Generated ${new Date().toLocaleString("zh-CN", { hour12: false })}`, 70, 170);
    const left = 90, top = 240, width = 1420, height = 500;
    ctx.strokeStyle = colors.grid; ctx.lineWidth = 1; for (let i = 0; i <= 5; i += 1) { const y = top + (height * i) / 5; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + width, y); ctx.stroke(); }
    const values = series.flatMap((row) => [row.price, row.sth, row.tmmp]); const min = Math.min(...values) * .9; const max = Math.max(...values) * 1.08;
    const draw = (key, color) => { ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.beginPath(); series.forEach((row, index) => { const x = left + (index / Math.max(series.length - 1, 1)) * width; const y = top + (1 - (row[key] - min) / Math.max(max - min, 1)) * height; if (index) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke(); };
    draw("price", colors.price); draw("sth", colors.sth); draw("tmmp", colors.tmmp);
    const money = (value) => Number.isFinite(Number(value)) ? `$${Math.round(Number(value)).toLocaleString("en-US")}` : "--";
    const metrics = [["BTC PRICE", money(snapshot.price), colors.price], ["STH COST BASIS", money(snapshot.sth), colors.sth], ["TRUE MARKET MEAN", money(snapshot.tmmp), colors.tmmp], ["STH − TMMP", money(snapshot.gap), snapshot.deathCrossActive ? "#ff6b6b" : colors.sth]];
    metrics.forEach(([label, value, color], index) => { const x = 90 + index * 370; ctx.fillStyle = colors.muted; ctx.font = "700 18px Arial"; ctx.fillText(label, x, 810); ctx.fillStyle = color; ctx.font = "800 34px Arial"; ctx.fillText(value, x, 855); });
    return canvas.toDataURL("image/webp", .9);
  }

  function trendSnapshotVisual({ title, subtitle, series, lines, metrics = [] }) {
    const canvas = document.createElement("canvas"); canvas.width = 1600; canvas.height = 900; const ctx = canvas.getContext("2d");
    const rows = (series || []).slice(-365); const colors = { bg: "#07100c", grid: "#213128", ink: "#f5f7f3", green: "#6ffc92", muted: "#91a099" };
    const gradient = ctx.createLinearGradient(0, 0, 1600, 900); gradient.addColorStop(0, colors.bg); gradient.addColorStop(1, "#111827"); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1600, 900);
    ctx.fillStyle = colors.green; ctx.font = "800 24px Arial"; ctx.fillText("WELINKBTC · LIVE RESEARCH SNAPSHOT", 70, 64);
    ctx.fillStyle = colors.ink; ctx.font = "800 46px Arial"; ctx.fillText(title, 70, 124);
    ctx.fillStyle = colors.muted; ctx.font = "22px Arial"; ctx.fillText(`${subtitle} · ${new Date().toLocaleString("zh-CN", { hour12: false })}`, 70, 166);
    const left = 90, top = 230, width = 1420, height = 500;
    ctx.strokeStyle = colors.grid; ctx.lineWidth = 1; for (let index = 0; index <= 5; index += 1) { const y = top + height * index / 5; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + width, y); ctx.stroke(); }
    const values = rows.flatMap((row) => lines.map((line) => Number(row[line.key]))).filter(Number.isFinite); const min = Math.min(...values); const max = Math.max(...values); const margin = Math.max((max - min) * .1, Math.abs(max) * .03, .01);
    lines.forEach((line) => { ctx.strokeStyle = line.color; ctx.lineWidth = 5; ctx.beginPath(); let started = false; rows.forEach((row, index) => { const value = Number(row[line.key]); if (!Number.isFinite(value)) return; const x = left + index / Math.max(rows.length - 1, 1) * width; const y = top + (1 - (value - (min - margin)) / Math.max(max - min + margin * 2, .0001)) * height; if (started) ctx.lineTo(x, y); else { ctx.moveTo(x, y); started = true; } }); ctx.stroke(); });
    lines.forEach((line, index) => { ctx.fillStyle = line.color; ctx.fillRect(90 + index * 280, 755, 28, 5); ctx.fillStyle = colors.muted; ctx.font = "700 16px Arial"; ctx.fillText(line.label, 128 + index * 280, 762); });
    metrics.slice(0, 4).forEach((metric, index) => { const x = 90 + index * 370; ctx.fillStyle = colors.muted; ctx.font = "700 16px Arial"; ctx.fillText(metric.label, x, 815); ctx.fillStyle = metric.color || colors.ink; ctx.font = "800 30px Arial"; ctx.fillText(String(metric.value), x, 858); });
    return canvas.toDataURL("image/webp", .9);
  }

  function rankedSnapshotVisual(title, subtitle, items) {
    const canvas = document.createElement("canvas"); canvas.width = 1600; canvas.height = 900; const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 1600, 900); gradient.addColorStop(0, "#07100c"); gradient.addColorStop(1, "#151427"); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1600, 900);
    ctx.fillStyle = "#6ffc92"; ctx.font = "800 24px Arial"; ctx.fillText("WELINKBTC · LIVE RADAR SNAPSHOT", 70, 64); ctx.fillStyle = "#f5f7f3"; ctx.font = "800 48px Arial"; ctx.fillText(title, 70, 128); ctx.fillStyle = "#91a099"; ctx.font = "22px Arial"; ctx.fillText(`${subtitle} · ${new Date().toLocaleString("zh-CN", { hour12: false })}`, 70, 170);
    items.slice(0, 5).forEach((item, index) => { const y = 220 + index * 125; ctx.fillStyle = "rgba(255,255,255,.045)"; ctx.fillRect(70, y, 1460, 100); ctx.fillStyle = "#6ffc92"; ctx.font = "800 24px Arial"; ctx.fillText(String(index + 1).padStart(2, "0"), 95, y + 42); ctx.fillStyle = "#f5f7f3"; ctx.font = "800 28px Arial"; ctx.fillText(String(item.title || item.name || item.symbol || "Signal").slice(0, 34), 170, y + 42); ctx.fillStyle = "#91a099"; ctx.font = "19px Arial"; ctx.fillText(String(item.detail || item.note || item.reason || "").replace(/\s+/g, " ").slice(0, 95), 170, y + 76); ctx.fillStyle = item.color || "#8d7cff"; ctx.font = "800 24px Arial"; ctx.textAlign = "right"; ctx.fillText(String(item.scoreLabel || item.score || "LIVE"), 1480, y + 58); ctx.textAlign = "left"; });
    return canvas.toDataURL("image/webp", .9);
  }

  const money = (value) => Number.isFinite(Number(value)) ? `$${Math.round(Number(value)).toLocaleString("en-US")}` : "--";
  const decimal = (value, digits = 3) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "--";

  async function fetchFeaturedJson(path) {
    const response = await fetch(path, { headers: { Accept: "application/json" } }); const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || payload.error || `${path} 暂不可用`);
    return payload;
  }

  async function buildFeaturedCandidate(source) {
    if (source === "cost-basis" || source === "sth-ratio") {
      const payload = await fetchFeaturedJson("/api/cost-basis"); const snapshot = payload.snapshot; const ratio = payload.ratioSnapshot;
      if (!snapshot || !payload.series?.length) throw new Error("链上成本基础暂不可用");
      if (source === "cost-basis") {
        const status = snapshot.deathCrossActive ? "STH 成本线位于 True Market Mean 下方，近期筹码仍处于承压区。" : "STH 成本线位于 True Market Mean 上方，短期筹码尚未进入死亡交叉状态。";
        return { material: { platform: "链上看板", account: "BTC Cost Basis Cycle Monitor", createdAt: snapshot.onchainAsOf, topic: "链上精选", title: snapshot.deathCrossActive ? "BTC 短期持有者成本继续承压" : "BTC 成本基础仍守在关键均线之上", text: `链上状态：截至 ${snapshot.onchainAsOf}，BTC 价格 ${money(snapshot.price)}，STH Cost Basis ${money(snapshot.sth)}，True Market Mean ${money(snapshot.tmmp)}，差值 ${money(snapshot.gap)}。${status}\n\nWhy It Matters：STH Realized Price 代表近 155 天移动过的比特币平均成本，TMMP 刻画活跃投资者真实市场均价。两条成本线的相对位置用于观察近期筹码压力和周期洗盘阶段，但不应单独作为买卖信号。`, url: `${location.origin}/dashboard#cost-basis-panel` }, image: costBasisSnapshotVisual(payload) };
      }
      return { material: { platform: "链上看板", account: "STH-RP / TMMP Ratio", createdAt: ratio.onchainAsOf, topic: "链上精选", title: `STH/TMMP 比例来到 ${decimal(ratio.current, 4)}`, text: `链上状态：STH-RP/TMMP 当前比例 ${decimal(ratio.current, 4)}，7 日均值 ${decimal(ratio.average7, 4)}，30 日均值 ${decimal(ratio.average30, 4)}，趋势 ${ratio.trend}，距离 0.75 历史观察线 ${decimal(ratio.distanceToThreshold, 4)}。\n\nWhy It Matters：比例低于 1 代表短期筹码成本低于活跃投资者真实均价；接近 0.75 时通常意味着更深的去杠杆与换手阶段，但仍需结合流动性、矿工压力和现货需求确认。`, url: `${location.origin}/dashboard#sth-ratio-panel` }, image: trendSnapshotVisual({ title: "BTC STH-RP / TMMP Ratio", subtitle: `On-chain ${ratio.onchainAsOf}`, series: payload.series.map((row) => ({ ...row, ratio: row.sth / row.tmmp })), lines: [{ key: "ratio", label: "STH-RP / TMMP", color: "#6ffc92" }], metrics: [{ label: "CURRENT", value: decimal(ratio.current, 4) }, { label: "7D AVG", value: decimal(ratio.average7, 4) }, { label: "30D AVG", value: decimal(ratio.average30, 4) }, { label: "0.75 DISTANCE", value: decimal(ratio.distanceToThreshold, 4), color: "#8d7cff" }] }) };
    }
    if (source === "realized-profit-loss") {
      const payload = await fetchFeaturedJson("/api/realized-profit-loss"); const snapshot = payload.snapshot; if (!snapshot || !payload.series?.length) throw new Error("已实现盈亏指标暂不可用");
      return { material: { platform: "链上看板", account: "BTC Realized Profit / Loss", createdAt: snapshot.onchainAsOf, topic: "链上精选", title: `BTC 已实现盈亏比处于 ${snapshot.zone} 区域`, text: `链上状态：已实现盈利/亏损比当前为 ${decimal(snapshot.current, 4)}，7 日均值 ${decimal(snapshot.average7, 4)}，30 日均值 ${decimal(snapshot.average30, 4)}，趋势 ${snapshot.trend}，当前区域 ${snapshot.zone}。\n\nWhy It Matters：该比例衡量链上获利了结与亏损兑现的相对强度。低于 1 表示亏损兑现占优，常见于压力释放阶段；它应与价格结构和需求恢复共同观察。`, url: `${location.origin}/dashboard#rpl-panel` }, image: trendSnapshotVisual({ title: "BTC Realized Profit / Loss Ratio", subtitle: `On-chain ${snapshot.onchainAsOf}`, series: payload.series, lines: [{ key: "ratio", label: "Profit / Loss Ratio", color: "#6ffc92" }], metrics: [{ label: "CURRENT", value: decimal(snapshot.current, 4) }, { label: "7D AVG", value: decimal(snapshot.average7, 4) }, { label: "30D AVG", value: decimal(snapshot.average30, 4) }, { label: "ZONE", value: snapshot.zone, color: "#8d7cff" }] }) };
    }
    if (source === "median-realized-price") {
      const payload = await fetchFeaturedJson("/api/median-realized-price"); const snapshot = payload.snapshot; if (!snapshot || !payload.series?.length) throw new Error("中位实现价格暂不可用");
      return { material: { platform: "链上看板", account: "BTC Median Realized Price", createdAt: snapshot.medianAsOf, topic: "链上精选", title: `BTC 正在测试中位持仓成本支撑`, text: `链上状态：BTC 当前价格 ${money(snapshot.price)}，中位实现价格 ${money(snapshot.median)}，价格高出典型持仓成本 ${decimal(snapshot.distancePercent, 2)}%，当前区域 ${snapshot.zone}。\n\nWhy It Matters：中位实现价格代表链上成本分布的第 50 百分位，可作为典型持币者盈亏边界。价格靠近该线时，市场往往进入更敏感的支撑验证阶段。`, url: `${location.origin}/dashboard#median-rp-panel` }, image: trendSnapshotVisual({ title: "BTC Median Realized Price", subtitle: `On-chain ${snapshot.medianAsOf}`, series: payload.series, lines: [{ key: "price", label: "BTC Price", color: "#f5f7f3" }, { key: "median", label: "Median Realized Price", color: "#6ffc92" }], metrics: [{ label: "BTC PRICE", value: money(snapshot.price) }, { label: "MEDIAN RP", value: money(snapshot.median), color: "#6ffc92" }, { label: "DISTANCE", value: `${decimal(snapshot.distancePercent, 2)}%` }, { label: "ZONE", value: snapshot.zone, color: "#8d7cff" }] }) };
    }
    if (source === "lth-realized-price") {
      const payload = await fetchFeaturedJson("/api/lth-realized-price"); if (payload.unavailable || !payload.snapshot || !payload.series?.length) throw new Error(payload.reason || "LTH 实现价格源暂不可用"); const snapshot = payload.snapshot;
      return { material: { platform: "链上看板", account: "BTC LTH Realized Price", createdAt: snapshot.onchainAsOf, topic: "链上精选", title: `LTH 成本交叉完成 ${snapshot.completedCrosses}/3`, text: `链上状态：BTC 价格 ${money(snapshot.price)}，0-10 年持有者实现价 ${money(snapshot.rp0to10y)}，6 月-5 年实现价 ${money(snapshot.rp6m5y)}，已完成 ${snapshot.completedCrosses}/3 组成本交叉，风险阶段 ${snapshot.risk}。\n\nWhy It Matters：不同长期持有年龄段的实现价格反映筹码成本迁移。多组交叉依次出现时，能够帮助观察周期压力是否从短期筹码扩散到更长期持有者。`, url: `${location.origin}/dashboard#lth-rp-panel` }, image: trendSnapshotVisual({ title: "BTC LTH Realized Price Bands", subtitle: `On-chain ${snapshot.onchainAsOf}`, series: payload.series, lines: [{ key: "price", label: "BTC Price", color: "#f5f7f3" }, { key: "rp0to10y", label: "0-10Y RP", color: "#6ffc92" }, { key: "rp6m5y", label: "6M-5Y RP", color: "#8d7cff" }], metrics: [{ label: "BTC PRICE", value: money(snapshot.price) }, { label: "0-10Y RP", value: money(snapshot.rp0to10y) }, { label: "CROSSES", value: `${snapshot.completedCrosses}/3` }, { label: "RISK", value: snapshot.risk }] }) };
    }
    if (source === "alphaops") {
      const projects = await fetchFeaturedJson("/api/alphaops-projects"); let items = projects.state?.main || [];
      if (!items.length) { const feed = await fetchFeaturedJson("/api/alphaops-feed"); items = feed.items || []; }
      if (!items.length) throw new Error("AlphaOps 当前没有可用项目或实时动态"); const top = items.slice().sort((a, b) => Number(b.score || 0) - Number(a.score || 0)).slice(0, 5);
      const clean = top.map(({ icon, ...item }) => item);
      return { material: { platform: "AlphaOps", account: "AlphaOps Project Radar", createdAt: projects.state?.updatedAt || new Date().toISOString(), topic: "AlphaOps 精选", title: `AlphaOps 项目池出现 ${top[0].name || "新机会"}`, text: `实时状态：AlphaOps 主项目池当前 ${items.length} 个项目。领先项目 ${top.map((item) => `${item.name}（评分 ${item.score || "--"}，${item.status || "观察中"}）`).join("；")}。\n\nWhy It Matters：项目评分用于压缩研究范围，不代表空投、收益或投资承诺。下一步仍需核对官网、任务成本、钱包授权和项目风险。`, url: `${location.origin}/alphaops` , sourceItems: clean }, image: rankedSnapshotVisual("AlphaOps Project Radar", `${items.length} projects in live pool`, top.map((item) => ({ title: item.name, detail: `${item.status || "观察中"} · ${item.note || "待研究"}`, scoreLabel: `SCORE ${item.score || "--"}` }))) };
    }
    if (source === "alpha-radar") {
      const payload = await fetchFeaturedJson("/api/alpha-scan"); const top = (payload.items || []).slice(0, 5); if (!top.length) throw new Error("Alpha Radar 当前没有实时异动数据");
      return { material: { platform: "Alpha Radar", account: "Seven-dimensional Anomaly Radar", createdAt: payload.scannedAt, topic: "Alpha Radar", title: `${top[0].symbol} 登上实时异动雷达`, text: `实时状态：本轮扫描前五为 ${top.map((item) => `${item.symbol}（异常分 ${item.score}，${item.signalType}）`).join("；")}。最高项 ${top[0].symbol}：${top[0].reason}\n\nWhy It Matters：异常分衡量价格、量能、资金费率、OI 与趋势的偏离强度，不是直接买入信号。反指过热标的尤其需要避免追价，并等待结构确认。`, url: `${location.origin}/alpha-radar`, sourceItems: top.map(({ dimensions, ...item }) => item) }, image: rankedSnapshotVisual("Alpha Radar · Live Anomalies", `Scanned ${new Date(payload.scannedAt).toLocaleString("zh-CN", { hour12: false })}`, top.map((item) => ({ title: `${item.symbol} · ${item.signalType}`, detail: item.reason, scoreLabel: `SCORE ${item.score}`, color: item.signalType === "反指过热" ? "#ff6b6b" : "#6ffc92" }))) };
    }
    throw new Error("未知的精选主题来源");
  }

  async function generateFeatured() {
    const button = $("#generate-drafts"); const selected = $("#featured-source").value; const sources = selected === "all" ? ["cost-basis", "sth-ratio", "realized-profit-loss", "median-realized-price", "alpha-radar"] : [selected];
    button.disabled = true; button.innerHTML = "<span>◌</span> 正在同步精选来源…";
    try {
      const created = [];
      for (const source of sources) { const candidate = await buildFeaturedCandidate(source); const polished = await polishMaterial(candidate.material); created.push(makeDraftFromData(polished, "featured", candidate.image)); }
      state.drafts.unshift(...created); persist(true); setActiveSource("featured", { openDrawer: false }); render(); adaptDraftBatch(created);
      toast("精选主题已生成", `已同步 ${created.length} 个实时来源、组合 Why It Matters，并生成全屏趋势快照。`, "success");
    } catch (error) { toast("精选主题生成失败", error.message, "error", 6500); }
    finally { button.disabled = false; button.innerHTML = "<span>◆</span> 生成精选主题"; }
  }

  async function generateNews() {
    const button = $("#generate-drafts"); const count = Number($("#draft-count").value || 5);
    button.disabled = true; button.textContent = "正在同步新闻源…";
    try {
      const response = await fetch("/api/ai-ops-library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: "weibo-hot", limit: count }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(data.items) || !data.items.length) throw new Error(data.error || "新闻源暂时没有返回内容");
      const created = [];
      for (const material of data.items.slice(0, count)) {
        const polished = await polishMaterial({ ...material, topic: "新闻主题" });
        created.push(makeDraftFromData(polished, "news", material.image));
      }
      state.drafts.unshift(...created); persist(true); setActiveSource("news", { openDrawer: false }); render(); adaptDraftBatch(created);
      if (aiConfig.configured) upgradeImages(created);
      toast("新闻主题已生成", `已从实时公开热榜生成 ${created.length} 条新闻候选稿；发布前请核对原始来源与时间。`, "success", 6500);
    } catch (error) {
      const now = new Date().toISOString();
      const created = Array.from({ length: count }, (_, index) => {
        const item = LOCAL_NEWS_DRAFTS[index % LOCAL_NEWS_DRAFTS.length];
        return createLocalImageSet(ensureDraftModel({ ...item, id: makeId(), sourceType: "news", status: "pending", createdAt: now, updatedAt: now, createdDate: TODAY(), imageSource: "local" }), Math.random());
      });
      state.drafts.unshift(...created); persist(true); setActiveSource("news", { openDrawer: false }); render(); adaptDraftBatch(created);
      toast("实时新闻源暂不可用", `${error.message}。已生成不含实时事实的新闻核验模板，发布前需要补充真实来源。`, "error", 7000);
    } finally { button.disabled = false; button.textContent = "生成新闻主题"; }
  }

  async function generateDrafts() {
    if (activeSource === "featured") return generateFeatured();
    if (activeSource === "library") { openLibrary(); return; }
    if (activeSource === "news") return generateNews();
    const button = $("#generate-drafts"); const count = Number($("#draft-count").value || 5); const mode = $("#topic-mode").value;
    button.disabled = true; button.innerHTML = "<span>◌</span> AI 正在构思…"; $("#api-status").textContent = "生成中";
    try {
      const response = await fetch("/api/ai-ops-generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count, topic: mode, draftType: "master" }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(data.drafts)) throw new Error(data.error || "内容引擎没有返回有效结果");
      const now = new Date().toISOString();
      const created = data.drafts.slice(0, count).map((item, index) => {
        const base = ensureDraftModel({ id: makeId(), topic: item.topic || TOPICS[index % TOPICS.length], title: item.title || "待完善的主题", body: item.body || "请补充正文。", sourceType: "ai", status: "pending", createdAt: now, updatedAt: now, createdDate: TODAY(), imageSource: "local" });
        return createLocalImageSet(base, (Date.now() % 997 + index * 137) / 997);
      });
      state.drafts.unshift(...created); activeView = "pending"; searchTerm = ""; $("#draft-search").value = ""; persist(true); setActiveViewButton(); render();
      toast("主草稿已生成", `已生成 ${created.length} 条主草稿，正在按${platformAdapter().name}规则生成平台版本。`, "success");
      adaptDraftBatch(created);
      if (data.source === "openai") upgradeImages(created); else toast("当前使用演示内容引擎", "配置 OPENAI_API_KEY 后会自动启用实时 AI 成稿与 AI 出图。", "info", 6000);
    } catch (error) {
      const created = makeLocalDrafts(count, mode); state.drafts.unshift(...created); activeView = "pending"; persist(true); setActiveViewButton(); render(); adaptDraftBatch(created);
      toast("实时 AI 暂不可用", `${error.message}。已生成本地候选稿，你仍可完成审核与发布流程。`, "error", 6500);
    } finally { button.disabled = false; button.textContent = "生成 AI 主题"; $("#api-status").textContent = aiConfig.configured ? "实时 AI" : "演示模式"; }
  }

  function makeLocalDrafts(count, mode) {
    const pool = mode === "random" ? [...LOCAL_DRAFTS] : [...LOCAL_DRAFTS.filter((item) => item.topic === mode), ...LOCAL_DRAFTS];
    const now = new Date().toISOString();
    return Array.from({ length: count }, (_, index) => {
      const item = pool[(Date.now() + index) % pool.length]; const draft = ensureDraftModel({ ...item, id: makeId(), sourceType: "ai", status: "pending", createdAt: now, updatedAt: now, createdDate: TODAY(), imageSource: "local" });
      return createLocalImageSet(draft, Math.random());
    });
  }

  async function upgradeImages(drafts) {
    for (const draft of drafts) {
      try {
        const response = await fetch("/api/ai-ops-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: draft.title, body: draft.body, topic: draft.topic }) });
        if (response.status === 503) break;
        const data = await response.json(); if (!response.ok || !data.image) continue;
        normalizeDraftImages(draft);
        draft.images[0] = await optimizeImageForStorage(data.image); draft.imageSources[0] = "ai";
        if (draft.selectedImageIndex === 0) { draft.image = draft.images[0]; draft.imageSource = "ai"; }
        persist();
        const card = document.querySelector(`.draft-card[data-id="${draft.id}"]`); if (card) updateImageCard(draft, card);
      } catch { break; }
    }
  }

  function setActiveViewButton() { $$(".view-tabs button").forEach((button) => button.classList.toggle("active", button.dataset.view === activeView)); }

  function setPlatform(id) {
    if (!window.WelinkPlatformRegistry.get(id)) return;
    const changed = activePlatform !== id;
    activePlatform = id; state.platform = id;
    if (changed) state.platformReady = null;
    persist();
    $$(".platform-switch button[data-platform]").forEach((button) => {
      const active = button.dataset.platform === id;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    renderPublishModeState(); render(); updateCoreFlow();
    const candidates = state.drafts.filter((draft) => draft.status === "pending" && !ensureDraftModel(draft).platformPosts[id]).slice(0, 10);
    if (candidates.length) adaptDraftBatch(candidates, platformAdapter());
  }

  function setPublishMode(mode) {
    if (!MODE_LABELS[mode]) return;
    activePublishMode = mode; state.publishMode = mode; persist(); renderPublishModeState(); render(); updateCoreFlow();
  }

  function renderPlatformCatalog() {
    const adapters = window.WelinkPlatformRegistry.list();
    $$("[data-platform-list]").forEach((list) => {
      const category = list.dataset.platformList;
      const buttons = adapters.filter((adapter) => adapter.category === category).map((adapter) => {
        const publishing = adapter.capabilities.publishing;
        const button = document.createElement("button");
        const label = currentLanguage === "zh" ? adapter.name : (adapter.labelEn || adapter.name);
        const mode = publishing.browserFill
          ? (currentLanguage === "zh" ? "Chrome 已适配 · 人工发送" : "Chrome adapter ready · human send")
          : publishing.api
            ? (currentLanguage === "zh" ? "复制打开 · API 可扩展" : "Copy & open · API capable")
            : (currentLanguage === "zh" ? "复制打开 · 适配器待扩展" : "Copy & open · adapter planned");
        button.type = "button";
        button.className = `platform-chip${adapter.id === activePlatform ? " active" : ""}`;
        button.dataset.platform = adapter.id;
        button.dataset.contentType = adapter.category;
        button.dataset.adapter = publishing.adapter;
        button.style.setProperty("--platform-accent", adapter.accent || "var(--green)");
        button.setAttribute("aria-pressed", String(adapter.id === activePlatform));
        button.title = `${label} · ${mode}`;
        const logo = document.createElement("span"); logo.className = `platform-logo${adapter.icon ? " has-icon" : ""}`;
        if (adapter.icon) { logo.style.setProperty("--platform-icon", `url("${adapter.icon}")`); logo.setAttribute("aria-hidden", "true"); }
        else logo.textContent = adapter.badge || label.slice(0, 2);
        const name = document.createElement("span"); name.className = "platform-chip-name"; name.textContent = label;
        const status = document.createElement("i"); status.className = "platform-chip-status"; status.setAttribute("aria-hidden", "true");
        button.append(logo, name, status);
        return button;
      });
      list.replaceChildren(...buttons);
    });
  }

  function updateBridgeState(ready, version = detectedExtensionVersion) {
    bridgeConnected = Boolean(ready); detectedExtensionVersion = String(version || detectedExtensionVersion || "");
    const current = bridgeConnected && detectedExtensionVersion === EXPECTED_EXTENSION_VERSION;
    $("#bridge-status").textContent = current ? `已连接 v${detectedExtensionVersion}` : bridgeConnected ? `需更新 v${detectedExtensionVersion || "未知"}` : "未连接"; $("#bridge-dot").classList.toggle("offline", !current);
    const dialogDot = $(".extension-connect-state .status-dot");
    if (dialogDot) dialogDot.classList.toggle("offline", !current);
    if ($("#dialog-bridge-title")) $("#dialog-bridge-title").textContent = current ? `发布助手 v${detectedExtensionVersion} 已连接` : bridgeConnected ? "发布助手版本需要更新" : "尚未检测到发布助手";
    if ($("#dialog-bridge-copy")) $("#dialog-bridge-copy").textContent = current ? "当前是最新版本，可以打开平台并填充已审核内容。" : bridgeConnected ? `请下载安装最新 v${EXPECTED_EXTENSION_VERSION} 后重新加载扩展。` : "安装并刷新页面后，这里会自动显示已连接。";
    updateCoreFlow();
  }

  function bind() {
    $("#generate-drafts").addEventListener("click", generateDrafts); $("#empty-generate").addEventListener("click", generateDrafts);
    $("#generation-type").addEventListener("change", (event) => setActiveSource(event.target.value, { openDrawer: false }));
    $$('[data-scroll-target]').forEach((button) => button.addEventListener("click", () => document.getElementById(button.dataset.scrollTarget)?.scrollIntoView({ behavior: "smooth", block: "start" })));
    $("#platform-catalog").addEventListener("click", (event) => { const button = event.target.closest("button[data-platform]"); if (button) setPlatform(button.dataset.platform); });
    $$('#publishing-modes input[name="publish-mode"]').forEach((input) => input.addEventListener("change", () => setPublishMode(input.value)));
    $("#open-publish-log").addEventListener("click", () => { renderPublishLog(); $("#publish-log-dialog").showModal(); });
    $("#clear-publish-log").addEventListener("click", () => { if (!window.confirm("确定清空发布日志吗？草稿不会被删除。")) return; state.publishLogs = []; persist(true); renderPublishLog(); });
    $$(".source-tabs button").forEach((button) => button.addEventListener("click", () => setActiveSource(button.dataset.source)));
    $$(".view-tabs button").forEach((button) => button.addEventListener("click", () => { activeView = button.dataset.view; setActiveViewButton(); render(); }));
    $("#draft-search").addEventListener("input", (event) => { searchTerm = event.target.value.trim().toLowerCase(); render(); });
    $("#open-platform").addEventListener("click", async (event) => {
      const button = event.currentTarget; button.disabled = true; button.textContent = "正在定位编辑页…";
      try {
        const result = await platformAdapter().open();
        const ready = Boolean(result.editorReady);
        state.platformReady = ready ? { platformId: activePlatform, ready: true, readyAt: new Date().toISOString(), verifiedBy: "extension" } : null;
        persist(); updateCoreFlow();
        if (ready) toast("平台编辑页已准备", `${platformAdapter().name}已登录并定位到内容发布编辑框。`, "success");
        else toast("平台已打开", `暂未自动确认编辑框。请确认登录并进入发布页，然后勾选“已登录并进入编辑页”。`, "info", 7000);
      } catch (error) { state.platformReady = null; persist(); updateCoreFlow(); toast("无法确认平台编辑页", error.message, "error"); }
      finally { button.disabled = false; button.textContent = "打开 Chrome"; }
    });
    $("#confirm-platform-ready").addEventListener("change", (event) => { state.platformReady = event.target.checked ? { platformId: activePlatform, ready: true, readyAt: new Date().toISOString(), verifiedBy: "human" } : null; persist(); updateCoreFlow(); });
    $("#connection-help").addEventListener("click", () => { window.WelinkPlatformRegistry.ping(); updateBridgeState(window.WelinkPlatformRegistry.isBridgeReady(), detectedExtensionVersion); $("#help-dialog").showModal(); });
    $("#open-ai-setup").addEventListener("click", () => $("#ai-setup-dialog").showModal());
    $("#open-library").addEventListener("click", () => { setActiveSource("library", { openDrawer: false }); openLibrary(); });
    $("#close-library").addEventListener("click", closeLibrary); $("#library-backdrop").addEventListener("click", closeLibrary);
    $("#library-source").addEventListener("change", updateLibraryFields); $("#fetch-library").addEventListener("click", fetchLibrary);
    $("#select-all-materials").addEventListener("click", () => { const shouldSelect = materialItems.some((item) => !item.selected); materialItems.forEach((item) => { item.selected = shouldSelect; }); renderMaterials(); });
    $("#import-materials").addEventListener("click", importMaterials);
    $("#ops-alert button").addEventListener("click", () => $("#ops-alert").hidden = true);
    $("#clear-all").addEventListener("click", () => { if (!state.drafts.length) return; if (!window.confirm("确定清空全部运营台演示数据吗？此操作无法撤销。")) return; state.drafts = []; persist(true); render(); toast("数据已清空", "全部本地草稿记录已移除。", "info"); });
    $$(".theme-toggle").forEach((button) => button.addEventListener("click", () => { currentTheme = currentTheme === "dark" ? "light" : "dark"; localStorage.setItem("welinkbtc-theme", currentTheme); applyTheme(); }));
    $$(".lang-toggle").forEach((button) => button.addEventListener("click", () => { currentLanguage = currentLanguage === "zh" ? "en" : "zh"; localStorage.setItem("welinkbtc-language", currentLanguage); applyLanguage(); render(); }));
    $(".menu-button").addEventListener("click", (event) => { const open = $("#mobile-menu").classList.toggle("is-open"); event.currentTarget.setAttribute("aria-expanded", String(open)); });
    $("#mobile-menu").querySelectorAll("a").forEach((link) => link.addEventListener("click", () => { $("#mobile-menu").classList.remove("is-open"); $(".menu-button").setAttribute("aria-expanded", "false"); }));
    window.addEventListener("message", (event) => { if (event.source === window && event.data?.source === "welinkbtc-extension" && event.data?.type === "PONG") updateBridgeState(true, event.data.version); });
  }

  applyLanguage();
  bind(); updateLibraryFields(); setPublishMode(activePublishMode); setPlatform(activePlatform); setActiveSource(activeSource, { openDrawer: false }); renderPublishLog(); render(); loadAiConfig(); updateBridgeState(window.WelinkPlatformRegistry.isBridgeReady()); window.WelinkPlatformRegistry.ping(); setTimeout(() => updateBridgeState(window.WelinkPlatformRegistry.isBridgeReady(), detectedExtensionVersion), 1200);
})();
