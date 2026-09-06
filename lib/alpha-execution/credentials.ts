import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";

function encryptionKey() {
  const source = process.env.TRADING_CREDENTIALS_ENCRYPTION_KEY;
  if (!source || source.length < 32) {
    throw new Error("TRADING_CREDENTIALS_ENCRYPTION_KEY is not configured");
  }
  return createHash("sha256").update(source).digest();
}

export function encryptTradingSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(":");
}

export function decryptTradingSecret(value: string) {
  const [version, ivValue, tagValue, ciphertextValue] = value.split(":");
  if (version !== VERSION || !ivValue || !tagValue || !ciphertextValue) throw new Error("Trading credential payload is invalid");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

export function apiKeyHint(value: string) {
  const normalized = value.trim();
  if (normalized.length <= 8) return "••••";
  return `${normalized.slice(0, 4)}••••${normalized.slice(-4)}`;
}

function privateIpv4(hostname: string) {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const values = match.slice(1).map(Number);
  if (values.some((part) => part > 255)) return true;
  const [a, b] = values;
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function normalizeTradingProxy(value: string | null | undefined) {
  const proxy = String(value ?? "").trim();
  if (!proxy) return "";
  if (proxy.toLowerCase() === "direct") return "direct";
  let url: URL;
  try {
    url = new URL(proxy.includes("://") ? proxy : `http://${proxy}`);
  } catch {
    throw new Error("代理地址格式无效");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("云端执行器仅支持 HTTP/HTTPS CONNECT 代理");
  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".local") || privateIpv4(hostname) || hostname === "::1") {
    throw new Error("代理不能指向本机或私有网络地址");
  }
  if (!url.port) throw new Error("代理地址必须包含端口");
  return url.toString().replace(/\/$/, "");
}

export function maskProxy(value: string | null | undefined) {
  if (!value) return null;
  if (value === "direct") return "direct";
  try {
    const url = new URL(value);
    if (url.password) url.password = "••••";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "configured";
  }
}
