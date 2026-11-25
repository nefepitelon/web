import "server-only";

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

/** A durable unique insert, independent of process and time-window boundaries. */
export async function claimResearchOperation(agentKey: string, requestId: string, step: string) {
  const key = `bstock:research:${createHash("sha256").update(`${agentKey}:${requestId}:${step}`).digest("hex")}`;
  try {
    await prisma.rateLimitBucket.create({ data: {
      key, windowStart: new Date(0), count: 1, expiresAt: new Date(Date.now() + 24 * 60 * 60_000)
    } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      throw new Error("该付款或授权预览已经提交过。请核对钱包记录与既有研报任务，勿重复签名或付款。");
    }
    throw error;
  }
}
