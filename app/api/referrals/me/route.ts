import { requireViewer } from "@/lib/membership";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const viewer = await requireViewer("/account");
  const [code, referrals, commissions] = await Promise.all([
    prisma.referralCode.findFirst({ where: { userId: viewer.id, active: true }, select: { code: true, createdAt: true } }),
    prisma.referral.findMany({
      where: { referrerUserId: viewer.id },
      select: { id: true, qualifiedAt: true, createdAt: true },
      orderBy: { createdAt: "desc" }
    }),
    prisma.commissionLedger.findMany({
      where: { referrerUserId: viewer.id },
      select: { id: true, rewardType: true, level: true, planKey: true, amountCents: true, currency: true, rateBps: true, status: true, approvedAt: true, paidAt: true, createdAt: true },
      orderBy: { createdAt: "desc" }
    })
  ]);
  return Response.json({ code, referrals, commissions }, { headers: { "Cache-Control": "private, no-store" } });
}
