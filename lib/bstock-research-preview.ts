// Only the unsigned preview path may use these timeouts/retries. Never use this
// helper for payment signatures, merchant payment replay, or order submission.
export const RESEARCH_PREVIEW_BUDGET_MS = 110_000;
const CHALLENGE_ATTEMPT_TIMEOUTS_MS = [20_000, 35_000] as const;

export class ResearchPreviewTimeoutError extends Error {
  readonly code = "RESEARCH_PREVIEW_TIMEOUT";
  constructor(readonly stage: string) {
    super("付款预览服务暂时响应较慢。本次尚未签名、未付款，请点击“重新获取付款预览”安全重试。");
    this.name = "ResearchPreviewTimeoutError";
  }
}

export function isResearchPreviewTimeout(error: unknown) {
  return error instanceof ResearchPreviewTimeoutError
    || (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name));
}

export class ResearchPreviewTrace {
  private readonly startedAt = Date.now();
  private readonly deadline: number;
  stage = "request";

  constructor(
    private readonly context: { walletMode: "agent" | "browser"; requestId: string },
    budgetMs = RESEARCH_PREVIEW_BUDGET_MS
  ) {
    this.deadline = this.startedAt + budgetMs;
    this.log("started");
  }

  log(event: string, details: Record<string, unknown> = {}) {
    // No session cookies, payment requirements, wallet addresses or signatures.
    console.info("[bstock:research-preview]", JSON.stringify({
      ...this.context, event, stage: this.stage, durationMs: Date.now() - this.startedAt, ...details
    }));
  }

  async run<T>(stage: string, operation: (signal: AbortSignal) => Promise<T>, timeoutMs?: number): Promise<T> {
    this.stage = stage;
    const remaining = Math.min(timeoutMs ?? RESEARCH_PREVIEW_BUDGET_MS, this.deadline - Date.now());
    if (remaining <= 0) throw new ResearchPreviewTimeoutError(stage);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    this.log("step_started");
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const error = new ResearchPreviewTimeoutError(stage);
          controller.abort(error);
          reject(error);
        }, remaining);
      });
      const result = await Promise.race([operation(controller.signal), timeout]);
      this.log("step_completed", { stepDurationMs: Date.now() - startedAt });
      return result;
    } catch (error) {
      this.log("step_failed", { stepDurationMs: Date.now() - startedAt, errorName: error instanceof Error ? error.name : "UnknownError" });
      if (isResearchPreviewTimeout(error)) throw new ResearchPreviewTimeoutError(stage);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

export async function fetchUnpaidResearchChallenge(
  merchant: { url: string; accept: string; headers: Record<string, string>; body: unknown },
  trace: ResearchPreviewTrace
) {
  if (!["https://stock-agent.bnbchain.org/x402/analyze/async", "https://mcp.coinmarketcap.com/x402/mcp"].includes(merchant.url)) {
    throw new Error("不支持的研究商户预览地址。");
  }
  // Explicitly construct unsigned headers; credentials must never enter retries.
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: merchant.accept };
  for (const key of ["X-BStock-Symbol", "X-BStock-Ticker", "X-BStock-Contract"]) {
    if (merchant.headers[key]) headers[key] = merchant.headers[key];
  }
  const body = JSON.stringify(merchant.body);
  for (let attempt = 0; attempt < CHALLENGE_ATTEMPT_TIMEOUTS_MS.length; attempt++) {
    try {
      const response = await trace.run("merchant_challenge", (signal) => fetch(merchant.url, {
        method: "POST", headers, body, cache: "no-store", redirect: "error", signal
      }), CHALLENGE_ATTEMPT_TIMEOUTS_MS[attempt]);
      const paymentRequirements = response.headers.get("payment-required");
      void response.body?.cancel().catch(() => {});
      trace.log("challenge_received", { attempt: attempt + 1, status: response.status, hasRequirements: Boolean(paymentRequirements) });
      if (response.status === 402 && paymentRequirements) return paymentRequirements;
      if (attempt === 0 && [502, 503, 504].includes(response.status)) {
        trace.log("unsigned_challenge_retry", { reason: `HTTP_${response.status}` });
        continue;
      }
      throw new Error("研究服务未返回可验证的 x402 付款要求。此次未签名、未付款。");
    } catch (error) {
      if (attempt === 0 && isResearchPreviewTimeout(error)) {
        trace.log("unsigned_challenge_retry", { reason: "timeout" });
        continue;
      }
      throw error;
    }
  }
  throw new ResearchPreviewTimeoutError("merchant_challenge");
}
