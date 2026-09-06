import { randomBytes } from "node:crypto";
import { getAddress, isAddress } from "viem";
import { z } from "zod";
import { requireViewer } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";

const schema = z.object({ chain: z.literal("EVM"), address: z.string() });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireViewer("/account/connections");
    const input = schema.parse(await request.json());
    if (!isAddress(input.address)) return Response.json({ error: "EVM 地址无效" }, { status: 400 });
    const address = getAddress(input.address);
    const nonce = randomBytes(16).toString("hex");
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 10 * 60 * 1000);
    const message = [
      "welinkBTC wallet connection",
      "",
      `Address: ${address}`,
      `User: ${viewer.id}`,
      `Nonce: ${nonce}`,
      `Issued At: ${issuedAt.toISOString()}`,
      `Expiration Time: ${expiresAt.toISOString()}`,
      "",
      "This signature only verifies wallet ownership. It does not authorize a transaction or login."
    ].join("\n");
    const challenge = await prisma.walletChallenge.create({
      data: { userId: viewer.id, chain: "EVM", address, nonce, message, expiresAt }
    });
    return Response.json({ id: challenge.id, message: challenge.message, expiresAt });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "无法创建钱包验证请求";
    return Response.json({ error: message }, { status: 400 });
  }
}
