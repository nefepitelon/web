import "server-only";
import { gzipSync, gunzipSync } from "node:zlib";

export interface CaptureCacheEnvelope { encoding: "gzip-base64"; data: string }
// Leave room below Runtime Cache's 2 MB item limit, including the JSON envelope.
const MAX_ENVELOPE_BYTES = 1_900_000;
const MAX_CAPTURE_BYTES = 32 * 1024 * 1024;

export function encodeCaptureCache(value: unknown): CaptureCacheEnvelope | null {
  try {
    const json = JSON.stringify(value);
    if (typeof json !== "string" || Buffer.byteLength(json, "utf8") > MAX_CAPTURE_BYTES) return null;
    const data = gzipSync(json, { level: 1 }).toString("base64");
    const envelope: CaptureCacheEnvelope = { encoding: "gzip-base64", data };
    return Buffer.byteLength(JSON.stringify(envelope), "utf8") <= MAX_ENVELOPE_BYTES ? envelope : null;
  } catch { return null; }
}

export function decodeCaptureCache<T>(value: unknown): T | null {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const envelope = value as Record<string, unknown>;
    if (envelope.encoding !== "gzip-base64" || typeof envelope.data !== "string"
      || envelope.data.length === 0 || envelope.data.length > MAX_ENVELOPE_BYTES
      || envelope.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(envelope.data)) return null;
    if (Buffer.byteLength(JSON.stringify({ encoding: envelope.encoding, data: envelope.data }), "utf8") > MAX_ENVELOPE_BYTES) return null;
    const compressed = Buffer.from(envelope.data, "base64");
    // Buffer.from tolerates malformed padding; only the canonical representation is accepted.
    if (compressed.toString("base64") !== envelope.data) return null;
    return JSON.parse(gunzipSync(compressed, { maxOutputLength: MAX_CAPTURE_BYTES }).toString("utf8")) as T;
  } catch { return null; }
}
