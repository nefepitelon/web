import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireViewer } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { evaluateReferralQualification } from "@/lib/referrals";
import { assertSameOrigin } from "@/lib/request-security";

const schema = z.object({ platform: z.string().trim().min(1).max(40) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireViewer("/account/referrals");
    const input = schema.parse(await request.json());
    await prisma.userOnboardingTask.upsert({
      where: { userId_taskKey: { userId: viewer.id, taskKey: "share_referral" } },
      update: { completedAt: new Date(), metadata: { platform: input.platform } as Prisma.InputJsonValue },
      create: { userId: viewer.id, taskKey: "share_referral", metadata: { platform: input.platform } as Prisma.InputJsonValue }
    });
    await evaluateReferralQualification(viewer.id);
    return Response.json({ ok: true });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Unable to record referral share";
    return Response.json({ error: message }, { status: 400 });
  }
}
