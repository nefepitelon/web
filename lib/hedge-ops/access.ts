import "server-only";
import { redactSecretText } from "@/lib/secret-redaction";
import { getViewer, type Viewer } from "@/lib/membership";
import { configuredAccess } from "@/lib/content-gates";

export class HedgeOpsError extends Error {
  constructor(message: string, public status = 400) { super(redactSecretText(message)); }
}

export async function requireHedgeOperator() {
  const viewer = await getViewer();
  if (!viewer) throw new HedgeOpsError("请先登录套利对冲Ops", 401);
  if (viewer.status !== "ACTIVE" || viewer.needsSecondFactor) throw new HedgeOpsError("请完成账户验证后重试", 403);
  if (!(await configuredAccess(viewer, "grid.ops")).allowed) throw new HedgeOpsError("套利对冲Ops 需要 Max 或管理员权限", 403);
  return viewer;
}

export function requireHedgeLiveOperator(viewer: Viewer) {
  if (!canHedgeLiveOperate(viewer)) {
    throw new HedgeOpsError("实盘操作需要启用并通过双重验证的管理员账户", 403);
  }
}

export function canHedgeLiveOperate(viewer: Viewer) {
  return viewer.role === "admin" && viewer.twoFactorEnabled && viewer.twoFactorPassed;
}

export function requireHedgeSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new HedgeOpsError("请从平台内提交操作", 403);
  }
}

export function hedgeErrorResponse(error: unknown) {
  const message = redactSecretText(error instanceof Error ? error.message : "对冲操作失败");
  return Response.json({ ok: false, error: message, message, detail: message }, {
    status: error instanceof HedgeOpsError ? error.status : 400,
    headers: { "Cache-Control": "private, no-store" },
  });
}
