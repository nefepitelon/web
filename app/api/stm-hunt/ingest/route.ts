import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { redactSecretText } from "@/lib/secret-redaction";
import { validStmSignature, verifyStmBscSwap, type StmWalletProfile } from "@/lib/stm-hunt/onchain";
import { assessStmTokenRisk } from "@/lib/stm-hunt/risk";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };
const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/).transform(v => v as `0x${string}`);
const schema = z.object({ chain: z.literal("bsc"), hash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).transform(v => v as `0x${string}`), wallet: address, token: address });

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") || 0) > 16_384) return Response.json({ ok: false, error: "请求过大" }, { status: 413, headers });
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 16_384) return Response.json({ ok: false, error: "请求过大" }, { status: 413, headers });
    if (!validStmSignature(raw, request.headers.get("x-stm-timestamp"), request.headers.get("x-stm-signature"), process.env.STM_INGEST_SECRET)) {
      return Response.json({ ok: false, error: "无效的采集器签名或时间戳" }, { status: 401, headers });
    }
    const budget = await checkRateLimit("stm:provider-ingest", 120, 60_000);
    if (!budget.allowed) return Response.json({ ok: false, error: "采集速率超限" }, { status: 429, headers: { ...headers, "Retry-After": String(budget.retryAfterSeconds) } });
    const input = schema.parse(JSON.parse(raw));
    const key = `bsc:${input.hash.toLowerCase()}:${input.wallet.toLowerCase()}:${input.token.toLowerCase()}`;
    const existing = await prisma.stmHuntRecord.findUnique({ where: { userId_kind_key: { userId: "system", kind: "chain-event", key } } });
    if (existing) return Response.json({ ok: true, duplicate: true, id: key }, { headers });
    const [profileRow, risk] = await Promise.all([
      prisma.stmHuntRecord.findUnique({ where: { userId_kind_key: { userId: "system", kind: "vetted-wallet", key: `bsc:${input.wallet.toLowerCase()}` } } }),
      assessStmTokenRisk({ chain: "bsc", address: input.token }),
    ]);
    const profile = profileRow?.payload as unknown as StmWalletProfile | undefined;
    const event = await verifyStmBscSwap(input, profile || null, { passed: risk.riskPassed, liquidityUsd: risk.liquidityUsd, routeAvailable: risk.routeAvailable });
    try {
      await prisma.stmHuntRecord.create({ data: { userId: "system", kind: "chain-event", key, payload: { ...event } } });
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "P2002") throw error;
      return Response.json({ ok: true, duplicate: true, id: key }, { headers });
    }
    return Response.json({ ok: true, id: event.id, qualified: event.qualified, riskPassed: event.riskPassed, routeAvailable: event.routeAvailable }, { headers });
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "成交核验失败";
    return Response.json({ ok: false, error: redactSecretText(message || "成交核验失败", [process.env.BSC_RPC_URL ?? "", process.env.GOPLUS_ACCESS_TOKEN ?? ""]) }, { status: 400, headers });
  }
}
