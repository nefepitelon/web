const { getPlatformRule, validatePlatformPost } = require("./_ai-ops-platform-rules");

async function telegramPublish(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { configured: false, required: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"] };
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true })
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.description || "Telegram 发布失败");
  const username = process.env.TELEGRAM_CHANNEL_USERNAME?.replace(/^@/, "");
  return { configured: true, provider: "telegram-bot", externalId: String(payload.result.message_id), publishUrl: username ? `https://t.me/${username}/${payload.result.message_id}` : "" };
}

async function discordPublish(text) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return { configured: false, required: ["DISCORD_WEBHOOK_URL"] };
  const separator = webhook.includes("?") ? "&" : "?";
  const response = await fetch(`${webhook}${separator}wait=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: text, allowed_mentions: { parse: [] } })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "Discord 发布失败");
  return { configured: true, provider: "discord-webhook", externalId: String(payload.id || ""), publishUrl: payload.guild_id && payload.channel_id && payload.id ? `https://discord.com/channels/${payload.guild_id}/${payload.channel_id}/${payload.id}` : "" };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "仅支持 POST 请求。" });
  if (req.body?.confirmed !== true) return res.status(400).json({ error: "必须由真人明确确认后才能调用官方 API。", code: "HUMAN_CONFIRMATION_REQUIRED" });
  const platformId = String(req.body?.platformId || "");
  const rule = getPlatformRule(platformId);
  if (!rule || !rule.supportedModes.includes("official-api")) return res.status(400).json({ error: "该平台当前不支持官方 API 发布方式。" });
  const platformPost = req.body?.platformPost || {};
  const validation = validatePlatformPost(rule, platformPost, Number(req.body?.imageCount) || 0);
  if (!validation.valid) return res.status(422).json({ error: validation.errors.join("；"), validation });

  try {
    let result;
    if (platformId === "telegram") result = await telegramPublish(validation.text);
    else if (platformId === "discord") result = await discordPublish(validation.text);
    else {
      return res.status(409).json({
        error: `${rule.name} 官方 API 需要平台应用审核、账号授权与专用凭据；当前未配置，未执行发布。`,
        code: "PLATFORM_API_SETUP_REQUIRED",
        requiresSetup: true,
        platformId
      });
    }
    if (!result.configured) return res.status(409).json({ error: `${rule.name} 官方 API 尚未配置：${result.required.join("、")}`, code: "PLATFORM_API_SETUP_REQUIRED", requiresSetup: true, required: result.required });
    return res.status(200).json({ ok: true, humanConfirmed: true, automaticSend: false, ...result });
  } catch (error) {
    console.error("ai-ops-publish", error);
    return res.status(502).json({ error: error.message || "平台官方 API 发布失败。", code: "PLATFORM_API_FAILED" });
  }
};
