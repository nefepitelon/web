import { getActiveViewerId, getViewer } from "@/lib/membership";
import { dashboardState, executeCommand, limitRequests } from "@/lib/box-breakout/service";
import { BoxError, errorResponse, readCommand } from "@/lib/box-breakout/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const userId = (await getActiveViewerId()) ?? undefined;
    await limitRequests(request, "state", 90, userId, { persistent: false });
    const search = new URL(request.url).searchParams;
    const version = (name: string) => {
      const value = search.get(name);
      return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
    };
    const knownVersions = search.has("stockVersion") || search.has("cryptoVersion")
      ? { stockVersion: version("stockVersion"), cryptoVersion: version("cryptoVersion") }
      : undefined;
    return Response.json(await dashboardState(userId, knownVersions), { headers });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const command = await readCommand(request);
    const viewer = await getViewer();
    if (!viewer || viewer.status !== "ACTIVE" || viewer.needsSecondFactor) throw new BoxError("请先登录并完成账户验证", 401);
    await limitRequests(request, "commands", 30, viewer.id);
    if (command.action === "scan") await limitRequests(request, "scan", 4, viewer.id);
    if (command.action === "telegram-test") await limitRequests(request, "telegram-test", 2, viewer.id);
    return Response.json(await executeCommand(viewer.id, command), { headers });
  } catch (error) { return errorResponse(error); }
}
