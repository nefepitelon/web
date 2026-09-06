const MODES = {
  BROWSER: "browser-fill",
  INTENT: "intent-url",
  API: "official-api",
  MANUAL: "copy-manual"
};

const definitions = [
  ["weibo", "微博", 2000, true, false, 3, "中文观点清晰、信息密度高、段落简洁", "rich", [MODES.BROWSER, MODES.MANUAL]],
  ["x", "X / Twitter", 280, false, false, 2, "短、直接、适合全球科技与加密社区，保留自然换行", "rich", [MODES.BROWSER, MODES.INTENT, MODES.API, MODES.MANUAL]],
  ["binance", "币安广场", 2000, true, false, 3, "面向加密社区，强调信息来源、风险边界和可验证观点", "rich", [MODES.BROWSER, MODES.MANUAL]],
  ["okx", "OKX 星球", 2000, true, false, 3, "面向加密社区，专业、克制、避免收益暗示", "rich", [MODES.MANUAL]],
  ["xiaohongshu", "小红书", 1000, true, true, 5, "真实体验感、短段落、可执行清单，标题具体但不夸张", "rich", [MODES.BROWSER, MODES.MANUAL]],
  ["wechat", "公众号", 20000, true, false, 3, "结构完整、适合长文阅读，包含事实依据与小标题", "rich", [MODES.API, MODES.MANUAL]],
  ["linkedin", "LinkedIn", 3000, false, false, 3, "专业、B2B、强调方法论与可迁移经验", "rich", [MODES.INTENT, MODES.API, MODES.MANUAL]],
  ["facebook", "Facebook Page", 63206, false, false, 3, "自然、清晰、适合品牌主页互动", "rich", [MODES.API, MODES.MANUAL]],
  ["telegram", "Telegram", 4096, false, false, 3, "简洁、适合频道广播，关键信息前置", "community", [MODES.INTENT, MODES.API, MODES.MANUAL]],
  ["whatsapp", "WhatsApp", 4096, false, false, 2, "口语化、短消息、上下文完整", "community", [MODES.INTENT, MODES.MANUAL]],
  ["discord", "Discord", 2000, false, false, 3, "社区对话感、重点清晰、便于成员继续讨论", "community", [MODES.API, MODES.MANUAL]],
  ["zhihu", "知乎", 20000, true, false, 3, "论点明确、解释充分、避免营销腔，适合回答与专栏", "community", [MODES.BROWSER, MODES.MANUAL]],
  ["threads", "Threads", 500, false, false, 2, "轻量、自然、适合对话与连续观点", "community", [MODES.BROWSER, MODES.MANUAL]],
  ["reddit", "Reddit", 40000, true, false, 3, "信息透明、避免宣传腔，说明来源与利益相关", "community", [MODES.API, MODES.MANUAL]],
  ["youtube", "YouTube", 5000, true, true, 3, "适合视频标题与说明，关键词自然，不做标题党", "video", [MODES.MANUAL]],
  ["douyin", "抖音网页版", 2200, true, true, 5, "前两句抓住具体问题、短句、适合视频或图文说明", "video", [MODES.BROWSER, MODES.MANUAL]],
  ["tiktok", "TikTok 网页版", 2200, true, true, 5, "简短、节奏快、国际化表达，避免夸张承诺", "video", [MODES.BROWSER, MODES.MANUAL]],
  ["wechat-channels", "视频号", 1500, true, true, 3, "中文短视频说明，重点前置、表达克制", "video", [MODES.MANUAL]],
  ["kuaishou", "快手", 2200, true, true, 5, "口语化、真实、场景具体", "video", [MODES.MANUAL]],
  ["bilibili-dynamic", "B站动态", 2000, false, true, 5, "社区感强、信息充分、尊重事实与来源", "video", [MODES.MANUAL]]
];

const PLATFORM_RULES = Object.fromEntries(definitions.map(([id, name, maxTextLength, hasTitle, imageRequired, hashtagLimit, style, category, supportedModes]) => [id, {
  id,
  name,
  maxTextLength,
  hasTitle,
  imageRequired,
  hashtagLimit,
  style,
  category,
  supportedModes,
  recommendedMode: supportedModes.includes(MODES.BROWSER) ? MODES.BROWSER : supportedModes[0]
}]));

function getPlatformRule(id) {
  return PLATFORM_RULES[id] || null;
}

function normalizeHashtags(values, limit) {
  const source = Array.isArray(values) ? values : String(values || "").match(/#[^\s#，。！？、；;]+/g) || [];
  return [...new Set(source.map((value) => `#${String(value).replace(/^#+/, "").trim()}`).filter((value) => value.length > 1))].slice(0, limit);
}

function composeText(rule, post) {
  const title = String(post.title || "").trim();
  const body = String(post.body || "").trim();
  const hashtags = normalizeHashtags(post.hashtags, rule.hashtagLimit);
  const parts = [];
  if (rule.hasTitle && title) parts.push(title);
  if (body && (!rule.hasTitle || body !== title)) parts.push(body);
  if (hashtags.length && !hashtags.every((tag) => parts.join("\n").includes(tag))) parts.push(hashtags.join(" "));
  return parts.join("\n\n").replace(/\r\n?/g, "\n").trim();
}

function validatePlatformPost(rule, post, imageCount = 0) {
  const errors = [];
  const warnings = [];
  const text = composeText(rule, post);
  if (!text) errors.push("平台稿不能为空");
  if (text.length > rule.maxTextLength) errors.push(`平台稿超过 ${rule.maxTextLength} 字限制`);
  if (rule.hasTitle && !String(post.title || "").trim()) errors.push("该平台需要标题");
  if (rule.imageRequired && imageCount < 1) warnings.push("该平台强依赖图片，建议至少选择 1 张配图");
  const hashtags = normalizeHashtags(post.hashtags, Number.MAX_SAFE_INTEGER);
  if (hashtags.length > rule.hashtagLimit) warnings.push(`建议标签不超过 ${rule.hashtagLimit} 个`);
  return { valid: errors.length === 0, errors, warnings, text, length: text.length };
}

function localAdapt(rule, draft) {
  const title = String(draft.title || "").trim();
  const rawBody = String(draft.body || "").replace(/\r\n?/g, "\n").trim();
  const extracted = normalizeHashtags([...(draft.hashtags || []), ...(rawBody.match(/#[^\s#，。！？、；;]+/g) || [])], rule.hashtagLimit);
  const cleanBody = rawBody.replace(/(?:^|\s)#[^\s#，。！？、；;]+/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const body = rule.hasTitle ? cleanBody : [title, cleanBody].filter(Boolean).join("\n\n");
  const post = { platformId: rule.id, title: rule.hasTitle ? title : "", body, hashtags: extracted };
  let text = composeText(rule, post);
  if (text.length > rule.maxTextLength) {
    post.body = post.body.slice(0, Math.max(0, post.body.length - (text.length - rule.maxTextLength))).trim();
    text = composeText(rule, post);
  }
  post.text = text;
  return post;
}

module.exports = { MODES, PLATFORM_RULES, getPlatformRule, normalizeHashtags, composeText, validatePlatformPost, localAdapt };
