import { z } from "zod";
import type { Market } from "./types";

export class BoxError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const stockSymbol = z.string().regex(/^(?:00[0-9]{4}|30[0-9]{4}|60[0-9]{4}|68[0-9]{4})$/, "请输入沪深 A 股六位代码");
export const cryptoSymbol = z.string().regex(/^[A-Z0-9]{2,24}USDT$/, "请输入 USDT 交易对代码");
const time = z.string().regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/, "时间格式须为 HH:mm");
export const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("scan"), mode: z.enum(["market", "quick", "pool", "crypto", "crypto-radar", "crypto-mainstream"]) }).strict(),
  z.object({ action: z.literal("cancel") }).strict(),
  z.object({ action: z.literal("pool-add"), symbol: stockSymbol, name: z.string().trim().min(1).max(40).optional() }).strict(),
  z.object({ action: z.literal("pool-remove"), symbol: stockSymbol }).strict(),
  z.object({ action: z.literal("settings"), sectors: z.array(z.string().trim().min(1).max(40)).max(30).optional(), auto: z.boolean().optional(), autoTimes: z.array(time).min(1).max(4).optional(), telegramEnabled: z.boolean().optional(), telegramChat: z.string().trim().max(100).regex(/^(?:-?[0-9]{1,20}|@[A-Za-z][A-Za-z0-9_]{3,31})?$/, "Telegram Chat ID 格式无效").optional(), telegramToken: z.string().trim().max(150).regex(/^(?:[0-9]{5,20}:[A-Za-z0-9_-]{20,100})?$/, "Telegram Bot Token 格式无效").optional() }).strict(),
  z.object({ action: z.literal("telegram-test") }).strict(),
]);

export function validateSymbol(symbol: string, market: Market) {
  return (market === "ashare" ? stockSymbol : cryptoSymbol).parse(symbol);
}
export function readMarket(params: URLSearchParams): Market {
  return z.enum(["ashare", "crypto"]).parse(params.get("market"));
}
export function readSymbols(params: URLSearchParams, maximum = 20) {
  const market = readMarket(params);
  const raw = params.get("symbols") ?? "";
  if (raw.length > 600) throw new BoxError("交易对参数过长");
  const symbols = [...new Set(raw.split(",").map(value => value.trim()).filter(Boolean))];
  if (!symbols.length || symbols.length > maximum) throw new BoxError(`每次请求须包含 1–${maximum} 个标的`);
  return { market, symbols: symbols.map(symbol => validateSymbol(symbol, market)) };
}

export async function readCommand(request: Request) {
  // Reject missing Origin as well as mismatches: these commands are browser-only.
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") throw new BoxError("仅允许本站发起的操作", 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new BoxError("请发送 JSON 请求", 415);
  if (Number(request.headers.get("content-length") ?? 0) > 16_384) throw new BoxError("请求内容过大", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new BoxError("请求内容为空");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length;
      if (size > 16_384) { await reader.cancel(); throw new BoxError("请求内容过大", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let input: unknown;
  try { input = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new BoxError("JSON 格式无效"); }
  return commandSchema.parse(input);
}

export function errorResponse(error: unknown) {
  const status = error instanceof BoxError ? error.status : error instanceof z.ZodError ? 400 : 503;
  const message = error instanceof BoxError ? error.message : error instanceof z.ZodError ? error.issues[0]?.message ?? "参数无效" : "服务暂时不可用，请稍后重试";
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store", ...(status === 429 ? { "Retry-After": "60" } : {}) } });
}
