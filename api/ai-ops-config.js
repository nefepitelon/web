module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "仅支持 GET 请求。" });

  const openaiConfigured = Boolean(process.env.OPENAI_API_KEY);
  const surfConfigured = Boolean(process.env.SURF_API_KEY);
  return res.status(200).json({
    openai: {
      configured: openaiConfigured,
      text: openaiConfigured,
      image: openaiConfigured,
      research: openaiConfigured,
      textModel: process.env.OPENAI_TEXT_MODEL || "gpt-5.6-terra",
      researchModel: process.env.OPENAI_RESEARCH_MODEL || process.env.OPENAI_TEXT_MODEL || "gpt-5.6-terra",
      imageModel: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
      keyUrl: "https://platform.openai.com/api-keys"
    },
    surf: {
      configured: surfConfigured,
      research: surfConfigured,
      model: "surf-2.0",
      fallbackProvider: "openai",
      serverOnly: true,
      keyExposedToBrowser: false
    },
    sources: {
      x: { configured: Boolean(process.env.X_BEARER_TOKEN), mode: "official-api" },
      weibo: { configured: true, mode: "public-trending" },
      binance: { configured: false, mode: "manual-import" }
    },
    publishing: {
      telegram: { configured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID), mode: "official-api" },
      discord: { configured: Boolean(process.env.DISCORD_WEBHOOK_URL), mode: "official-api" },
      automaticScheduling: false,
      humanConfirmationRequired: true
    },
    security: {
      serverOnly: true,
      keyExposedToBrowser: false,
      surfKeyExposedToBrowser: false,
      automaticPublish: false
    }
  });
};
