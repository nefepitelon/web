import "server-only";
import { normalizePublicTradingProxy } from "@/lib/trading-proxy-security";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";
const MAX_SECRET_BYTES = 16 * 1024 * 1024;

function encryptionKey() {
  const source = process.env.TRADING_CREDENTIALS_ENCRYPTION_KEY;
  if (!source || source.length < 32) {
    throw new Error("TRADING_CREDENTIALS_ENCRYPTION_KEY is not configured");
  }
  return createHash("sha256").update(source).digest();
}

export function encryptTradingSecret(value: string) {
  if (typeof value !== "string" || !value || Buffer.byteLength(value, "utf8") > MAX_SECRET_BYTES) throw new Error("Trading credential size is invalid");
  const iv = randomBytes(12);
  const key = encryptionKey();
  try {
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(":");
  } finally { key.fill(0); }
}

export function decryptTradingSecret(value: string) {
  const invalid = () => new Error("Trading credential payload is invalid");
  if (typeof value !== "string" || value.length > MAX_SECRET_BYTES * 2) throw invalid();
  const parts = value.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) throw invalid();
  const decode = (part: string) => {
    if (!/^[A-Za-z0-9_-]+$/.test(part)) throw invalid();
    const bytes = Buffer.from(part, "base64url");
    if (bytes.toString("base64url") !== part) throw invalid();
    return bytes;
  };
  const iv = decode(parts[1]), tag = decode(parts[2]), ciphertext = decode(parts[3]);
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length > MAX_SECRET_BYTES) throw invalid();
  const key = encryptionKey();
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    try { return plaintext.toString("utf8"); }
    finally { plaintext.fill(0); }
  } catch { throw invalid(); }
  finally { key.fill(0); }
}

export function apiKeyHint(value: string) {
  const normalized = value.trim();
  if (normalized.length <= 8) return "••••";
  return `${normalized.slice(0, 4)}••••${normalized.slice(-4)}`;
}

export function normalizeTradingProxy(value: string | null | undefined) {
  return normalizePublicTradingProxy(value);
}

export function maskProxy(value: string | null | undefined) {
  if (!value) return null;
  if (value === "direct") return "direct";
  try {
    const url = new URL(value);
    if (url.username) url.username = "••••";
    if (url.password) url.password = "••••";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "configured";
  }
}

