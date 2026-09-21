import "server-only";
import { ZodError } from "zod";
import type { Viewer } from "@/lib/membership";
import { getActiveViewerAccess, getViewer } from "@/lib/membership";

export class AlphaExecutionAccessError extends Error {
  status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.name = "AlphaExecutionAccessError";
    this.status = status;
  }
}

export async function requireAlphaOperator(options: { live?: boolean } = {}): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) throw new AlphaExecutionAccessError("请先登录后配置交易执行器", 401);
  if (viewer.status !== "ACTIVE") throw new AlphaExecutionAccessError("当前账户不可用", 403);
  if (viewer.role !== "admin" && viewer.plan !== "max") {
    throw new AlphaExecutionAccessError("Binance 执行器仅向 Max 或管理员账户开放", 403);
  }
  if (viewer.needsSecondFactor) throw new AlphaExecutionAccessError("请先完成双重验证", 403);
  if (options.live && (viewer.role !== "admin" || !viewer.twoFactorEnabled || !viewer.twoFactorPassed)) {
    throw new AlphaExecutionAccessError("生产实盘仅允许已启用并通过双重验证的管理员", 403);
  }
  return viewer;
}

export async function requireAlphaReadOperator(): Promise<{ id: string }> {
  const viewer = await getActiveViewerAccess();
  if (!viewer) throw new AlphaExecutionAccessError("请先登录后配置交易执行器", 401);
  if (viewer.status !== "ACTIVE") throw new AlphaExecutionAccessError("当前账户不可用", 403);
  if (!viewer.isAdmin && !viewer.hasMaxAccess) {
    throw new AlphaExecutionAccessError("Binance 执行器仅向 Max 或管理员账户开放", 403);
  }
  if (!viewer.twoFactorPassed) throw new AlphaExecutionAccessError("请先完成双重验证", 403);
  return { id: viewer.id };
}

export function alphaExecutionErrorResponse(caught: unknown) {
  const status = caught instanceof AlphaExecutionAccessError ? caught.status : 400;
  const details = caught && typeof caught === "object"
    ? caught as { code?: unknown; actionRequired?: unknown; statusUnknown?: unknown }
    : null;
  const message = caught instanceof ZodError
    ? (caught.issues[0]?.message || "提交内容不完整，请检查后重试")
    : caught instanceof Error
      ? caught.message
      : "交易执行请求失败，请稍后重试";
  return Response.json(
    {
      ok: false,
      error: message,
      message,
      ...(typeof details?.code === "number" ? { exchangeCode: details.code } : {}),
      ...(typeof details?.actionRequired === "string" ? { actionRequired: details.actionRequired, retriable: false, state: "FAILED" } : {}),
      ...(details?.statusUnknown === true ? { executionStatusUnknown: true, retriable: false, state: "UNKNOWN" } : {})
    },
    { status, headers: { "Cache-Control": "private, no-store" } }
  );
}
