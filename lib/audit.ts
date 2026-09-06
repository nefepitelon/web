import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requestContext } from "@/lib/request-security";

export async function writeAudit(input: {
  actorUserId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  request?: Request;
}) {
  const context = await requestContext(input.request);
  return prisma.auditLog.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
      ...context
    }
  });
}
