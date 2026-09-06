function extractText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const item of payload?.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  return "";
}

function localPolish(material) {
  const text = String(material.text || "").replace(/\s+/g, " ").trim();
  const title = String(material.title || text.split(/[。！？!?]/)[0] || "值得关注的新信号").slice(0, 28);
  const body = `${text.slice(0, 360)}\n\n这条素材值得关注的不是情绪本身，而是它背后的变化方向。发布前请核对原始来源、时间和数据口径，再补上你的独立判断。#热点观察`;
  return { topic: material.topic || "素材库", title, body, source: "local" };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "仅支持 POST 请求。" });
  const material = req.body?.material || {};
  const rawText = String(material.text || "").trim();
  if (!rawText) return res.status(400).json({ error: "素材正文不能为空。" });
  if (!process.env.OPENAI_API_KEY) return res.status(200).json({ draft: localPolish(material), source: "local", openaiConfigured: false });

  const prompt = `你是 welinkBTC 的中文内容编辑。把下面的公开素材改写成一条可以人工审核后发布的原创社交媒体候选稿。\n\n来源平台：${String(material.platform || "公开来源").slice(0, 30)}\n来源账号：${String(material.account || "未知").slice(0, 80)}\n来源时间：${String(material.createdAt || "未知").slice(0, 40)}\n原始素材：${rawText.slice(0, 4000)}\n\n要求：\n1. 输出 topic、title、body。标题 12-28 个汉字，正文 140-320 个汉字。\n2. 提炼信息增量和 Why It Matters，不复制原文句式，不冒充原作者。\n3. 保留可核验事实；不编造价格、收益、客户案例或引用。\n4. 明确这是观点与信息整理，不构成投资建议。\n5. 最多两个相关话题标签，适合微博、X 与币安广场人工审核后发布。`;
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      topic: { type: "string" },
      title: { type: "string" },
      body: { type: "string" }
    },
    required: ["topic", "title", "body"]
  };

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_TEXT_MODEL || "gpt-5.6-terra",
        input: prompt,
        reasoning: { effort: "low" },
        max_output_tokens: 1800,
        text: { format: { type: "json_schema", name: "material_draft", strict: true, schema } }
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || "OpenAI 润色失败");
    const draft = JSON.parse(extractText(payload));
    return res.status(200).json({ source: "openai", openaiConfigured: true, draft });
  } catch (error) {
    console.error("ai-ops-polish", error);
    return res.status(200).json({ source: "local", fallbackReason: error.message, draft: localPolish(material) });
  }
};
