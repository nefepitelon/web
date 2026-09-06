import { requireAdmin } from "@/lib/membership";
import { prisma } from "@/lib/prisma";

export async function GET() {
  await requireAdmin("/admin");
  const [users, subscriptions, commissions] = await Promise.all([
    prisma.user.count(),
    prisma.subscription.count({ where: { status: { in: ["ACTIVE", "TRIALING"] } } }),
    prisma.commissionLedger.count({ where: { status: "PENDING" } })
  ]);
  return Response.json({ users, subscriptions, commissions }, { headers: { "Cache-Control": "private, no-store" } });
}
