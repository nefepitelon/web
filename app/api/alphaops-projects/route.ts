import { getViewer } from "@/lib/membership";
import { assertSameOrigin } from "@/lib/request-security";
import projectStateHandler from "@/lib/alphaops-project-state.js";

export const dynamic = "force-dynamic";

async function handle(request: Request) {
  const viewer = await getViewer();
  const canContribute = Boolean(viewer && viewer.status === "ACTIVE" && !viewer.needsSecondFactor);
  if (request.method !== "GET") {
    if (!canContribute) return Response.json({ error: "请先完成登录验证" }, { status: viewer ? 403 : 401 });
    try { assertSameOrigin(request); }
    catch { return Response.json({ error: "Cross-origin request rejected" }, { status: 403 }); }
  }

  let body = "";
  const headers = new Headers({ "Cache-Control": "private, no-store" });
  const response = {
    statusCode: 200,
    setHeader(name: string, value: string) { headers.set(name, value); },
    end(value: string) { body = value; }
  };
  await projectStateHandler({
    method: request.method,
    body: request.method === "GET" ? undefined : await request.text(),
    access: { canContribute, canManageProjects: canContribute && viewer?.role === "admin" }
  }, response);
  headers.set("Cache-Control", "private, no-store");
  return new Response(body, { status: response.statusCode, headers });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
