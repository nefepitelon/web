import { z } from "zod";
import { getViewer } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";

const schema = z.object({
  sessionId: z.string().uuid(),
  eventType: z.literal("PAGE_VIEW"),
  path: z.string().trim().startsWith("/").max(300)
});

export async function POST(request: Request) {
  let input: z.infer<typeof schema>;
  try {
    assertSameOrigin(request);
    input = schema.parse(await request.json());
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }

  try {
    const viewer = await getViewer();
    const now = new Date();
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    await prisma.analyticsEvent.upsert({
      where: { sessionId_eventType_path_day: { sessionId: input.sessionId, eventType: input.eventType, path: input.path, day } },
      update: { userId: viewer?.id ?? undefined },
      create: { userId: viewer?.id, sessionId: input.sessionId, eventType: input.eventType, path: input.path, day }
    });
    return Response.json({ ok: true, persisted: true });
  } catch (caught) {
    console.warn("[analytics/event] persistence unavailable", {
      path: input.path,
      message: caught instanceof Error ? caught.message : String(caught),
    });
    return Response.json({ ok: false, persisted: false }, { status: 202 });
  }
}
