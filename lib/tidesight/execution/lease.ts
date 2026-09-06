import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getOrCreateTideSightExecutionConfig } from "./data";

// Longer than the 300-second function deadline: a terminated writer cannot overlap its successor.
export async function withExecutionLease<T>(userId: string, work: (token: string) => Promise<T>): Promise<T> {
  await getOrCreateTideSightExecutionConfig(userId);
  const token = randomUUID();
  const acquired = await prisma.tideSightExecutionConfig.updateMany({
    where: { userId, OR: [{ executionLeaseUntil: null }, { executionLeaseUntil: { lt: new Date() } }] },
    data: { executionLeaseToken: token, executionLeaseUntil: new Date(Date.now() + 600_000) },
  });
  if (!acquired.count) throw new Error("TideSight 执行/对账正在进行，请稍后重试；未重复提交订单");
  try { return await work(token); }
  finally {
    await prisma.tideSightExecutionConfig.updateMany({ where: { userId, executionLeaseToken: token }, data: { executionLeaseToken: null, executionLeaseUntil: null } });
  }
}
