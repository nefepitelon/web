import { requireViewer } from "@/lib/membership";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const viewer = await requireViewer("/account");
  const [code, referrals, commissions] = await Promise.all([
    prisma.referralCode.findFirst({ where: { userId: viewer.id, active: true } }),
    prisma.referral.findMany({
      where: { referrerUserId: viewer.id },
      include: { referred: { select: { email: true, createdAt: true } } },
      orderBy: { createdAt: "desc" }
    }),
    prisma.commissionLedger.findMany({ where: { referrerUserId: viewer.id }, orderBy: { createdAt: "desc" } })
  ]);
  return Response.json({ code, referrals, commissions }, { headers: { "Cache-Control": "private, no-store" } });
}
