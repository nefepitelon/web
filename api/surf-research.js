const SURF_RESPONSES_URL = "https://api.asksurf.ai/gateway/v1/responses";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const EFFORTS = new Set(["minimal", "low", "medium", "high"]);
const SURF_TIMEOUTS = { minimal: 60_000, low: 90_000, medium: 135_000, high: 165_000 };
const OPENAI_TIMEOUT = 100_000;

function cleanText(value, maxLength) {
  return String(value || "").replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function extractText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  return (payload?.output || [])
    .flatMap((item) => item?.content || [])
    .filter((content) => content?.type === "output_text" && content?.text)
    .map((content) => content.text)
    .join("\n")
    .trim();
}

function normalizeChinesePunctuation(value) {
  return String(value).split(/(https?:\/\/[^\s）]+)/gi).map((part) => {
    if (/^https?:\/\//i.test(part) || !/[\u3400-\u9fff]/u.test(part)) return part;
    return part
      .replace(/"([^"\n]{1,240})"/g, "“$1”")
      .replace(/'([^'\n]{1,240})'/g, "‘$1’")
      .replace(/\s*:\s*/g, "：")
      .replace(/,\s*/g, "，")
      .replace(/;\s*/g, "；")
      .replace(/\?\s*/g, "？")
      .replace(/!\s*/g, "！");
  }).join("");
}

function normalizeResearchAnswer(value, language = "zh") {
  let text = String(value || "")
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\u2060\uFEFF\uFFFD]/g, "")
    .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, "")
    .replace(/â€œ/g, "“")
    .replace(/â€/g, "”")
    .replace(/â€™/g, "’")
    .replace(/â€”/g, "—")
    .replace(/â€“/g, "－")
    .replace(/Â/g, "");

  text = text
    .replace(/^\s*```[^\n]*$/gm, "")
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, "$1（图片：$2）")
    .replace(/\[([^\]]{1,240})\]\((https?:\/\/[^\s)]+)\)/g, "$1（$2）")
    .replace(/^\s{0,3}#{1,6}\s*(.*?)\s*#*\s*$/gm, (_match, heading) => {
      const cleanHeading = String(heading).replace(/\*\*|__|`/g, "").trim();
      return /^TL\s*;?\s*DR$/i.test(cleanHeading) ? "【摘要】" : `【${cleanHeading}】`;
    })
    .replace(/^\s*(?:-{3,}|_{3,}|\*{3,})\s*$/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-+*]\s+/gm, "· ")
    .replace(/^\s*(\d+)[.)]\s+/gm, "$1．")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1")
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^\s*TL\s*;?\s*DR\s*$/gim, "【摘要】")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return language === "en" ? text : normalizeChinesePunctuation(text);
}

function extractCitations(payload) {
  const seen = new Set();
  const citations = [];
  for (const content of (payload?.output || []).flatMap((item) => item?.content || [])) {
    for (const annotation of content?.annotations || []) {
      const citation = annotation?.url_citation || annotation;
      const url = cleanText(citation?.url, 1000);
      if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
      seen.add(url);
      citations.push({
        title: cleanText(citation?.title, 180) || new URL(url).hostname,
        url
      });
    }
  }
  return citations.slice(0, 12);
}

function researchContext({ query, platformId, platformName, language }) {
  const safeQuery = cleanText(query, 4000);
  const safePlatformId = cleanText(platformId, 40) || "all-platforms";
  const safePlatformName = cleanText(platformName, 60) || safePlatformId;
  const isEnglish = language === "en";
  return {
    platformId: safePlatformId,
    input: isEnglish
      ? `Research question: ${safeQuery}\n\nCurrent welinkBTC surface or publishing context: ${safePlatformName} (${safePlatformId}). Tailor the actionable interpretation to this context without weakening factual accuracy.`
      : `研究问题：${safeQuery}\n\n当前 welinkBTC 页面或发布场景：${safePlatformName}（${safePlatformId}）。请在不降低事实准确性的前提下，给出适合该场景的解读与行动角度。`,
    instructions: isEnglish
      ? "You are Xiaowei, welinkBTC's crypto deep-research assistant. Research the live web when available. Use current verifiable data, distinguish facts from inference, cite primary or authoritative sources with links, state uncertainty, and never fabricate prices, returns, cases, or quotes. Structure the answer as: conclusion, evidence, why it matters, platform angle, risks and verification checklist. Use plain text with clear paragraphs and numbered lists. Do not emit Markdown control marks such as #, **, ---, backticks, or fenced code. Do not use emoji or straight English quotation marks. Do not publish anything."
      : "你是小微，welinkBTC 的加密行业深度研究助手。可用时检索实时网页。使用最新且可核验的数据，区分事实与推断，优先引用第一方或权威来源并保留链接，明确不确定性，禁止编造价格、收益、案例或引语。回答结构：核心结论、关键证据、Why It Matters、平台内容角度、风险与发布前核验清单。只使用简洁中文纯文本；分节标题统一写成【标题】；使用中文全角标点；列表使用序号；段落间保留一个空行。禁止输出 #、**、---、反引号、代码围栏等 Markdown 控制标记，禁止使用表情符号和英文直引号。不要执行任何发布操作。"
  };
}

function validResponseId(value) {
  const id = cleanText(value, 160);
  return /^resp_[A-Za-z0-9_-]+$/.test(id) ? id : "";
}

function buildSurfRequest({ query, platformId, platformName, effort, previousResponseId, surfPreviousResponseId, language }) {
  const context = researchContext({ query, platformId, platformName, language });
  const safeEffort = EFFORTS.has(effort) ? effort : "medium";
  const body = {
    model: "surf-2.0",
    input: context.input,
    instructions: context.instructions,
    stream: false,
    reasoning: { effort: safeEffort },
    max_output_tokens: 2600,
    metadata: { surface: "welinkbtc-ai-ops", platform: context.platformId }
  };
  const previous = validResponseId(surfPreviousResponseId || previousResponseId);
  if (previous) body.previous_response_id = previous;
  return body;
}

function buildOpenAIRequest({ query, platformId, platformName, effort, openaiPreviousResponseId, language }) {
  const context = researchContext({ query, platformId, platformName, language });
  const safeEffort = EFFORTS.has(effort) ? effort : "medium";
  const body = {
    model: process.env.OPENAI_RESEARCH_MODEL || process.env.OPENAI_TEXT_MODEL || "gpt-5.6-terra",
    input: context.input,
    instructions: context.instructions,
    tools: [{ type: "web_search" }],
    reasoning: { effort: safeEffort === "high" ? "high" : safeEffort === "medium" ? "medium" : "low" },
    max_output_tokens: 2600,
    metadata: { surface: "welinkbtc-xiaowei-research", platform: context.platformId }
  };
  const previous = validResponseId(openaiPreviousResponseId);
  if (previous) body.previous_response_id = previous;
  return body;
}

function providerFailure(provider, code, message, status, timedOut = false) {
  const error = new Error(cleanText(message, 500) || `${provider} 研究暂时不可用。`);
  error.provider = provider;
  error.code = code;
  error.status = status;
  error.timedOut = timedOut;
  return error;
}

async function requestJson(url, key, body, timeout, provider) {
  let upstream;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout)
    });
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    throw providerFailure(
      provider,
      timedOut ? `${provider.toUpperCase()}_TIMEOUT` : `${provider.toUpperCase()}_REQUEST_FAILED`,
      timedOut ? `${provider === "surf" ? "SURF" : "OpenAI"} 研究等待超时。` : `${provider === "surf" ? "SURF" : "OpenAI"} 研究连接失败。`,
      timedOut ? 504 : 502,
      timedOut
    );
  }
  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const message = payload?.error?.message || payload?.error || `${provider} 返回 ${upstream.status}`;
    throw providerFailure(
      provider,
      upstream.status === 429 ? `${provider.toUpperCase()}_RATE_LIMITED` : `${provider.toUpperCase()}_UPSTREAM_ERROR`,
      message,
      upstream.status === 401 || upstream.status === 403 ? 503 : 502
    );
  }
  const answer = extractText(payload);
  if (!answer) throw providerFailure(provider, `${provider.toUpperCase()}_EMPTY_RESPONSE`, `${provider === "surf" ? "SURF" : "OpenAI"} 没有返回可显示的研究结论。`, 502);
  return { payload, answer };
}

async function runSurf(body) {
  if (!process.env.SURF_API_KEY) throw providerFailure("surf", "SURF_NOT_CONFIGURED", "SURF 深度研究尚未配置。", 503);
  const effort = EFFORTS.has(body?.reasoning?.effort) ? body.reasoning.effort : "medium";
  const result = await requestJson(SURF_RESPONSES_URL, process.env.SURF_API_KEY, body, SURF_TIMEOUTS[effort], "surf");
  const language = /Research question:/i.test(body.input) ? "en" : "zh";
  return {
    provider: "surf",
    answer: normalizeResearchAnswer(result.answer, language),
    responseId: cleanText(result.payload.id, 160),
    surfResponseId: cleanText(result.payload.id, 160),
    model: cleanText(result.payload.model, 80) || "surf-2.0",
    status: cleanText(result.payload.status, 40) || "completed",
    usage: result.payload.usage || null,
    creditsUsed: result.payload?.meta?.credits_used ?? null
  };
}

async function runOpenAI(body) {
  if (!process.env.OPENAI_API_KEY) throw providerFailure("openai", "OPENAI_NOT_CONFIGURED", "OpenAI 接力研究尚未配置。", 503);
  const result = await requestJson(OPENAI_RESPONSES_URL, process.env.OPENAI_API_KEY, body, OPENAI_TIMEOUT, "openai");
  const citations = extractCitations(result.payload);
  let answer = result.answer;
  const missing = citations.filter((citation) => !answer.includes(citation.url));
  if (missing.length) {
    answer += `\n\n【来源】\n${missing.map((citation, index) => `${index + 1}．${citation.title}（${citation.url}）`).join("\n")}`;
  }
  const language = /Research question:/i.test(body.input) ? "en" : "zh";
  return {
    provider: "openai",
    answer: normalizeResearchAnswer(answer, language),
    responseId: cleanText(result.payload.id, 160),
    openaiResponseId: cleanText(result.payload.id, 160),
    model: cleanText(result.payload.model, 80) || body.model,
    status: cleanText(result.payload.status, 40) || "completed",
    usage: result.payload.usage || null,
    citations
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "仅支持 POST 请求。" });

  const query = cleanText(req.body?.query, 4000);
  if (query.length < 2) return res.status(400).json({ ok: false, error: "请输入至少 2 个字符的研究问题。" });

  const request = {
    query,
    platformId: req.body?.platformId,
    platformName: req.body?.platformName,
    effort: req.body?.effort,
    surfPreviousResponseId: req.body?.surfPreviousResponseId,
    openaiPreviousResponseId: req.body?.openaiPreviousResponseId,
    previousResponseId: req.body?.previousResponseId,
    language: req.body?.language
  };
  const surfBody = buildSurfRequest(request);
  let surfFailure;

  try {
    const result = await runSurf(surfBody);
    return res.status(200).json({ ok: true, fallback: false, ...result, platformId: surfBody.metadata.platform });
  } catch (error) {
    surfFailure = error;
  }

  try {
    const openaiBody = buildOpenAIRequest(request);
    const result = await runOpenAI(openaiBody);
    return res.status(200).json({
      ok: true,
      fallback: true,
      fallbackFrom: "surf",
      fallbackReasonCode: surfFailure?.code || "SURF_NO_RESULT",
      fallbackReason: cleanText(surfFailure?.message, 300) || "SURF 未返回研究结果。",
      ...result,
      platformId: openaiBody.metadata.platform
    });
  } catch (openaiFailure) {
    const bothUnavailable = surfFailure?.code === "SURF_NOT_CONFIGURED" && openaiFailure?.code === "OPENAI_NOT_CONFIGURED";
    const timedOut = Boolean(surfFailure?.timedOut || openaiFailure?.timedOut);
    return res.status(bothUnavailable ? 503 : timedOut ? 504 : 502).json({
      ok: false,
      code: "RESEARCH_ENGINES_UNAVAILABLE",
      surfCode: surfFailure?.code || "SURF_NO_RESULT",
      openaiCode: openaiFailure?.code || "OPENAI_NO_RESULT",
      error: `SURF 未返回结果，OpenAI 接力研究也未完成：${cleanText(openaiFailure?.message, 320) || "请稍后重试。"}`
    });
  }
};

module.exports.extractText = extractText;
module.exports.extractCitations = extractCitations;
module.exports.normalizeResearchAnswer = normalizeResearchAnswer;
module.exports.buildSurfRequest = buildSurfRequest;
module.exports.buildOpenAIRequest = buildOpenAIRequest;
module.exports.runSurf = runSurf;
module.exports.runOpenAI = runOpenAI;
