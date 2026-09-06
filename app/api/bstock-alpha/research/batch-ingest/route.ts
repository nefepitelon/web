import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { decryptTradingSecret, encryptTradingSecret } from "@/lib/alpha-execution/credentials";
import { agentWalletOwnerKey, normalizeBscWalletAddress } from "@/lib/bstock-agentic-wallet-client";
import { BSTOCK_REGISTRY_BASELINE_ASSETS } from "@/lib/bstock-eligible-snapshot";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const inputSchema = z.object({
  action: z.literal("ingest").optional(),
  walletAddress: z.string(),
  ticker: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,12}$/),
  jobId: z.string().min(1).max(200),
  jobToken: z.string().min(1).max(10_000),
  status: z.string().trim().toLowerCase().max(32).default("queued"),
  paymentTxHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).nullable().optional(),
  expiresAt: z.union([z.string(), z.number()]).nullable().optional()
});

const pollSchema = z.object({
  action: z.literal("poll"),
  walletAddress: z.string(),
  jobId: z.string().min(1).max(200)
});

const jobResponseSchema = z.object({
  status: z.string().default("error"),
  downloadUrl: z.string().url().optional(),
  download_url: z.string().url().optional(),
  result: z.object({
    downloadUrl: z.string().url().optional(),
    download_url: z.string().url().optional()
  }).passthrough().optional(),
  error: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
  retryable: z.boolean().optional()
}).passthrough();

function authorized(request: NextRequest) {
  const secret = process.env.BSTOCK_RESEARCH_BATCH_INGEST_KEY;
  const authorization = request.headers.get("authorization");
  if (!secret || secret.length < 32 || !authorization) return false;
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  const received = createHash("sha256").update(authorization).digest();
  return timingSafeEqual(expected, received);
}

function dateFromUnknown(value: string | number | null | undefined) {
  if (value == null) return null;
  const date = new Date(typeof value === "number" && value < 10_000_000_000 ? value * 1000 : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isPersistentStock(ticker: string) {
  const asset = BSTOCK_REGISTRY_BASELINE_ASSETS.find(([candidate]) => candidate === ticker);
  if (!asset) return false;
  const [, , name] = asset;
  return !(/(?:\bETF\b|\bTRUST\b)/i.test(name) || /^(?:SPY|TQQQ)$/.test(ticker));
}

function upstreamError(payload: z.infer<typeof jobResponseSchema>) {
  if (typeof payload.error === "string") return payload.error;
  if (payload.error && typeof payload.error === "object" && typeof payload.error.message === "string") {
    return payload.error.message;
  }
  return "Agent Studio job failed.";
}

async function pollStoredJob(input: z.infer<typeof pollSchema>) {
  const walletAddress = normalizeBscWalletAddress(input.walletAddress);
  if (!walletAddress) return NextResponse.json({ error: "Batch research parameters are invalid." }, { status: 400 });
  const ownerKey = agentWalletOwnerKey(walletAddress);
  const record = await prisma.bstockResearchJob.findFirst({
    where: { ownerKey, jobId: input.jobId }
  });
  if (!record) return NextResponse.json({ error: "Batch research job was not found." }, { status: 404 });
  if (record.status === "succeeded" && record.reportMarkdown) {
    return NextResponse.json({ status: "succeeded", done: true, symbol: record.symbol });
  }

  const jobToken = decryptTradingSecret(record.jobTokenEncrypted);
  const upstream = await fetch(`https://stock-agent.bnbchain.org/x402/jobs/${encodeURIComponent(record.jobId)}`, {
    headers: { "Accept": "application/json", "X-Job-Token": jobToken },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000)
  });
  const raw = await upstream.json().catch(() => ({ status: "error" }));
  const payload = jobResponseSchema.parse(raw);
  const status = payload.status.toLowerCase();

  if (status === "failed" && payload.retryable === true && record.resumeCount < 3) {
    const resume = await fetch(`https://stock-agent.bnbchain.org/x402/jobs/${encodeURIComponent(record.jobId)}/resume`, {
      method: "POST",
      headers: { "Accept": "application/json", "X-Job-Token": jobToken },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000)
    });
    if (!resume.ok) {
      await prisma.bstockResearchJob.update({
        where: { id: record.id },
        data: { status: "failed", retryable: true, errorMessage: `Agent Studio resume returned HTTP ${resume.status}.` }
      });
      return NextResponse.json({ status: "failed", done: false, retryable: true }, { status: 202 });
    }
    await prisma.bstockResearchJob.update({
      where: { id: record.id },
      data: {
        status: "recovering",
        retryable: false,
        errorMessage: null,
        resumeCount: { increment: 1 },
        lastResumedAt: new Date()
      }
    });
    return NextResponse.json({ status: "recovering", done: false, resumed: true }, { status: 202 });
  }

  if (!upstream.ok || status === "failed" || status === "error") {
    const message = upstreamError(payload).slice(0, 2000);
    await prisma.bstockResearchJob.update({
      where: { id: record.id },
      data: { status, retryable: payload.retryable === true, errorMessage: message }
    });
    return NextResponse.json({ status, done: false, retryable: payload.retryable === true, error: message }, { status: 202 });
  }

  const resolvedDownloadUrl = payload.downloadUrl
    || payload.download_url
    || payload.result?.downloadUrl
    || payload.result?.download_url;
  if (status === "succeeded" && resolvedDownloadUrl) {
    const downloadUrl = new URL(resolvedDownloadUrl);
    if (downloadUrl.protocol !== "https:") throw new Error("Agent Studio returned an unsafe download URL.");
    const reportResponse = await fetch(downloadUrl, {
      headers: { "Accept": "application/json, text/markdown, text/plain;q=0.9" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000)
    });
    if (!reportResponse.ok) {
      await prisma.bstockResearchJob.update({
        where: { id: record.id },
        data: { status: "finalizing", errorMessage: `Report download returned HTTP ${reportResponse.status}.` }
      });
      return NextResponse.json({ status: "finalizing", done: false }, { status: 202 });
    }
    const reportMarkdown = (await reportResponse.text()).slice(0, 250_000);
    if (!reportMarkdown.trim()) throw new Error("Agent Studio returned an empty report file.");
    await prisma.bstockResearchJob.update({
      where: { id: record.id },
      data: { status: "succeeded", reportMarkdown, completedAt: new Date(), errorMessage: null, retryable: false }
    });
    return NextResponse.json({ status: "succeeded", done: true, symbol: record.symbol });
  }

  const storedStatus = status === "succeeded" ? "finalizing" : status;
  await prisma.bstockResearchJob.update({
    where: { id: record.id },
    data: { status: storedStatus, errorMessage: null, retryable: false }
  });
  return NextResponse.json({ status: storedStatus, done: false }, { status: 202 });
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const body = await request.json();
    if (body?.action === "poll") return await pollStoredJob(pollSchema.parse(body));
    const input = inputSchema.parse(body);
    const walletAddress = normalizeBscWalletAddress(input.walletAddress);
    if (!walletAddress || !isPersistentStock(input.ticker)) {
      return NextResponse.json({ error: "Batch research parameters are invalid." }, { status: 400 });
    }
    const ownerKey = agentWalletOwnerKey(walletAddress);
    const agentKey = createHash("sha256")
      .update(`bstock-alpha-batch:${walletAddress.toLowerCase()}`)
      .digest("hex");
    const record = await prisma.bstockResearchJob.upsert({
      where: { jobId: input.jobId },
      create: {
        agentKey,
        ownerKey,
        symbol: input.ticker,
        jobId: input.jobId,
        jobTokenEncrypted: encryptTradingSecret(input.jobToken),
        status: input.status,
        paymentTxHash: input.paymentTxHash ?? null,
        expiresAt: dateFromUnknown(input.expiresAt)
      },
      update: {
        agentKey,
        ownerKey,
        symbol: input.ticker,
        jobTokenEncrypted: encryptTradingSecret(input.jobToken),
        status: input.status,
        paymentTxHash: input.paymentTxHash ?? null,
        expiresAt: dateFromUnknown(input.expiresAt),
        errorMessage: null,
        retryable: false
      },
      select: { id: true }
    });
    return NextResponse.json({ status: "PERSISTED", id: record.id }, { status: 201 });
  } catch (error) {
    console.error("[bstock:studio]", JSON.stringify({
      event: "batch_ingest_failed",
      error: error instanceof Error ? error.name : "unknown"
    }));
    return NextResponse.json({ error: "Batch research persistence failed." }, { status: 502 });
  }
}
