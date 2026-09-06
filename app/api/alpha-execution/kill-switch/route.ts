import { alphaExecutionErrorResponse, requireAlphaOperator } from "@/lib/alpha-execution/access";
import { releaseKillSwitch, triggerKillSwitch } from "@/lib/alpha-execution/service";
import { assertSameOrigin } from "@/lib/request-security";

export const maxDuration = 60;

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = request.headers.get("x-vercel-id");
  console.log(JSON.stringify({ level: "info", msg: "start", route: "/api/alpha-execution/kill-switch", action: "trigger", requestId }));
  try {
    assertSameOrigin(request);
    const viewer = await requireAlphaOperator();
    const result = await triggerKillSwitch(viewer.id);
    console.log(JSON.stringify({ level: "info", msg: "done", route: "/api/alpha-execution/kill-switch", action: "trigger", ok: result.ok, ms: Date.now() - startedAt, requestId }));
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) {
    console.error(JSON.stringify({ level: "error", msg: "failed", route: "/api/alpha-execution/kill-switch", action: "trigger", error: caught instanceof Error ? caught.message : String(caught), ms: Date.now() - startedAt, requestId }));
    return alphaExecutionErrorResponse(caught);
  }
}

export async function DELETE(request: Request) {
  const startedAt = Date.now();
  const requestId = request.headers.get("x-vercel-id");
  console.log(JSON.stringify({ level: "info", msg: "start", route: "/api/alpha-execution/kill-switch", action: "release", requestId }));
  try {
    assertSameOrigin(request);
    const viewer = await requireAlphaOperator({ live: true });
    const result = await releaseKillSwitch(viewer.id);
    console.log(JSON.stringify({ level: "info", msg: "done", route: "/api/alpha-execution/kill-switch", action: "release", ok: result.ok, ms: Date.now() - startedAt, requestId }));
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) {
    console.error(JSON.stringify({ level: "error", msg: "failed", route: "/api/alpha-execution/kill-switch", action: "release", error: caught instanceof Error ? caught.message : String(caught), ms: Date.now() - startedAt, requestId }));
    return alphaExecutionErrorResponse(caught);
  }
}
