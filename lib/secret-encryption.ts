import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

const VERSION = "b1";
const PURPOSE = "welinkbtc-context-bound-binary-secret-v1";
const MAX_BYTES = 8 * 1024 * 1024;

function encryptionKey() {
  const source = process.env.TRADING_CREDENTIALS_ENCRYPTION_KEY;
  if (!source || source.length < 32) throw new Error("Server encryption is not configured");
  const master = createHash("sha256").update(source).digest();
  try { return createHmac("sha256", master).update(PURPOSE).digest(); }
  finally { master.fill(0); }
}

function associatedData(context: string) {
  if (typeof context !== "string" || !context || context.length > 1024) throw new Error("Encryption context is invalid");
  return Buffer.from(JSON.stringify([PURPOSE, context]), "utf8");
}

function decodePart(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Encrypted secret payload is invalid");
  const bytes = Buffer.from(value, "base64url");
  if (bytes.toString("base64url") !== value) throw new Error("Encrypted secret payload is invalid");
  return bytes;
}

/** Ciphertext string for storage; no binary plaintext is returned to a browser. */
export function encryptSecretBytes(bytes: Uint8Array, context: string): string {
  if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > MAX_BYTES) throw new Error("Secret file size is invalid");
  const aad = associatedData(context);
  const key = encryptionKey();
  try {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
    return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(":");
  } finally { key.fill(0); }
}

/** Authenticates purpose, owner/record context and size before releasing bytes. */
export function decryptSecretBytes(value: string, context: string, maxBytes = MAX_BYTES): Buffer {
  const aad = associatedData(context);
  if (typeof value !== "string" || value.length > MAX_BYTES * 2 || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_BYTES) throw new Error("Encrypted secret payload is invalid");
  const parts = value.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error("Encrypted secret payload is invalid");
  const iv = decodePart(parts[1]);
  const tag = decodePart(parts[2]);
  const ciphertext = decodePart(parts[3]);
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length > maxBytes) throw new Error("Encrypted secret payload is invalid");
  const key = encryptionKey();
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch { throw new Error("Encrypted secret payload is invalid"); }
  finally { key.fill(0); }
}
