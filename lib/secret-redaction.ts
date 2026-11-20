/** Safe diagnostics only. Never use redacted values to sign or submit trades. */
const REDACTED = "[redacted]";
const SENSITIVE_NAME = /(?:password|passphrase|privatekey|apikey|apisecret|secret|secretkey|secretaccesskey|accesskeyid|accesskey|accesstoken|refreshtoken|idtoken|token|authorization|proxyauthorization|cookie|setcookie|agentsessionid|sessionid|clientsecret|signature|mnemonic|seedphrase|recoveryphrase|keypairjson|keypair|encryptionkey|signingkey|servicerolekey|configencrypted)$/i;
const LABELED_SECRET = /((?:["']?)(?:[\w.-]*[_-])?(?:api[_-]?key|api[_-]?secret|private[_-]?key|secret(?:[_-]?key)?|password|passphrase|access[_-]?token|refresh[_-]?token|id[_-]?token|token|authorization|proxy[_-]?authorization|cookie|set[_-]?cookie|agentSessionId|session[_-]?id|client[_-]?secret|signature|mnemonic|seed[_-]?phrase|recovery[_-]?phrase|keypair(?:[_-]?json)?|encryption[_-]?key|signing[_-]?key)["']?\s*[:=]\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}\]]+)/gi;

export function isSecretFieldName(key: string) {
  if (/(?:hint|masked|configured|address|symbol|index)$/i.test(key)) return false;
  return SENSITIVE_NAME.test(key.replace(/[^a-z0-9]/gi, ""));
}

export function redactSecretText(value: unknown, secrets: Iterable<string> = [], maxLength = 2000): string {
  let text = value instanceof Error ? value.message : typeof value === "string" ? value : "Operation failed";
  // Bound work before inspecting untrusted provider diagnostics. No discarded
  // suffix can be logged, persisted, or returned by this function.
  text = text.slice(0, 32768);
  const known = [...secrets].filter((secret) => typeof secret === "string" && secret.length >= 4)
    .sort((left, right) => right.length - left.length);
  for (const secret of known) {
    for (const variant of new Set([secret, encodeURIComponent(secret), JSON.stringify(secret).slice(1, -1)])) {
      text = text.split(variant).join(REDACTED);
    }
  }
  return text
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, REDACTED)
    .replace(/(\b(?:Bearer|Basic)\s+)[A-Za-z0-9+/_=.:-]+/gi, `$1${REDACTED}`)
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@?#]+(?::[^\s/@?#]*)?@/gi, `$1${REDACTED}@`)
    .replace(LABELED_SECRET, `$1${REDACTED}`)
    .replace(/\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED)
    .replace(/\b(?:v1|b1):[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+/g, REDACTED)
    .replace(/\b(?:0x)?[a-f0-9]{64}\b/gi, REDACTED)
    .replace(/\b[1-9A-HJ-NP-Za-km-z]{80,100}\b/g, REDACTED)
    .slice(0, Math.max(0, Math.min(maxLength, 32768)));
}

/** Redact diagnostic objects recursively, preserving public transaction IDs. */
export function redactSecretData<T>(value: T, secrets: Iterable<string> = []): T {
  const known = [...secrets];
  const seen = new WeakSet<object>();
  function visit(item: unknown, key = "", depth = 0): unknown {
    if (typeof item === "string") {
      if (isSecretFieldName(key)) return item ? REDACTED : item;
      if (/^(?:tx_?hash|transaction_?hash|block_?hash)$/i.test(key) && /^(?:0x)?[a-f0-9]{64}$/i.test(item)
        && !known.some((secret) => secret && item.replace(/^0x/i, "") === secret.replace(/^0x/i, ""))) return item;
      return redactSecretText(item, known, 32768);
    }
    if (item === null || typeof item !== "object") return item;
    if (depth >= 12) return "[truncated]";
    if (item instanceof Date) return item;
    if (item instanceof Error) return { name: item.name, message: redactSecretText(item, known) };
    if (seen.has(item)) return "[circular]";
    seen.add(item);
    const result = Array.isArray(item)
      ? item.map((entry) => visit(entry, key, depth + 1))
      : Object.fromEntries(Object.entries(item).map(([name, entry]) => [name,
        isSecretFieldName(name) && entry != null && typeof entry === "object" ? REDACTED : visit(entry, name, depth + 1)]));
    seen.delete(item);
    return result;
  }
  return visit(value) as T;
}
