import "server-only";
import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { decryptSecretBytes, encryptSecretBytes } from "@/lib/secret-encryption";

export const MAX_PAYMENT_PROOF_BYTES = 5 * 1024 * 1024;
const MAX_ENCRYPTED_BYTES = Math.ceil(MAX_PAYMENT_PROOF_BYTES * 4 / 3) + 1024;
const prefix = "/payment-proofs/secure-v1/";

function imageType(bytes: Uint8Array) {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { type: "image/png", extension: "png" };
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return { type: "image/jpeg", extension: "jpg" };
  if (b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return { type: "image/webp", extension: "webp" };
  throw new Error("INVALID_PROOF");
}

export function paymentProofContext(invoiceId: string, userId: string) {
  return `payment-proof:${invoiceId}:${userId}`;
}

export function trustedPaymentProofUrl(value: string) {
  const url = new URL(value);
  const token = process.env.BLOB_READ_WRITE_TOKEN ?? "";
  const storeId = /^vercel_blob_rw_([a-z0-9-]+)_/i.exec(token)?.[1]?.toLowerCase();
  if (!storeId) throw new Error("PROOF_STORAGE_NOT_CONFIGURED");
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash
    || url.hostname.toLowerCase() !== `${storeId}.public.blob.vercel-storage.com`
    || !url.pathname.startsWith("/payment-proofs/") || url.pathname.includes("%")) throw new Error("INVALID_PROOF_LOCATION");
  return url;
}

export async function storePaymentProof(file: File, invoiceId: string, userId: string) {
  if (!file.size || file.size > MAX_PAYMENT_PROOF_BYTES) throw new Error("PROOF_TOO_LARGE");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let encrypted: string;
  try {
    const detected = imageType(bytes);
    if (detected.type !== file.type) throw new Error("INVALID_PROOF");
    encrypted = encryptSecretBytes(bytes, paymentProofContext(invoiceId, userId));
  } finally { bytes.fill(0); }
  const blob = await put(`${prefix.slice(1)}${randomUUID()}.bin`, encrypted, {
    access: "public", addRandomSuffix: true, contentType: "application/octet-stream",
    cacheControlMaxAge: 60
  });
  trustedPaymentProofUrl(blob.url);
  return blob.url;
}

async function boundedBody(response: Response, maxBytes: number) {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) throw new Error("PROOF_TOO_LARGE");
  if (!response.body) throw new Error("PROOF_UNAVAILABLE");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > maxBytes) throw new Error("PROOF_TOO_LARGE");
      chunks.push(result.value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks);
}

export async function readPaymentProof(value: string, invoiceId: string, userId: string) {
  const url = trustedPaymentProofUrl(value);
  const encrypted = url.pathname.startsWith(prefix);
  const response = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error("PROOF_UNAVAILABLE");
  const stored = await boundedBody(response, encrypted ? MAX_ENCRYPTED_BYTES : MAX_PAYMENT_PROOF_BYTES);
  // Legacy receipts are proxied through the same authorization boundary until
  // an explicitly reviewed migration encrypts and removes their public copies.
  const bytes = encrypted ? decryptSecretBytes(stored.toString("utf8"), paymentProofContext(invoiceId, userId), MAX_PAYMENT_PROOF_BYTES) : stored;
  return { bytes, ...imageType(bytes) };
}
