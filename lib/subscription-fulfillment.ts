import "server-only";

import { Prisma } from "@prisma/client";
import { createSubscriptionReferralRewards } from "@/lib/referrals";

export async function activatePaidSubscription(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    provider: string;
    providerSubscriptionId: string;
    planKey: "pro" | "max";
    billingInterval: "month" | "year";
    amountCents: number;
    paymentEventId: string;
    grantedBy: string;
    startedAt?: Date;
  }
) {
  const now = input.startedAt ?? new Date();
  const periodEnd = new Date(now);
  if (input.billingInterval === "year") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);

  await tx.subscription.updateMany({
    where: {
      userId: input.userId,
      providerSubscriptionId: { not: input.providerSubscriptionId },
      planKey: { in: ["pro", "max"] },
      status: { in: ["ACTIVE", "TRIALING"] }
    },
    data: { status: "CANCELED", canceledAt: now }
  });

  await tx.subscription.upsert({
    where: { providerSubscriptionId: input.providerSubscriptionId },
    update: {
      provider: input.provider,
      planKey: input.planKey,
      billingInterval: input.billingInterval,
      amountCents: input.amountCents,
      status: "ACTIVE",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      canceledAt: null,
      cancelAtPeriodEnd: false
    },
    create: {
      userId: input.userId,
      provider: input.provider,
      providerSubscriptionId: input.providerSubscriptionId,
      planKey: input.planKey,
      billingInterval: input.billingInterval,
      amountCents: input.amountCents,
      status: "ACTIVE",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd
    }
  });

  const role = await tx.role.upsert({
    where: { key: input.planKey },
    update: {},
    create: { key: input.planKey, name: input.planKey === "max" ? "Max" : "Pro" }
  });
  const paidRoles = await tx.role.findMany({ where: { key: { in: ["pro", "max"] } }, select: { id: true } });
  await tx.userRole.deleteMany({ where: { userId: input.userId, roleId: { in: paidRoles.map((item) => item.id) } } });
  await tx.userRole.upsert({
    where: { userId_roleId: { userId: input.userId, roleId: role.id } },
    update: { grantedBy: input.grantedBy },
    create: { userId: input.userId, roleId: role.id, grantedBy: input.grantedBy }
  });

  await createSubscriptionReferralRewards(tx, {
    userId: input.userId,
    paymentEventId: input.paymentEventId,
    planKey: input.planKey,
    amountCents: input.amountCents,
    currency: "usd"
  });

  return { currentPeriodStart: now, currentPeriodEnd: periodEnd };
}
