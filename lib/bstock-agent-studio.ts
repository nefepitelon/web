import "server-only";

import type { BstockResearchJob, Prisma } from "@prisma/client";
import type { AgentSessionState } from "@/lib/bstock-agentic-wallet-auth";
import {
  AgenticWalletRequestError,
  agentSessionKey,
  agentWalletOwnerKey,
  normalizeBscWalletAddress
} from "@/lib/bstock-agentic-wallet-client";
import { fetchAgentWalletData } from "@/lib/bstock-agentic-wallet-data";
import { prisma } from "@/lib/prisma";

export const STUDIO_REPORT_REUSE_MS = 30 * 60_000;
export const STUDIO_RECOVERY_LOOKBACK_MS = 24 * 60 * 60_000;
// Agent Studio allows three total execution attempts: the initial run plus two resumes.
export const STUDIO_MAX_RESUMES = 2;

export type ResearchOwner = {
  state: AgentSessionState;
  agentKey: string;
  ownerKey: string;
  walletAddress: string;
};

export async function resolveResearchOwner(initialState: AgentSessionState): Promise<ResearchOwner> {
  let state = initialState;
  let walletAddress = normalizeBscWalletAddress(state.walletAddress);
  if (!walletAddress) {
    const wallet = await fetchAgentWalletData(state);
    state = wallet.state;
    walletAddress = normalizeBscWalletAddress(wallet.address);
  }
  if (!walletAddress) {
    throw new AgenticWalletRequestError("Agentic Wallet 已连接，但尚未返回 BSC 钱包地址，无法安全关联研报。", {
      status: 409,
      code: "BSC_WALLET_ADDRESS_UNAVAILABLE"
    });
  }
  state = { ...state, walletAddress };
  return {
    state,
    agentKey: agentSessionKey(state),
    ownerKey: agentWalletOwnerKey(walletAddress),
    walletAddress
  };
}

export function ownedStudioJobWhere(owner: ResearchOwner): Prisma.BstockResearchJobWhereInput {
  return {
    OR: [
      { ownerKey: owner.ownerKey },
      { ownerKey: null, agentKey: owner.agentKey }
    ]
  };
}

async function attachOwner(record: BstockResearchJob, owner: ResearchOwner) {
  if (record.ownerKey === owner.ownerKey) return record;
  return prisma.bstockResearchJob.update({
    where: { id: record.id },
    data: { ownerKey: owner.ownerKey }
  });
}

export async function findRecentOwnedStudioJob(owner: ResearchOwner, ticker: string, lookbackMs = STUDIO_REPORT_REUSE_MS) {
  const cutoff = new Date(Date.now() - lookbackMs);
  const record = await prisma.bstockResearchJob.findFirst({
    where: {
      provider: "AGENT_STUDIO",
      symbol: ticker,
      AND: [
        ownedStudioJobWhere(owner),
        { OR: [{ createdAt: { gte: cutoff } }, { completedAt: { gte: cutoff } }] }
      ]
    },
    orderBy: { createdAt: "desc" }
  });
  return record ? attachOwner(record, owner) : null;
}

export async function findLatestOwnedCompletedStudioJob(owner: ResearchOwner, ticker: string) {
  const record = await prisma.bstockResearchJob.findFirst({
    where: {
      provider: "AGENT_STUDIO",
      symbol: ticker,
      status: "succeeded",
      reportMarkdown: { not: null },
      ...ownedStudioJobWhere(owner)
    },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }]
  });
  return record ? attachOwner(record, owner) : null;
}

export async function findOwnedCompletedStudioJobByRecordId(owner: ResearchOwner, recordId: string, ticker: string) {
  const record = await prisma.bstockResearchJob.findFirst({
    where: {
      id: recordId,
      provider: "AGENT_STUDIO",
      symbol: ticker,
      status: "succeeded",
      reportMarkdown: { not: null },
      ...ownedStudioJobWhere(owner)
    }
  });
  return record ? attachOwner(record, owner) : null;
}

export async function findOwnedStudioJobById(owner: ResearchOwner, jobId: string) {
  const record = await prisma.bstockResearchJob.findFirst({
    where: { jobId, ...ownedStudioJobWhere(owner) }
  });
  return record ? attachOwner(record, owner) : null;
}

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

async function paymentBelongsToWallet(txHash: string, walletAddress: string) {
  try {
    const response = await fetch("https://bsc-dataseed.binance.org/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [txHash] }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000)
    });
    if (!response.ok) return false;
    const payload = await response.json() as {
      result?: { status?: string; from?: string; logs?: Array<{ topics?: string[] }> } | null;
    };
    const receipt = payload.result;
    if (!receipt || receipt.status !== "0x1") return false;
    const wallet = walletAddress.toLowerCase();
    if (normalizeBscWalletAddress(receipt.from) === wallet) return true;
    const paddedWallet = `0x${wallet.slice(2).padStart(64, "0")}`;
    return (receipt.logs || []).some((log) =>
      log.topics?.[0]?.toLowerCase() === TRANSFER_TOPIC
      && log.topics?.[1]?.toLowerCase() === paddedWallet
    );
  } catch {
    return false;
  }
}

export async function reclaimLegacyStudioJob(owner: ResearchOwner, options: { ticker?: string; jobId?: string; lookbackMs?: number }) {
  const cutoff = new Date(Date.now() - (options.lookbackMs ?? STUDIO_RECOVERY_LOOKBACK_MS));
  const candidates = await prisma.bstockResearchJob.findMany({
    where: {
      provider: "AGENT_STUDIO",
      ownerKey: null,
      ...(options.ticker ? { symbol: options.ticker } : {}),
      ...(options.jobId ? { jobId: options.jobId } : {}),
      OR: [{ createdAt: { gte: cutoff } }, { completedAt: { gte: cutoff } }],
      paymentTxHash: { not: null }
    },
    orderBy: { createdAt: "desc" },
    take: options.jobId ? 1 : 8
  });
  // At most eight read-only receipt checks. Serial 8s RPC timeouts could consume
  // 64s before the first payment preview. Preserve newest-first ownership checks.
  const matches = await Promise.all(candidates.map((record) =>
    record.paymentTxHash ? paymentBelongsToWallet(record.paymentTxHash, owner.walletAddress) : false
  ));
  const record = candidates.find((_, index) => matches[index]);
  if (record) {
    console.info("[bstock:studio]", JSON.stringify({ event: "legacy_job_reclaimed", jobId: record.jobId, symbol: record.symbol }));
    return attachOwner(record, owner);
  }
  return null;
}

export function isStudioReportComplete(record: BstockResearchJob) {
  return record.status === "succeeded" && Boolean(record.reportMarkdown);
}

export function isStudioJobPending(record: BstockResearchJob) {
  return ["settling", "queued", "running", "finalizing", "succeeded"].includes(record.status.toLowerCase())
    && !record.reportMarkdown;
}

export function isStudioJobTerminalFailure(record: BstockResearchJob) {
  return record.status.toLowerCase() === "failed" && !record.retryable && !record.reportMarkdown;
}
