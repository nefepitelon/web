import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { decryptTradingSecret } from "@/lib/alpha-execution/credentials";
import {
  AGENT_SESSION_COOKIE,
  type AgentSessionState,
  clearAgentSessionCookieOptions,
  isSameOrigin,
  noStoreHeaders
} from "@/lib/bstock-agentic-wallet-auth";
import {
  AgenticWalletRequestError,
  connectedAgentSession,
  persistAgentSession
} from "@/lib/bstock-agentic-wallet-client";
import {
  STUDIO_MAX_RESUMES,
  findOwnedStudioJobById,
  reclaimLegacyStudioJob,
  resolveResearchOwner
} from "@/lib/bstock-agent-studio";
import { browserWalletAddressSchema, requireBoundEvmBrowserWallet } from "@/lib/bstock-browser-wallet";
import { buildAgentStudioReadableReport, extractAgentStudioReportSummary } from "@/lib/bstock-alpha-live";
import {
  agentStudioErrorMessage,
  parseAgentStudioErrorPayload,
  parseAgentStudioJobPayload
} from "@/lib/bstock-agent-studio-status";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const inputSchema = z.object({
  jobId: z.string().min(1).max(200),
  recover: z.boolean().default(false),
  walletMode: z.enum(["agent", "browser"]).default("agent"),
  address: browserWalletAddressSchema.optional()
}).superRefine((value, context) => {
  if (value.walletMode === "browser" && !value.address) {
    context.addIssue({ code: "custom", path: ["address"], message: "浏览器钱包地址缺失。" });
  }
});

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status, headers: noStoreHeaders() });
}

function persistAgentSessionOrBrowser(response: NextResponse, state?: AgentSessionState) {
  return state ? persistAgentSession(response, state) : response;
}

function logTransition(jobId: string, symbol: string, from: string, to: string, extra: Record<string, unknown> = {}) {
  if (from === to && !Object.keys(extra).length) return;
  console.info("[bstock:studio]", JSON.stringify({ event: "job_transition", jobId, symbol, from, to, ...extra }));
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ error: "研报任务仅允许从本站查询。" }, 403);
  let state: AgentSessionState | undefined;

  try {
    const input = inputSchema.parse(await request.json());
    const owner = input.walletMode === "browser"
      ? await requireBoundEvmBrowserWallet(input.address!).then((identity) => ({
        state: undefined as never,
        agentKey: identity.agentKey,
        ownerKey: identity.ownerKey,
        walletAddress: identity.address
      }))
      : await resolveResearchOwner(connectedAgentSession(request));
    state = input.walletMode === "agent" ? owner.state : undefined;
    const record = await findOwnedStudioJobById(owner, input.jobId)
      || await reclaimLegacyStudioJob(owner, { jobId: input.jobId });
    if (!record) return persistAgentSessionOrBrowser(json({ error: "未找到属于当前钱包的研报任务。" }, 404), state);

    if (record.status === "succeeded" && record.reportMarkdown) {
      return persistAgentSessionOrBrowser(json({
        status: "succeeded",
        jobId: record.jobId,
        symbol: record.symbol,
        summary: extractAgentStudioReportSummary(record.reportMarkdown),
        reportReading: buildAgentStudioReadableReport(record.reportMarkdown),
        reportMarkdown: record.reportMarkdown,
        paymentTxHash: record.paymentTxHash,
        completedAt: record.completedAt?.toISOString() ?? null,
        reused: true
      }), state);
    }

    const jobToken = decryptTradingSecret(record.jobTokenEncrypted);
    const upstream = await fetch(`https://stock-agent.bnbchain.org/x402/jobs/${encodeURIComponent(record.jobId)}`, {
      headers: { "Accept": "application/json", "X-Job-Token": jobToken },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000)
    });
    const rawPayload = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const failure = parseAgentStudioErrorPayload(rawPayload, upstream.status);
      const errorMessage = agentStudioErrorMessage(failure.errorCode, failure.retryable);
      const nextStatus = failure.retryable ? record.status : "failed";
      await prisma.bstockResearchJob.update({
        where: { id: record.id },
        data: {
          status: nextStatus,
          errorMessage,
          upstreamErrorCode: failure.errorCode,
          retryable: failure.retryable
        }
      });
      logTransition(record.jobId, record.symbol, record.status, nextStatus, {
        httpStatus: upstream.status,
        errorCode: failure.errorCode,
        retryable: failure.retryable
      });
      return persistAgentSessionOrBrowser(json({
        status: nextStatus,
        jobId: record.jobId,
        symbol: record.symbol,
        error: errorMessage,
        errorCode: failure.errorCode,
        retryable: failure.retryable,
        recoverable: failure.retryable,
        terminal: !failure.retryable,
        retryAfterMs: 15_000
      }, failure.retryable ? 202 : 200), state);
    }

    const payload = parseAgentStudioJobPayload(rawPayload, record.jobId);
    const jobStatus = payload.status;
    const errorMessage = jobStatus === "failed"
      ? agentStudioErrorMessage(payload.errorCode, payload.retryable)
      : null;

    if (jobStatus === "failed" && payload.retryable && input.recover) {
      if (record.resumeCount >= STUDIO_MAX_RESUMES) {
        const terminalError = agentStudioErrorMessage("attempts_exhausted", false);
        await prisma.bstockResearchJob.update({
          where: { id: record.id },
          data: {
            status: "failed",
            errorMessage: terminalError,
            upstreamErrorCode: "attempts_exhausted",
            retryable: false
          }
        });
        logTransition(record.jobId, record.symbol, record.status, "failed", {
          errorCode: "attempts_exhausted",
          retryable: false,
          resumeCount: record.resumeCount
        });
        return persistAgentSessionOrBrowser(json({
          status: "failed",
          jobId: record.jobId,
          symbol: record.symbol,
          error: terminalError,
          errorCode: "attempts_exhausted",
          retryable: false,
          recoverable: false,
          terminal: true
        }), state);
      }
      if (record.lastResumedAt && Date.now() - record.lastResumedAt.getTime() < 30_000) {
        return persistAgentSessionOrBrowser(json({
          status: "recovering",
          jobId: record.jobId,
          symbol: record.symbol,
          message: "恢复请求已提交，正在等待 Agent Studio 重新排队。",
          retryable: true,
          recoverable: true,
          retryAfterMs: 15_000
        }, 202), state);
      }

      const resumeResponse = await fetch(`https://stock-agent.bnbchain.org/x402/jobs/${encodeURIComponent(record.jobId)}/resume`, {
        method: "POST",
        headers: { "Accept": "application/json", "X-Job-Token": jobToken },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000)
      });
      const resumeRaw = await resumeResponse.json().catch(() => ({}));
      if (!resumeResponse.ok) {
        const failure = parseAgentStudioErrorPayload(resumeRaw, resumeResponse.status);
        const resumeError = agentStudioErrorMessage(failure.errorCode, failure.retryable);
        await prisma.bstockResearchJob.update({
          where: { id: record.id },
          data: {
            status: failure.retryable ? record.status : "failed",
            errorMessage: resumeError,
            upstreamErrorCode: failure.errorCode,
            retryable: failure.retryable
          }
        });
        logTransition(record.jobId, record.symbol, record.status, failure.retryable ? record.status : "failed", {
          resumed: false,
          httpStatus: resumeResponse.status,
          errorCode: failure.errorCode,
          retryable: failure.retryable
        });
        return persistAgentSessionOrBrowser(json({
          status: "failed",
          jobId: record.jobId,
          symbol: record.symbol,
          error: resumeError,
          errorCode: failure.errorCode,
          retryable: failure.retryable,
          recoverable: failure.retryable,
          terminal: !failure.retryable,
          retryAfterMs: 30_000
        }, failure.retryable ? 202 : 200), state);
      }

      const resumedPayload = parseAgentStudioJobPayload(resumeRaw, record.jobId);
      const resumeStatus = resumedPayload.status;

      await prisma.bstockResearchJob.update({
        where: { id: record.id },
        data: {
          status: resumeStatus,
          retryable: resumedPayload.retryable,
          errorMessage: resumedPayload.errorCode
            ? agentStudioErrorMessage(resumedPayload.errorCode, resumedPayload.retryable)
            : null,
          upstreamErrorCode: resumedPayload.errorCode,
          resumeCount: { increment: 1 },
          lastResumedAt: new Date()
        }
      });
      logTransition(record.jobId, record.symbol, record.status, resumeStatus, { resumed: true, resumeCount: record.resumeCount + 1 });
      return persistAgentSessionOrBrowser(json({
        status: "recovering",
        upstreamStatus: resumeStatus,
        jobId: record.jobId,
        symbol: record.symbol,
        resumed: true,
        resumeCount: record.resumeCount + 1,
        message: "已调用 Agent Studio 官方恢复接口重新排队；沿用原付款，不会再次扣费。",
        retryAfterMs: 15_000
      }, 202), state);
    }

    const resolvedDownloadUrl = payload.downloadUrl;
    if (jobStatus === "succeeded" && resolvedDownloadUrl) {
      const downloadUrl = new URL(resolvedDownloadUrl);
      if (downloadUrl.protocol !== "https:") throw new Error("Agent Studio returned an unsafe download URL.");
      const reportResponse = await fetch(downloadUrl, {
        headers: { "Accept": "text/markdown, text/plain;q=0.9" },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000)
      });
      if (!reportResponse.ok) {
        await prisma.bstockResearchJob.update({
          where: { id: record.id },
          data: { status: "finalizing", errorMessage: `研报下载暂时返回 HTTP ${reportResponse.status}，将继续回捞。` }
        });
        logTransition(record.jobId, record.symbol, record.status, "finalizing", { downloadStatus: reportResponse.status });
        return persistAgentSessionOrBrowser(json({
          status: "finalizing",
          upstreamStatus: "succeeded",
          jobId: record.jobId,
          symbol: record.symbol,
          error: "分析已经完成，但研报文件暂时不可下载；将继续查询同一任务，不会重复付款。",
          retryAfterMs: 15_000
        }, 202), state);
      }
      const reportMarkdown = (await reportResponse.text()).slice(0, 250_000);
      if (!reportMarkdown.trim()) throw new Error("Agent Studio returned an empty report file.");
      const completedAt = new Date();
      await prisma.bstockResearchJob.update({
        where: { id: record.id },
        data: {
          status: "succeeded",
          reportMarkdown,
          completedAt,
          errorMessage: null,
          upstreamErrorCode: null,
          retryable: false
        }
      });
      logTransition(record.jobId, record.symbol, record.status, "succeeded", { reportStored: true });
      return persistAgentSessionOrBrowser(json({
        status: "succeeded",
        jobId: record.jobId,
        symbol: record.symbol,
        summary: extractAgentStudioReportSummary(reportMarkdown),
        reportReading: buildAgentStudioReadableReport(reportMarkdown),
        reportMarkdown,
        paymentTxHash: record.paymentTxHash,
        completedAt: completedAt.toISOString()
      }), state);
    }

    if (jobStatus === "succeeded") {
      await prisma.bstockResearchJob.update({
        where: { id: record.id },
        data: {
          status: "finalizing",
          errorMessage: "Agent Studio 已完成分析，正在等待研报下载地址。",
          upstreamErrorCode: null,
          retryable: false
        }
      });
      logTransition(record.jobId, record.symbol, record.status, "finalizing");
      return persistAgentSessionOrBrowser(json({
        status: "finalizing",
        upstreamStatus: "succeeded",
        jobId: record.jobId,
        symbol: record.symbol,
        error: "Agent Studio 已完成分析，正在等待研报下载地址；不会重复付款。",
        retryAfterMs: 15_000
      }, 202), state);
    }

    await prisma.bstockResearchJob.update({
      where: { id: record.id },
      data: {
        status: jobStatus,
        errorMessage,
        upstreamErrorCode: payload.errorCode,
        retryable: payload.retryable
      }
    });
    logTransition(record.jobId, record.symbol, record.status, jobStatus, {
      errorCode: payload.errorCode,
      retryable: payload.retryable
    });
    return persistAgentSessionOrBrowser(json({
      status: jobStatus,
      jobId: record.jobId,
      symbol: record.symbol,
      errorCode: payload.errorCode,
      retryable: payload.retryable,
      recoverable: jobStatus === "failed" && payload.retryable,
      terminal: jobStatus === "failed" && !payload.retryable,
      error: errorMessage,
      retryAfterMs: 15_000
    }), state);
  } catch (error) {
    const known = error instanceof AgenticWalletRequestError;
    const message = error instanceof z.ZodError
      ? "研报任务参数无效。"
      : error instanceof Error ? error.message : "研报任务查询失败。";
    console.error("[bstock:studio]", JSON.stringify({
      event: "job_query_failed",
      error: known ? error.code : error instanceof z.ZodError ? "INVALID_UPSTREAM_RESPONSE" : error instanceof Error ? error.name : "unknown"
    }));
    const response = json({ error: known ? error.message : message, code: known ? error.code : "RESEARCH_JOB_FAILED" }, known ? error.status : 502);
    if (known && error.terminal) response.cookies.set(AGENT_SESSION_COOKIE, "", clearAgentSessionCookieOptions());
    return state && !(known && error.terminal) ? persistAgentSession(response, state) : response;
  }
}
