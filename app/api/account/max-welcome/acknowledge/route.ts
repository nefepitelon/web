import { Prisma } from "@prisma/client";
import { getViewer } from "@/lib/membership";
import { WELINK_ACCESS_CODE, WELINK_MAX_TRIAL_ANNOUNCEMENT_TASK } from "@/lib/max-trial";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await getViewer();
    if (!viewer) return Response.json({ error: "请先登录" }, { status: 401 });

    await prisma.userOnboardingTask.upsert({
      where: {
        userId_taskKey: {
          userId: viewer.id,
          taskKey: WELINK_MAX_TRIAL_ANNOUNCEMENT_TASK
        }
      },
      update: { completedAt: new Date() },
      create: {
        userId: viewer.id,
        taskKey: WELINK_MAX_TRIAL_ANNOUNCEMENT_TASK,
        metadata: { campaign: "welink_max_3m_20261025", accessCode: WELINK_ACCESS_CODE } as Prisma.InputJsonValue
      }
    });
    return Response.json({ ok: true });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Unable to acknowledge announcement";
    return Response.json({ error: message }, { status: 400 });
  }
}
