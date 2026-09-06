import { z } from "zod";

const SAFE_ERROR_CODES = new Set([
  "analysis_empty_response",
  "analysis_failed",
  "analysis_timeout",
  "async_jobs_paused",
  "attempts_exhausted",
  "invalid_request",
  "job_conflict",
  "job_expired",
  "job_not_found",
  "job_service_unavailable",
  "job_state_unavailable",
  "payment_failed",
  "payment_backend_unavailable",
  "payment_rejected",
  "payment_unavailable",
  "request_too_large",
  "settlement_pending",
  "too_many_users",
  "wallet_rate_limited",
  "wallet_rate_limit_unavailable"
]);

const upstreamSchema = z.object({
  jobId: z.string().min(1).max(200).optional(),
  status: z.string().min(1).max(32).optional(),
  expiresAt: z.number().int().positive().optional(),
  errorCode: z.string().max(64).optional(),
  retryable: z.boolean().optional(),
  downloadUrl: z.string().url().optional(),
  downloadUrlExpiresAt: z.number().int().positive().optional()
}).passthrough();

const JOB_STATUSES = new Set(["settling", "queued", "running", "succeeded", "failed"]);

export type AgentStudioJobStatus = "settling" | "queued" | "running" | "succeeded" | "failed";

export type AgentStudioJobPayload = {
  jobId: string;
  status: AgentStudioJobStatus;
  expiresAt: number | null;
  errorCode: string | null;
  retryable: boolean;
  downloadUrl: string | null;
  downloadUrlExpiresAt: number | null;
};

export function safeAgentStudioErrorCode(value: unknown, fallback = "analysis_failed") {
  const code = typeof value === "string" ? value.trim().toLowerCase() : "";
  return SAFE_ERROR_CODES.has(code) ? code : fallback;
}

export function resolveAgentStudioTerminalErrorCode(errorCode: unknown, resumeCount: number) {
  if (typeof errorCode === "string" && errorCode.trim()) return safeAgentStudioErrorCode(errorCode);
  return Number.isInteger(resumeCount) && resumeCount >= 2 ? "attempts_exhausted" : "analysis_failed";
}

export function parseAgentStudioJobPayload(value: unknown, expectedJobId: string): AgentStudioJobPayload {
  const payload = upstreamSchema.parse(value);
  const jobId = payload.jobId || expectedJobId;
  if (jobId !== expectedJobId) throw new Error("Agent Studio returned a mismatched jobId.");
  const status = String(payload.status || "").toLowerCase();
  if (!JOB_STATUSES.has(status)) throw new Error("Agent Studio returned an invalid job status.");
  if (status === "failed" && typeof payload.retryable !== "boolean") {
    throw new Error("Agent Studio failed response omitted retryable state.");
  }
  if (status === "succeeded" && !payload.downloadUrl) {
    return {
      jobId,
      status: "succeeded",
      expiresAt: payload.expiresAt ?? null,
      errorCode: null,
      retryable: false,
      downloadUrl: null,
      downloadUrlExpiresAt: payload.downloadUrlExpiresAt ?? null
    };
  }
  return {
    jobId,
    status: status as AgentStudioJobStatus,
    expiresAt: payload.expiresAt ?? null,
    errorCode: status === "failed" ? safeAgentStudioErrorCode(payload.errorCode) : null,
    retryable: status === "failed" && payload.retryable === true,
    downloadUrl: status === "succeeded" ? payload.downloadUrl ?? null : null,
    downloadUrlExpiresAt: status === "succeeded" ? payload.downloadUrlExpiresAt ?? null : null
  };
}

export function parseAgentStudioErrorPayload(value: unknown, httpStatus: number) {
  const payload = upstreamSchema.safeParse(value);
  const fallback = httpStatus >= 500 ? "job_service_unavailable" : `http_${httpStatus}`;
  const errorCode = payload.success
    ? safeAgentStudioErrorCode(payload.data.errorCode, SAFE_ERROR_CODES.has(fallback) ? fallback : "analysis_failed")
    : SAFE_ERROR_CODES.has(fallback) ? fallback : "analysis_failed";
  return {
    errorCode,
    retryable: payload.success && typeof payload.data.retryable === "boolean"
      ? payload.data.retryable
      : httpStatus >= 500
  };
}

const ERROR_MESSAGES: Record<string, string> = {
  analysis_empty_response: "Agent Studio 未返回研报内容",
  analysis_failed: "Agent Studio 分析引擎执行失败",
  analysis_timeout: "Agent Studio 分析超时",
  async_jobs_paused: "Agent Studio 暂停接收异步任务",
  attempts_exhausted: "Agent Studio 已用尽官方 3 次执行机会",
  invalid_request: "Agent Studio 拒绝了研报参数",
  job_conflict: "Agent Studio 任务当前状态不允许恢复",
  job_expired: "Agent Studio 任务凭据已过期",
  job_not_found: "Agent Studio 未找到该私密任务",
  job_service_unavailable: "Agent Studio 任务服务暂时不可用",
  job_state_unavailable: "Agent Studio 任务状态暂时不可用",
  payment_failed: "Agent Studio 付款结算失败",
  payment_backend_unavailable: "Agent Studio 付款服务暂时不可用",
  payment_rejected: "Agent Studio 拒绝了付款凭据",
  payment_unavailable: "Agent Studio 付款能力暂时不可用",
  request_too_large: "Agent Studio 研报请求过大",
  settlement_pending: "Agent Studio 付款仍在结算",
  too_many_users: "Agent Studio 当前请求过载",
  wallet_rate_limited: "Agent Studio 钱包调用频率受限",
  wallet_rate_limit_unavailable: "Agent Studio 限流服务暂时不可用"
};

export function agentStudioErrorMessage(errorCode: string | null | undefined, retryable: boolean) {
  const code = safeAgentStudioErrorCode(errorCode);
  const detail = ERROR_MESSAGES[code] || ERROR_MESSAGES.analysis_failed;
  return `${detail}（${code}）。${retryable
    ? "原付款任务仍可恢复，不会再次扣费。"
    : "原付款任务已被官方终止，不能再恢复；如需重新生成，必须重新预览并明确确认新的付费请求。"}`;
}
