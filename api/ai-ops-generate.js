const TOPICS = ["币圈热门", "搞钱主意", "降本增效", "AI 获客", "上手敲门", "先发优势"];

const DEMO = [
  ["币圈热门", "行情越热，越要把注意力放回链上", "热搜给你情绪，链上数据才给你位置。\n\n今天别急着追涨，先看交易所净流入、长期持有者动向和资金费率是否过热。把三个答案放在一起，再决定是进攻还是等待。\n\n真正的先手，是比别人更早看见风险。#比特币 #链上数据"],
  ["搞钱主意", "把一次研究，拆成一周能复用的内容资产", "同一份 BTC 周报，不该只发一次。\n\n提炼结论做短帖，把数据图做成看板截图，把判断过程改成长文，再整理成社群问答。一次研究，变成 4 种内容、覆盖 3 个平台。\n\n搞钱不是持续制造新东西，而是让好东西被更多次看见。#内容复利"],
  ["降本增效", "AI 运营最值钱的环节，不是代写，是减少返工", "运营最大的隐形成本，不是写得慢，而是方向错了以后整篇重来。\n\n先让 AI 给出 5 个角度，人只做选题判断；选中后再扩写、出图、适配平台。把人的时间留给事实核验与最终表达。#降本增效 #AI工作流"],
  ["AI 获客", "别让 AI 写高级文案，让它先回答客户为什么停留", "有效的获客内容只有三个动作：说中一个具体问题，给出一个能立刻执行的方法，再留下一个低门槛入口。\n\n少一点空泛趋势，多一点真实场景；AI 负责铺路，你负责留下可信的经验和证据。#AI获客"],
  ["上手敲门", "今天就能上手的 AI 运营：从 15 分钟审核开始", "不用先搭一套复杂系统。今天只做一件事：让 AI 生成 5 条候选稿，你花 15 分钟删掉不真实的句子、补上自己的判断，然后亲自发布。\n\n先把人工审核跑顺，再谈自动化。可信，比速度更重要。#人机协作"],
  ["先发优势", "先发优势不是第一个发，而是第一个形成反馈闭环", "别人还在追热点时，你已经把发现信号、生成草稿、人工审核、发布复盘变成固定动作。\n\n真正拉开差距的不是偶尔爆一条，而是稳定产出、每周复盘、持续修正选题。工具会被复制，反馈速度不会。#先发优势"],
];

function demoDrafts(count, topic) {
  const filtered = topic && topic !== "random" ? DEMO.filter(([itemTopic]) => itemTopic === topic) : DEMO;
  const pool = filtered.length ? [...filtered, ...DEMO] : DEMO;
  const offset = Math.floor(Date.now() / 60000) % pool.length;
  return Array.from({ length: count }, (_, index) => {
    const [itemTopic, title, body] = pool[(offset + index) % pool.length];
    return { topic: itemTopic, title, body };
  });
}

function extractText(payload) {
  if (typeof payload.output_text === "string") return payload.output_text;
  for (const item of payload.output || []) {
    for (const content of item.content || []) if (content.type === "output_text" && content.text) return content.text;
  }
  return "";
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "仅支持 POST 请求。" });
  const count = Math.max(1, Math.min(5, Number(req.body?.count) || 5));
  const topic = TOPICS.includes(req.body?.topic) ? req.body.topic : "random";
  if (!process.env.OPENAI_API_KEY) return res.status(200).json({ source: "demo", draftType: "master", drafts: demoDrafts(count, topic) });

  const requestedTopic = topic === "random" ? "在币圈热门、搞钱主意、降本增效、AI 获客、上手敲门、先发优势中均匀随机选择，避免重复" : `只围绕“${topic}”但使用不同切入角度`;
  const prompt = `为 welinkBTC 生成 ${count} 条中文社交媒体候选稿。主题要求：${requestedTopic}。
每条包含：topic、title、body。标题 12-28 个汉字；正文 160-360 个汉字。这是平台无关的主草稿，后续系统会按用户选择的平台规则另行生成 PlatformPost，不要预先迎合某一个平台。
语气直接、具体、有经验感；提供可执行观点；不要编造数据、收益或客户案例；不要承诺回报；最多 2 个相关话题标签。
这是“AI 内容助手 + 发布前人工审核台”，内容必须适合真人审核后发布。不要写任何自动发布或批量群发建议。`;

  const schema = {
    type: "object",
    properties: {
      drafts: {
        type: "array", minItems: count, maxItems: count,
        items: {
          type: "object", additionalProperties: false,
          properties: {
            topic: { type: "string", enum: TOPICS },
            title: { type: "string" },
            body: { type: "string" }
          },
          required: ["topic", "title", "body"]
        }
      }
    },
    required: ["drafts"], additionalProperties: false
  };

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_TEXT_MODEL || "gpt-5.6-terra",
        input: prompt,
        reasoning: { effort: "low" },
        max_output_tokens: 5000,
        text: { format: { type: "json_schema", name: "social_drafts", strict: true, schema } }
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || "OpenAI 内容生成失败");
    const parsed = JSON.parse(extractText(payload));
    if (!Array.isArray(parsed.drafts) || parsed.drafts.length !== count) throw new Error("模型返回的草稿数量不正确");
    return res.status(200).json({ source: "openai", draftType: "master", drafts: parsed.drafts });
  } catch (error) {
    console.error("ai-ops-generate", error);
    return res.status(200).json({ source: "demo", draftType: "master", fallbackReason: error.message, drafts: demoDrafts(count, topic) });
  }
};
