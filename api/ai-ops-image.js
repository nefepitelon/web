module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "仅支持 POST 请求。" });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "尚未配置 AI 图片服务" });
  const title = String(req.body?.title || "").trim().slice(0, 120);
  const topic = String(req.body?.topic || "AI 运营").trim().slice(0, 40);
  const variation = Math.max(1, Math.min(3, Number(req.body?.variation) || 1));
  if (!title) return res.status(400).json({ error: "缺少图片标题。" });
  const directions = [
    "构图方向一：中心信号核心、环形数据轨道、稳重机构研究封面。",
    "构图方向二：左下标题、右上抽象链上网络、明显纵深与速度感。",
    "构图方向三：模块化数据卡片、发光网格与抽象趋势曲线、简洁高对比。"
  ];
  const prompt = `为 welinkBTC 社交媒体帖子制作一张 1:1 方形高级编辑视觉图。
主题：${topic}。核心概念：${title}。
${directions[variation - 1]}
视觉：深黑墨绿色背景、荧光绿色与少量蓝紫光、精密数据网格、抽象比特币与 AI 信号轨迹、机构级链上研究气质、干净强对比、适合微博信息流。
不要使用人物照片，不要使用平台 Logo，不要伪造数据图表，不要出现水印。图中最多只保留短标题“${title.slice(0, 18)}”，中文必须清晰准确。`;
  try {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2", prompt, size: "1024x1024", quality: "low", output_format: "png" })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || "OpenAI 图片生成失败");
    const item = payload.data?.[0];
    const image = item?.b64_json ? `data:image/png;base64,${item.b64_json}` : item?.url;
    if (!image) throw new Error("图片服务未返回可用图片");
    return res.status(200).json({ source: "openai", image });
  } catch (error) {
    console.error("ai-ops-image", error);
    return res.status(502).json({ error: `AI 出图失败：${error.message}` });
  }
};
