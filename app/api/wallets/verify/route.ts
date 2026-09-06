import { verifyMessage } from "viem";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requireViewer } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";
import { evaluateReferralQualification } from "@/lib/referrals";

const schema = z.object({ challengeId: z.string().min(1), signature: z.string().min(10) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireViewer("/account/connections");
    const input = schema.parse(await request.json());
    const challenge = await prisma.walletChallenge.findFirst({
      where: { id: input.challengeId, userId: viewer.id, usedAt: null }
    });
    if (!challenge || challenge.expiresAt.getTime() < Date.now()) {
      return Response.json({ error: "签名请求已过期，请重新发起" }, { status: 400 });
    }

    const valid = await verifyMessage({
      address: challenge.address as `0x${string}`,
      message: challenge.message,
      signature: input.signature as `0x${string}`
    });
    if (!valid) return Response.json({ error: "签名与钱包地址不匹配" }, { status: 400 });

    const wallet = await prisma.$transaction(async (tx) => {
      const existing = await tx.wallet.findUnique({
        where: { chain_address: { chain: "EVM", address: challenge.address } }
      });
      if (existing && existing.userId !== viewer.id) {
        throw new Error("该钱包已绑定到其他账户，无法转移所有权");
      }
      await tx.walletChallenge.update({ where: { id: challenge.id }, data: { usedAt: new Date() } });
      return tx.wallet.upsert({
        where: { chain_address: { chain: "EVM", address: challenge.address } },
        create: { userId: viewer.id, chain: "EVM", address: challenge.address },
        update: { verifiedAt: new Date() }
      });
    });
    await writeAudit({ actorUserId: viewer.id, action: "connection.wallet.linked", targetType: "wallet", targetId: wallet.id, metadata: { chain: wallet.chain, address: wallet.address }, request });
    await evaluateReferralQualification(viewer.id);
    return Response.json({ wallet });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "钱包签名验证失败";
    return Response.json({ error: message }, { status: 400 });
  }
}
