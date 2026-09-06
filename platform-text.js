(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WelinkPlatformText = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  function normalizeHashtags(value) {
    return String(value || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]*#([\p{L}\p{N}_]+)/gu, (match, tag, offset, input) => {
        const previous = input[offset - 1] || "";
        return `${previous && !/\s/.test(previous) ? " " : ""}#${tag} `;
      })
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .trim();
  }

  function formatForPlatform(value, platform, limit) {
    const normalized = normalizeHashtags(value);
    if (!Number.isFinite(limit) || normalized.length <= limit) return normalized;
    let clipped = normalized.slice(0, limit);
    if (platform === "x" && /\s#[^\s]*$/u.test(clipped)) clipped = clipped.replace(/\s#[^\s]*$/u, "");
    return clipped.trimEnd();
  }

  return { normalizeHashtags, formatForPlatform };
});
