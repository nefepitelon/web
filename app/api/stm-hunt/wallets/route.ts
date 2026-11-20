import { randomUUID } from "node:crypto";
import { z } from "zod";
import { isAddress } from "viem";
import { prisma } from "@/lib/prisma";
import { alphaExecutionErrorResponse, requireAlphaOperator, requireAlphaReadOperator } from "@/lib/alpha-execution/access";
import { assertSameOrigin } from "@/lib/request-security";
import type { StmWalletProfile } from "@/lib/stm-hunt/onchain";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const schema = z.object({
  action: z.enum(["save", "remove"]), chain: z.enum(["bsc", "solana", "ethereum", "base"]),
  address: z.string().min(20).max(64), label: z.string().trim().max(80).default(""),
  group: z.string().trim().max(60).default("我的观察组"), vetted: z.boolean().optional(),
  clusterId: z.string().trim().min(3).max(120).optional(),
});
function identity(chain: string, address: string) {
  if (chain === "solana") {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) throw new Error("Solana 地址格式无效");
    return address;
  }
  if (!isAddress(address)) throw new Error("EVM 地址格式无效");
  return address.toLowerCase();
}
export async function GET() {
  try {
    const viewer = await requireAlphaReadOperator();
    const rows = await prisma.stmHuntRecord.findMany({ where: { userId: viewer.id, kind: "wallet" }, orderBy: { updatedAt: "desc" }, take: 500 });
    return Response.json({ ok: true, wallets: rows.map(r => r.payload) }, { headers });
  } catch (error) { return alphaExecutionErrorResponse(error); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = schema.parse(await request.json());
    const viewer = await requireAlphaOperator({ live: body.vetted === true });
    const address = identity(body.chain, body.address);
    const key = `${body.chain}:${address}`;
    if (body.action === "remove") {
      await prisma.$transaction(async tx => {
        await tx.stmHuntRecord.deleteMany({ where: { userId: viewer.id, kind: "wallet", key } });
        if (body.vetted) await tx.stmHuntRecord.deleteMany({ where: { userId: "system", kind: "vetted-wallet", key } });
      });
      return Response.json({ ok: true }, { headers });
    }
    if (body.vetted && !body.clusterId) throw new Error("审核独立实体必须填写经核验的资金关联组，关联地址使用相同组号");
    const count = await prisma.stmHuntRecord.count({ where: { userId: viewer.id, kind: "wallet" } });
    const old = await prisma.stmHuntRecord.findUnique({ where: { userId_kind_key: { userId: viewer.id, kind: "wallet", key } } });
    if (!old && count >= 500) throw new Error("每个账户最多监控 500 个地址");
    const profile: StmWalletProfile = {
      id: old?.id || randomUUID(), chain: body.chain, address, label: body.label, group: body.group,
      clusterId: body.vetted ? body.clusterId! : null, qualified: body.vetted === true,
      reviewedAt: body.vetted ? new Date().toISOString() : null,
    };
    await prisma.$transaction(async tx => {
      await tx.stmHuntRecord.upsert({ where: { userId_kind_key: { userId: viewer.id, kind: "wallet", key } }, create: { userId: viewer.id, kind: "wallet", key, payload: { ...profile } }, update: { payload: { ...profile } } });
      if (body.vetted) await tx.stmHuntRecord.upsert({ where: { userId_kind_key: { userId: "system", kind: "vetted-wallet", key } }, create: { userId: "system", kind: "vetted-wallet", key, payload: { ...profile } }, update: { payload: { ...profile } } });
    });
    return Response.json({ ok: true, wallet: profile }, { headers });
  } catch (error) { return alphaExecutionErrorResponse(error); }
}
