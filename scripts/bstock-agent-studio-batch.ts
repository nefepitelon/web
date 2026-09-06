import { spawnSync } from "node:child_process";
import { createCipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  BSTOCK_REGISTRY_BASELINE_ASSETS
} from "../lib/bstock-eligible-snapshot";
import {
  agentStudioRatingScore,
  extractAgentStudioReportSummary
} from "../lib/bstock-agent-studio-report";

const AGENT_STUDIO_ANALYZE_URL = "https://stock-agent.bnbchain.org/x402/analyze/async";
const AGENT_STUDIO_JOB_URL = "https://stock-agent.bnbchain.org/x402/jobs";
const BSC_CHAIN_ID = "56";
const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
const EXPECTED_PAY_TO = "0x15958aad30b758dabfbb9788da69dfcd56e89078";
const EXPECTED_PRICE_USDT = 0.1;
const POLL_INTERVAL_MS = 15_000;
const POLL_DEADLINE_MS = 30 * 60_000;
const ACTIVE_STATUSES = ["settling", "queued", "running", "finalizing", "succeeded"];

type CliEnvelope<T> = { success: boolean; data?: T; error?: { name?: string; message?: string; code?: string | number } };
type WalletAddressResponse = { addresses: Array<{ binanceChainId: string; address: string }> };
type PreviewOption = {
  index: number;
  status: string;
  binanceChainId?: string | null;
  tokenAddress?: string | null;
  tokenSymbol?: string | null;
  amount?: string | null;
  amountUsd?: string | null;
  payTo?: string | null;
  needApproveFirst?: boolean;
};
type PreviewResponse = { paymentId: string; options: PreviewOption[] };
type SignResponse = {
  paymentHeaderName: string;
  paymentHeaderValue: string;
  approveTxHash?: string | null;
  signatureExpiresAt: string | number;
};
type RemoteIngestResponse = { status: string; id: string };
type RemotePollResponse = { status: string; done?: boolean; error?: string };
type Asset = {
  ticker: string;
  symbol: string;
  name: string;
  contractAddress: string;
};
type SubmittedJob = {
  id: string;
  ticker: string;
  symbol: string;
  jobId: string;
  jobToken: string;
  status: string;
  resumes: number;
};

function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function tickerSetArgument(name: string) {
  return new Set(
    (argument(name) ?? "")
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean)
  );
}

function asPositiveNumber(value: string | null, fallback: number) {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`Invalid positive number: ${value}`);
  return number;
}

function asPositiveInteger(value: string | null, fallback: number) {
  const number = Number(value ?? fallback);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`Invalid positive integer: ${value}`);
  return number;
}

function mask(value: string | null | undefined, left = 8, right = 4) {
  if (!value) return "—";
  return value.length <= left + right ? value : `${value.slice(0, left)}…${value.slice(-right)}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function baw<T>(args: string[]) {
  const appData = process.env.APPDATA;
  if (!appData) throw new Error("APPDATA is unavailable; cannot locate the Agentic Wallet CLI.");
  const entry = join(appData, "npm", "node_modules", "@binance", "agentic-wallet", "dist", "index.js");
  const result = spawnSync(process.execPath, [entry, ...args, "--json"], {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024
  });
  let envelope: CliEnvelope<T> | null = null;
  try {
    envelope = JSON.parse(result.stdout || result.stderr) as CliEnvelope<T>;
  } catch {
    throw new Error(`Agentic Wallet CLI did not return JSON (${result.status ?? "spawn failed"}).`);
  }
  if (result.status !== 0 || !envelope.success || !envelope.data) {
    throw new Error(envelope.error?.message || envelope.error?.name || "Agentic Wallet CLI request failed.");
  }
  return envelope.data;
}

function ownerKey(walletAddress: string) {
  return createHash("sha256").update(`bstock-alpha-wallet:${walletAddress.toLowerCase()}`).digest("hex");
}

function batchAgentKey(walletAddress: string) {
  return createHash("sha256").update(`bstock-alpha-batch:${walletAddress.toLowerCase()}`).digest("hex");
}

function encryptionKey() {
  const source = process.env.TRADING_CREDENTIALS_ENCRYPTION_KEY;
  if (!source || source.length < 32) throw new Error("TRADING_CREDENTIALS_ENCRYPTION_KEY is not configured.");
  return createHash("sha256").update(source).digest();
}

function encryptJobToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(":");
}

function remoteIngestConfig() {
  const url = process.env.BSTOCK_BATCH_INGEST_URL?.trim();
  const key = process.env.BSTOCK_RESEARCH_BATCH_INGEST_KEY?.trim();
  if (Boolean(url) !== Boolean(key)) {
    throw new Error("Remote batch persistence requires both BSTOCK_BATCH_INGEST_URL and BSTOCK_RESEARCH_BATCH_INGEST_KEY.");
  }
  if (!url || !key) return null;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "welinkbtc-main.vercel.app") {
    throw new Error("Remote batch persistence URL must use the production welinkbtc-main.vercel.app origin.");
  }
  if (key.length < 32) throw new Error("BSTOCK_RESEARCH_BATCH_INGEST_KEY is invalid.");
  return { url: parsed.toString(), key };
}

async function persistSubmittedJob(options: {
  prisma: PrismaClient;
  dbOwnerKey: string;
  agentKey: string;
  walletAddress: string;
  asset: Asset;
  jobId: string;
  jobToken: string;
  status: string;
  settlementHash: string | null;
  expiresAt?: string | number | null;
}) {
  const remote = remoteIngestConfig();
  if (remote) {
    let lastStatus = 0;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(remote.url, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${remote.key}`,
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({
            walletAddress: options.walletAddress,
            ticker: options.asset.ticker,
            jobId: options.jobId,
            jobToken: options.jobToken,
            status: options.status,
            paymentTxHash: options.settlementHash,
            expiresAt: options.expiresAt ?? null
          }),
          signal: AbortSignal.timeout(20_000)
        });
        lastStatus = response.status;
        if (response.ok) {
          const payload = await response.json() as RemoteIngestResponse;
          if (payload.status === "PERSISTED" && payload.id) return payload.id;
        }
        if (response.status < 500 && response.status !== 429) break;
      } catch {
        lastStatus = 0;
      }
      await sleep(1_000 * (attempt + 1));
    }
    throw new Error(`${options.asset.ticker}: paid job ${options.jobId} could not be persisted remotely (HTTP ${lastStatus || "network"}); do not repay.`);
  }
  const record = await options.prisma.bstockResearchJob.upsert({
    where: { jobId: options.jobId },
    create: {
      agentKey: options.agentKey,
      ownerKey: options.dbOwnerKey,
      symbol: options.asset.ticker,
      jobId: options.jobId,
      jobTokenEncrypted: encryptJobToken(options.jobToken),
      status: options.status,
      paymentTxHash: options.settlementHash
    },
    update: {
      agentKey: options.agentKey,
      ownerKey: options.dbOwnerKey,
      symbol: options.asset.ticker,
      jobTokenEncrypted: encryptJobToken(options.jobToken),
      status: options.status,
      paymentTxHash: options.settlementHash,
      errorMessage: null,
      retryable: false
    },
    select: { id: true }
  });
  return record.id;
}

async function pollRemoteJob(walletAddress: string, jobId: string) {
  const remote = remoteIngestConfig();
  if (!remote) throw new Error("Remote batch persistence is unavailable for encrypted-job recovery.");
  const response = await fetch(remote.url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${remote.key}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({ action: "poll", walletAddress, jobId }),
    signal: AbortSignal.timeout(25_000)
  });
  const payload = await response.json().catch(() => null) as RemotePollResponse | null;
  if ([502, 503, 504].includes(response.status)) {
    return { status: "temporarily_unavailable", done: false } satisfies RemotePollResponse;
  }
  if (!payload || (!response.ok && response.status !== 202)) {
    throw new Error(`Stored Agent Studio job ${mask(jobId)} could not be polled (HTTP ${response.status}).`);
  }
  return payload;
}

async function recoverPersistedJobs(options: {
  prisma: PrismaClient;
  walletAddress: string;
  dbOwnerKey: string;
}) {
  const records = await options.prisma.bstockResearchJob.findMany({
    where: {
      ownerKey: options.dbOwnerKey,
      reportMarkdown: null,
      status: { in: ACTIVE_STATUSES },
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) }
    },
    orderBy: { createdAt: "asc" },
    select: { jobId: true, symbol: true }
  });
  if (!records.length) return 0;
  console.log(`[recover] ${records.length} encrypted jobs found; no payment will be requested.`);
  const remaining = new Map(records.map((record) => [record.jobId, record]));
  const deadline = Date.now() + POLL_DEADLINE_MS;
  while (remaining.size && Date.now() < deadline) {
    const entries = [...remaining.values()];
    for (let offset = 0; offset < entries.length; offset += 2) {
      const chunk = entries.slice(offset, offset + 2);
      const results = await Promise.allSettled(chunk.map(async (record) => ({
        record,
        result: await pollRemoteJob(options.walletAddress, record.jobId)
      })));
      for (const result of results) {
        if (result.status === "rejected") throw result.reason;
        if (result.value.result.done) {
          remaining.delete(result.value.record.jobId);
          console.log(`[recovered] ${result.value.record.symbol} succeeded`);
        }
      }
    }
    if (remaining.size) {
      console.log(`[recover] ${remaining.size} reports remaining.`);
      await sleep(POLL_INTERVAL_MS);
    }
  }
  if (remaining.size) throw new Error(`${remaining.size} persisted jobs did not finish within 30 minutes; no new payment was made.`);
  return records.length;
}

function isStock(ticker: string, name: string) {
  return !(/(?:\bETF\b|\bTRUST\b)/i.test(name) || /^(?:SPY|TQQQ)$/.test(ticker));
}

function catalogStocks(): Asset[] {
  return BSTOCK_REGISTRY_BASELINE_ASSETS
    .filter(([ticker, , name]) => isStock(ticker, name))
    .map(([ticker, symbol, name, contractAddress]) => ({ ticker, symbol, name, contractAddress }));
}

function structuredTxHash(value: unknown): string | null {
  if (typeof value === "string" && /^0x[a-fA-F0-9]{64}$/.test(value)) return value;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = structuredTxHash(entry);
      if (found) return found;
    }
  }
  if (value && typeof value === "object") {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      const found = structuredTxHash(entry);
      if (found) return found;
    }
  }
  return null;
}

function paymentTxHash(value: string | null) {
  if (!value) return null;
  try {
    return structuredTxHash(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch {
    return null;
  }
}

async function merchantChallenge(asset: Asset) {
  const body = { symbols: [asset.ticker], analysis_type: "comprehensive" };
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "X-BStock-Symbol": asset.symbol,
    "X-BStock-Ticker": asset.ticker,
    "X-BStock-Contract": asset.contractAddress
  };
  const response = await fetch(AGENT_STUDIO_ANALYZE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000)
  });
  const paymentRequirements = response.headers.get("payment-required");
  if (response.status !== 402 || !paymentRequirements) {
    throw new Error(`${asset.ticker}: Agent Studio did not return a valid x402 challenge (HTTP ${response.status}).`);
  }
  return { body, headers, paymentRequirements };
}

function selectUsdtOption(preview: PreviewResponse) {
  const option = preview.options.find((entry) =>
    entry.status === "READY_TO_SIGN"
    && entry.binanceChainId === BSC_CHAIN_ID
    && entry.tokenSymbol === "USDT"
    && entry.tokenAddress?.toLowerCase() === USDT_ADDRESS.toLowerCase()
    && entry.payTo?.toLowerCase() === EXPECTED_PAY_TO.toLowerCase()
    && !entry.needApproveFirst
  );
  if (!option) throw new Error("No directly signable BSC USDT option matched the approved merchant and token.");
  const amount = Number(option.amount);
  if (!Number.isFinite(amount) || Math.abs(amount - EXPECTED_PRICE_USDT) > 0.000001) {
    throw new Error(`Agent Studio price changed from ${EXPECTED_PRICE_USDT} USDT to ${option.amount ?? "unknown"} USDT.`);
  }
  return { option, amount };
}

async function submitPaidJob(
  asset: Asset,
  walletAddress: string,
  dbOwnerKey: string,
  agentKey: string,
  prisma: PrismaClient
) {
  const challenge = await merchantChallenge(asset);
  const preview = baw<PreviewResponse>([
    "x402-payment", "preview", "--paymentRequirements", challenge.paymentRequirements
  ]);
  const { option, amount } = selectUsdtOption(preview);
  const signed = baw<SignResponse>([
    "x402-payment", "sign", "--paymentId", preview.paymentId, "--selectedIndex", String(option.index)
  ]);
  if (signed.approveTxHash) {
    throw new Error(`${asset.ticker}: an unexpected approval transaction was dispatched (${mask(signed.approveTxHash)}); replay stopped.`);
  }
  if (Number(signed.signatureExpiresAt) * 1000 <= Date.now() + 2_000) {
    throw new Error(`${asset.ticker}: payment signature is too close to expiry; replay stopped.`);
  }
  const headerName = signed.paymentHeaderName.toUpperCase();
  if (!["PAYMENT-SIGNATURE", "X-PAYMENT"].includes(headerName)) {
    throw new Error(`${asset.ticker}: unsupported x402 signature header.`);
  }
  const replay = await fetch(AGENT_STUDIO_ANALYZE_URL, {
    method: "POST",
    headers: { ...challenge.headers, [headerName]: signed.paymentHeaderValue },
    body: JSON.stringify(challenge.body),
    signal: AbortSignal.timeout(25_000)
  });
  const raw = await replay.json().catch(() => null) as Record<string, unknown> | null;
  if (replay.status !== 202 || !raw || typeof raw.jobId !== "string" || typeof raw.jobToken !== "string") {
    const detail = raw && typeof raw.error === "string" ? raw.error : `HTTP ${replay.status}`;
    throw new Error(`${asset.ticker}: signed payment replay was not accepted (${detail}); do not automatically retry.`);
  }
  const jobId = raw.jobId;
  const jobToken = raw.jobToken;
  const status = typeof raw.status === "string" ? raw.status.toLowerCase() : "queued";
  const expiresAt = typeof raw.expiresAt === "string" || typeof raw.expiresAt === "number" ? raw.expiresAt : null;
  const settlementHash = paymentTxHash(replay.headers.get("payment-response"));
  const id = await persistSubmittedJob({
    prisma,
    dbOwnerKey,
    agentKey,
    walletAddress,
    asset,
    jobId,
    jobToken,
    status,
    settlementHash,
    expiresAt
  });
  return { id, ticker: asset.ticker, symbol: asset.symbol, jobId, jobToken, status, resumes: 0, amount };
}

function resolvedDownloadUrl(payload: Record<string, unknown>) {
  if (typeof payload.downloadUrl === "string") return payload.downloadUrl;
  if (typeof payload.download_url === "string") return payload.download_url;
  const result = payload.result && typeof payload.result === "object" ? payload.result as Record<string, unknown> : null;
  if (typeof result?.downloadUrl === "string") return result.downloadUrl;
  if (typeof result?.download_url === "string") return result.download_url;
  return null;
}

function upstreamError(payload: Record<string, unknown>) {
  if (typeof payload.error === "string") return payload.error;
  if (payload.error && typeof payload.error === "object" && typeof (payload.error as Record<string, unknown>).message === "string") {
    return String((payload.error as Record<string, unknown>).message);
  }
  return "Agent Studio job failed.";
}

async function pollOne(job: SubmittedJob, prisma: PrismaClient) {
  const response = await fetch(`${AGENT_STUDIO_JOB_URL}/${encodeURIComponent(job.jobId)}`, {
    headers: { "Accept": "application/json", "X-Job-Token": job.jobToken },
    signal: AbortSignal.timeout(20_000)
  });
  const payload = await response.json().catch(() => ({ status: "error" })) as Record<string, unknown>;
  const status = typeof payload.status === "string" ? payload.status.toLowerCase() : "error";
  if (status === "failed" && payload.retryable === true && job.resumes < 3) {
    const resume = await fetch(`${AGENT_STUDIO_JOB_URL}/${encodeURIComponent(job.jobId)}/resume`, {
      method: "POST",
      headers: { "Accept": "application/json", "X-Job-Token": job.jobToken },
      signal: AbortSignal.timeout(20_000)
    });
    if (!resume.ok) throw new Error(`${job.ticker}: recoverable job could not be resumed (HTTP ${resume.status}).`);
    job.resumes += 1;
    job.status = "recovering";
    await prisma.bstockResearchJob.update({
      where: { id: job.id },
      data: { status: "recovering", retryable: false, errorMessage: null, resumeCount: { increment: 1 }, lastResumedAt: new Date() }
    });
    return false;
  }
  if (!response.ok || status === "failed" || status === "error") {
    const message = upstreamError(payload);
    await prisma.bstockResearchJob.update({
      where: { id: job.id },
      data: { status, retryable: payload.retryable === true, errorMessage: message.slice(0, 2000) }
    });
    throw new Error(`${job.ticker}: ${message}`);
  }
  const downloadUrl = resolvedDownloadUrl(payload);
  if (status === "succeeded" && downloadUrl) {
    const url = new URL(downloadUrl);
    if (url.protocol !== "https:") throw new Error(`${job.ticker}: unsafe report download URL.`);
    const reportResponse = await fetch(url, {
      headers: { "Accept": "application/json, text/markdown, text/plain;q=0.9" },
      signal: AbortSignal.timeout(20_000)
    });
    if (!reportResponse.ok) return false;
    const reportMarkdown = (await reportResponse.text()).slice(0, 250_000);
    if (!reportMarkdown.trim()) return false;
    const summary = extractAgentStudioReportSummary(reportMarkdown);
    const score = agentStudioRatingScore(summary.rating);
    await prisma.bstockResearchJob.update({
      where: { id: job.id },
      data: { status: "succeeded", reportMarkdown, completedAt: new Date(), errorMessage: null, retryable: false }
    });
    console.log(`[report] ${job.ticker} succeeded · rating=${summary.rating ?? "unparsed"} · score=${score ?? "—"}`);
    return true;
  }
  if (job.status !== status) {
    job.status = status;
    console.log(`[poll] ${job.ticker} -> ${status}`);
  }
  await prisma.bstockResearchJob.update({
    where: { id: job.id },
    data: { status: status === "succeeded" ? "finalizing" : status, errorMessage: null, retryable: false }
  });
  return false;
}

async function main() {
  process.env.DATABASE_URL ||= process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL;
  process.env.DIRECT_URL ||= process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
  if (!process.env.DATABASE_URL) throw new Error("Production database URL is unavailable.");
  const execute = process.argv.includes("--execute");
  const recoverOnly = process.argv.includes("--recover-only");
  const maxTotalUsdt = asPositiveNumber(argument("max-total-usdt"), 3.8);
  const take = asPositiveInteger(argument("take"), Number.MAX_SAFE_INTEGER);
  const confirmedTotal = argument("confirm-total-usdt");
  const excludedTickers = tickerSetArgument("skip");
  if (execute && confirmedTotal !== maxTotalUsdt.toFixed(2)) {
    throw new Error(`Execution requires --confirm-total-usdt=${maxTotalUsdt.toFixed(2)}.`);
  }
  // Fail before requesting, signing, or replaying any x402 payment. The first
  // paid job must never discover a missing production secret after settlement.
  if (execute && !remoteIngestConfig()) encryptionKey();

  const walletStatus = baw<{ status: string }>(["wallet", "status"]);
  if (walletStatus.status !== "CONNECTED") throw new Error("Agentic Wallet is not connected.");
  const walletData = baw<WalletAddressResponse>(["wallet", "address"]);
  const walletAddress = walletData.addresses.find((entry) => entry.binanceChainId === BSC_CHAIN_ID)?.address;
  if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) throw new Error("BSC wallet address is unavailable.");
  const dbOwnerKey = ownerKey(walletAddress);
  const agentKey = batchAgentKey(walletAddress);
  const prisma = new PrismaClient();

  try {
    if (recoverOnly) {
      const recovered = await recoverPersistedJobs({ prisma, walletAddress, dbOwnerKey });
      console.log(JSON.stringify({ status: "RECOVERY_COMPLETE", reports: recovered, paidUsdt: "0.00" }, null, 2));
      return;
    }
    const reports = await prisma.bstockResearchJob.findMany({
      where: { ownerKey: dbOwnerKey, status: "succeeded", reportMarkdown: { not: null } },
      orderBy: { completedAt: "desc" },
      select: { symbol: true, reportMarkdown: true }
    });
    const newestByTicker = new Map<string, string>();
    for (const report of reports) {
      if (report.reportMarkdown && !newestByTicker.has(report.symbol)) newestByTicker.set(report.symbol, report.reportMarkdown);
    }
    const pending = new Set((await prisma.bstockResearchJob.findMany({
      where: {
        ownerKey: dbOwnerKey,
        reportMarkdown: null,
        status: { in: ACTIVE_STATUSES },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) }
      },
      select: { symbol: true }
    })).map((entry) => entry.symbol));
    const missingAll = catalogStocks().filter((asset) => {
      if (excludedTickers.has(asset.ticker)) return false;
      if (pending.has(asset.ticker)) return false;
      const report = newestByTicker.get(asset.ticker);
      if (!report) return true;
      const summary = extractAgentStudioReportSummary(report);
      return agentStudioRatingScore(summary.rating) == null;
    });
    const missing = missingAll.slice(0, take);
    console.log(JSON.stringify({
      mode: execute ? "EXECUTE" : "PREVIEW",
      wallet: mask(walletAddress),
      stockCount: catalogStocks().length,
      missingCount: missing.length,
      missingTotalBeforeTake: missingAll.length,
      pendingSkipped: pending.size,
      unitPriceUsdt: EXPECTED_PRICE_USDT,
      maximumTotalUsdt: Number((missing.length * EXPECTED_PRICE_USDT).toFixed(2)),
      explicitlySkipped: [...excludedTickers],
      tickers: missing.map((asset) => asset.ticker)
    }, null, 2));
    if (!execute || !missing.length) return;
    if (missing.length * EXPECTED_PRICE_USDT > maxTotalUsdt + 0.000001) {
      throw new Error(`Batch maximum ${maxTotalUsdt.toFixed(2)} USDT is below the required ${(
        missing.length * EXPECTED_PRICE_USDT
      ).toFixed(2)} USDT.`);
    }

    const jobs: SubmittedJob[] = [];
    let paid = 0;
    for (let index = 0; index < missing.length; index += 1) {
      const asset = missing[index];
      const current = await prisma.bstockResearchJob.findFirst({
        where: { ownerKey: dbOwnerKey, symbol: asset.ticker, status: "succeeded", reportMarkdown: { not: null } },
        orderBy: { completedAt: "desc" },
        select: { reportMarkdown: true }
      });
      if (current?.reportMarkdown) {
        const summary = extractAgentStudioReportSummary(current.reportMarkdown);
        if (agentStudioRatingScore(summary.rating) != null) {
          console.log(`[skip ${index + 1}/${missing.length}] ${asset.ticker} already has a valid score.`);
          continue;
        }
      }
      if (paid + EXPECTED_PRICE_USDT > maxTotalUsdt + 0.000001) throw new Error("Batch budget cap reached.");
      console.log(`[submit ${index + 1}/${missing.length}] ${asset.ticker} · signing 0.10 USDT`);
      const job = await submitPaidJob(asset, walletAddress, dbOwnerKey, agentKey, prisma);
      paid += job.amount;
      jobs.push(job);
      console.log(`[accepted] ${asset.ticker} · job=${mask(job.jobId)} · paid=${paid.toFixed(2)} USDT`);
      await sleep(500);
    }

    console.log(`[poll] ${jobs.length} paid jobs persisted; waiting for Agent Studio reports.`);
    const remaining = new Map(jobs.map((job) => [job.jobId, job]));
    const deadline = Date.now() + POLL_DEADLINE_MS;
    while (remaining.size && Date.now() < deadline) {
      const entries = [...remaining.values()];
      for (let offset = 0; offset < entries.length; offset += 6) {
        const chunk = entries.slice(offset, offset + 6);
        const results = await Promise.allSettled(chunk.map(async (job) => {
          try {
            return { job, done: await pollOne(job, prisma) };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (/timeout|aborted/i.test(message)) {
              console.log(`[poll] ${job.ticker} temporarily unavailable; retrying the same job without payment.`);
              return { job, done: false };
            }
            throw error;
          }
        }));
        for (const result of results) {
          if (result.status === "fulfilled" && result.value.done) remaining.delete(result.value.job.jobId);
          if (result.status === "rejected") throw result.reason;
        }
      }
      if (remaining.size) {
        console.log(`[poll] ${remaining.size} reports remaining.`);
        await sleep(POLL_INTERVAL_MS);
      }
    }
    if (remaining.size) throw new Error(`${remaining.size} Agent Studio jobs did not finish within 30 minutes; they remain persisted for recovery.`);
    console.log(JSON.stringify({ status: "COMPLETE", paidUsdt: paid.toFixed(2), reports: jobs.length }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
