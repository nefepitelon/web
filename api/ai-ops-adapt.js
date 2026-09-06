const { getPlatformRule, validatePlatformPost, localAdapt } = require("./_ai-ops-platform-rules");

function extractText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const item of payload?.output || []) {
    for (const content of item.content || []) if (content.type === "output_text" && content.text) return content.text;
  }
  return "";
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "仅支持 POST 请求。" });
  const platformId = String(req.body?.platformId || "");
  const rule = getPlatformRule(platformId);
  if (!rule) return res.status(400).json({ error: "未知的发布平台。" });
  const draft = req.body?.draft || {};
  if (!String(draft.title || "").trim() || !String(draft.body || "").trim()) return res.status(400).json({ error: "主草稿的标题和正文不能为空。" });

  const fallback = () => {
    const platformPost = localAdapt(rule, draft);
    return { source: "local", platformPost, validation: validatePlatformPost(rule, platformPost, Number(req.body?.imageCount) || 0), rule };
  };
  if (!process.env.OPENAI_API_KEY) return res.status(200).json({ ...fallback(), openaiConfigured: false });

  const prompt = `你是社交平台内容运营专家。
请把下面这篇主内容改写成适合 ${rule.name} 发布的版本。

平台规则：
- 最大字数：${rule.maxTextLength}
- 是否支持标题：${rule.hasTitle}
- 是否强调图片：${rule.imageRequired}
- 标签数量建议：${rule.hashtagLimit}
- 风格：${rule.style}

主内容：
标题：${String(draft.title).slice(0, 300)}
正文：${String(draft.body).slice(0, 10000)}
标签：${Array.isArray(draft.hashtags) ? draft.hashtags.join(" ") : "请从正文提取"}

要求：
1. 保留核心观点；
2. 适应平台语气；
3. 不要夸大收益；
4. 不要制造虚假案例；
5. 不要诱导违规行为；
6. 输出 JSON。`;
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      body: { type: "string" },
      hashtags: { type: "array", items: { type: "string" }, maxItems: rule.hashtagLimit }
    },
    required: ["title", "body", "hashtags"]
  };

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_TEXT_MODEL || "gpt-5.6-terra",
        input: prompt,
        reasoning: { effort: "low" },
        max_output_tokens: Math.min(6000, Math.max(1200, rule.maxTextLength * 2)),
        text: { format: { type: "json_schema", name: "platform_post", strict: true, schema } }
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || "OpenAI 平台适配失败");
    const parsed = JSON.parse(extractText(payload));
    const local = localAdapt(rule, parsed);
    const platformPost = { ...local, platformId, generatedAt: new Date().toISOString(), source: "openai" };
    return res.status(200).json({ source: "openai", openaiConfigured: true, platformPost, validation: validatePlatformPost(rule, platformPost, Number(req.body?.imageCount) || 0), rule });
  } catch (error) {
    console.error("ai-ops-adapt", error);
    return res.status(200).json({ ...fallback(), fallbackReason: error.message, openaiConfigured: true });
  }
};
