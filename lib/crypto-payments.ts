import "server-only";

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { priceCents, type BillablePlan, type BillingInterval } from "@/lib/plans";
import { activatePaidSubscription } from "@/lib/subscription-fulfillment";

export const USDT_TRC20_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
export const USDT_BSC_CONTRACT = "0x55d398326f99059ff775485246999027b3197955";
const BSC_CHAIN_ID = 56;
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export type PaymentMethod = "TRON_USDT" | "BSC_USDT" | "BINANCE_UID" | "WECHAT";
export type UsdtChainPaymentMethod = Extract<PaymentMethod, "TRON_USDT" | "BSC_USDT">;

type ChainChannel = {
  enabled: boolean;
  receiveAddress: string;
  confirmations: number;
};

type ManualChannel = {
  enabled: boolean;
  recipient: string;
  recipientName: string;
  qrCodeUrl: string;
  instructions: string;
};

export type CryptoPaymentSettings = {
  invoiceExpiryMinutes: number;
  reviewSlaHours: number;
  cnyPerUsd: number;
  trc20: ChainChannel;
  bsc: ChainChannel;
  binanceUid: ManualChannel;
  wechat: ManualChannel;
};

export const defaultCryptoPaymentSettings: CryptoPaymentSettings = {
  invoiceExpiryMinutes: 60,
  reviewSlaHours: 4,
  cnyPerUsd: 7.2,
  trc20: { enabled: false, receiveAddress: "", confirmations: 1 },
  bsc: { enabled: false, receiveAddress: "", confirmations: 12 },
  binanceUid: { enabled: false, recipient: "", recipientName: "", qrCodeUrl: "", instructions: "请通过币安内部转账向指定 UID 支付 USDT，并填写订单号或上传付款凭证。" },
  wechat: { enabled: false, recipient: "", recipientName: "", qrCodeUrl: "", instructions: "请扫码支付订单显示的人民币金额，并上传付款截图。" }
};

function record(value: Prisma.JsonValue | null | undefined) {
  return value && !Array.isArray(value) && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function chainChannel(value: unknown, fallback: ChainChannel): ChainChannel {
  const input = value && !Array.isArray(value) && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    enabled: input.enabled === true,
    receiveAddress: stringValue(input.receiveAddress),
    confirmations: Math.round(boundedNumber(input.confirmations, fallback.confirmations, 1, 200))
  };
}

function manualChannel(value: unknown, fallback: ManualChannel): ManualChannel {
  const input = value && !Array.isArray(value) && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    enabled: input.enabled === true,
    recipient: stringValue(input.recipient),
    recipientName: stringValue(input.recipientName),
    qrCodeUrl: stringValue(input.qrCodeUrl),
    instructions: stringValue(input.instructions, fallback.instructions)
  };
}

export function parseCryptoPaymentSettings(value: Prisma.JsonValue | null | undefined): CryptoPaymentSettings {
  const input = record(value);
  const legacyAddress = stringValue(input.receiveAddress);
  return {
    invoiceExpiryMinutes: Math.round(boundedNumber(input.invoiceExpiryMinutes, 60, 15, 1440)),
    reviewSlaHours: Math.round(boundedNumber(input.reviewSlaHours, 4, 1, 48)),
    cnyPerUsd: boundedNumber(input.cnyPerUsd, 7.2, 1, 20),
    trc20: input.trc20
      ? chainChannel(input.trc20, defaultCryptoPaymentSettings.trc20)
      : { enabled: input.enabled === true, receiveAddress: legacyAddress, confirmations: 1 },
    bsc: chainChannel(input.bsc, defaultCryptoPaymentSettings.bsc),
    binanceUid: manualChannel(input.binanceUid, defaultCryptoPaymentSettings.binanceUid),
    wechat: manualChannel(input.wechat, defaultCryptoPaymentSettings.wechat)
  };
}

export async function getCryptoPaymentSettings(): Promise<CryptoPaymentSettings> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: "crypto.payment" } });
  return parseCryptoPaymentSettings(setting?.value);
}

function base58Decode(value: string) {
  let numeric = 0n;
  for (const char of value) {
    const index = BASE58.indexOf(char);
    if (index < 0) throw new Error("INVALID_BASE58");
    numeric = numeric * 58n + BigInt(index);
  }
  let hex = numeric.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  const decoded = Buffer.from(hex, "hex");
  const leading = value.match(/^1+/)?.[0].length ?? 0;
  return Buffer.concat([Buffer.alloc(leading), decoded]);
}

function base58Encode(bytes: Buffer) {
  let numeric = BigInt(`0x${bytes.toString("hex") || "0"}`);
  let output = "";
  while (numeric > 0n) {
    output = BASE58[Number(numeric % 58n)] + output;
    numeric /= 58n;
  }
  const leading = bytes.findIndex((byte) => byte !== 0);
  const zeroes = leading < 0 ? bytes.length : leading;
  return `${"1".repeat(zeroes)}${output}`;
}

function checksum(payload: Buffer) {
  return createHash("sha256").update(createHash("sha256").update(payload).digest()).digest().subarray(0, 4);
}

function hexToTronAddress(value: string) {
  const clean = value.replace(/^0x/, "").toLowerCase();
  const payload = Buffer.from(clean.length === 40 ? `41${clean}` : clean, "hex");
  if (payload.length !== 21 || payload[0] !== 0x41) return value;
  return base58Encode(Buffer.concat([payload, checksum(payload)]));
}

export function isValidTronAddress(value: string) {
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value)) return false;
  try {
    const decoded = base58Decode(value);
    return decoded.length === 25 && decoded[0] === 0x41 && decoded.subarray(21).equals(checksum(decoded.subarray(0, 21)));
  } catch {
    return false;
  }
}

export function isValidEvmAddress(value: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

export function paymentMethodLabel(method: string) {
  return ({
    TRON_USDT: "TRON（TRC20）USDT",
    BSC_USDT: "BNB Smart Chain（BEP20）USDT",
    BINANCE_UID: "币安 UID 转账",
    WECHAT: "微信收款"
  } as Record<string, string>)[method] ?? method;
}

export function enabledPaymentMethods(settings: CryptoPaymentSettings) {
  return ([
    settings.bsc.enabled && isValidEvmAddress(settings.bsc.receiveAddress) ? "BSC_USDT" : null,
    settings.trc20.enabled && isValidTronAddress(settings.trc20.receiveAddress) ? "TRON_USDT" : null,
    settings.binanceUid.enabled && settings.binanceUid.recipient ? "BINANCE_UID" : null,
    settings.wechat.enabled && (settings.wechat.recipient || settings.wechat.qrCodeUrl) ? "WECHAT" : null
  ].filter(Boolean) as PaymentMethod[]);
}

export async function createCryptoInvoice(userId: string, plan: BillablePlan, interval: BillingInterval, method: PaymentMethod) {
  const settings = await getCryptoPaymentSettings();
  if (!enabledPaymentMethods(settings).includes(method)) throw new Error("PAYMENT_METHOD_NOT_CONFIGURED");
  const amountCents = priceCents(plan, interval);
  const channel = method === "TRON_USDT"
    ? { network: "TRON", asset: "USDT", receiveAddress: settings.trc20.receiveAddress, paymentAmount: amountCents / 100, paymentCurrency: "USDT" }
    : method === "BSC_USDT"
      ? { network: "BSC", asset: "USDT", receiveAddress: settings.bsc.receiveAddress, paymentAmount: amountCents / 100, paymentCurrency: "USDT" }
      : method === "BINANCE_UID"
        ? { network: "BINANCE", asset: "USDT", receiveAddress: settings.binanceUid.recipient, paymentAmount: amountCents / 100, paymentCurrency: "USDT" }
        : { network: "WECHAT", asset: "CNY", receiveAddress: settings.wechat.recipient || "WECHAT_QR", paymentAmount: Math.round(amountCents * settings.cnyPerUsd) / 100, paymentCurrency: "CNY" };
  const now = new Date();
  return prisma.cryptoPayment.create({
    data: {
      userId,
      planKey: plan,
      billingInterval: interval,
      amountCents,
      paymentMethod: method,
      paymentAmount: new Prisma.Decimal(channel.paymentAmount),
      paymentCurrency: channel.paymentCurrency,
      network: channel.network,
      asset: channel.asset,
      receiveAddress: channel.receiveAddress,
      expiresAt: new Date(now.getTime() + settings.invoiceExpiryMinutes * 60_000),
      metadata: { qrCodeUrl: method === "BINANCE_UID" ? settings.binanceUid.qrCodeUrl : method === "WECHAT" ? settings.wechat.qrCodeUrl : "", recipientName: method === "BINANCE_UID" ? settings.binanceUid.recipientName : method === "WECHAT" ? settings.wechat.recipientName : "", instructions: method === "BINANCE_UID" ? settings.binanceUid.instructions : method === "WECHAT" ? settings.wechat.instructions : "" }
    }
  });
}

type TronEvent = {
  event_name?: string;
  contract_address?: string;
  transaction_id?: string;
  block_number?: number;
  block_timestamp?: number;
  result?: Record<string, string>;
};

async function confirmedTronTransfers(txHash: string) {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (process.env.TRONGRID_API_KEY) headers["TRON-PRO-API-KEY"] = process.env.TRONGRID_API_KEY;
  const response = await fetch(`https://api.trongrid.io/v1/transactions/${txHash}/events?only_confirmed=true`, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(12_000)
  });
  if (response.status === 429) throw new Error("TRONGRID_RATE_LIMIT");
  if (!response.ok) throw new Error("TRONGRID_UNAVAILABLE");
  const payload = await response.json() as { data?: TronEvent[] };
  return (payload.data ?? []).filter((event) => event.event_name === "Transfer" && event.contract_address === USDT_TRC20_CONTRACT);
}

function tronTarget(event: TronEvent) {
  const value = event.result?.to ?? event.result?._to ?? event.result?.["1"] ?? "";
  return /^[0-9a-fA-F]{40,42}$/.test(value.replace(/^0x/, "")) ? hexToTronAddress(value) : value;
}

function tronAmount(event: TronEvent) {
  const value = event.result?.value ?? event.result?._value ?? event.result?.["2"] ?? "0";
  try { return BigInt(value); } catch { return 0n; }
}

type RpcReceipt = {
  status?: string;
  blockNumber?: string;
  logs?: Array<{ address?: string; topics?: string[]; data?: string }>;
};

async function bscRpc<T>(method: string, params: unknown[]) {
  const response = await fetch(process.env.BSC_RPC_URL || "https://bsc-dataseed.bnbchain.org", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000)
  });
  if (!response.ok) throw new Error("BSC_RPC_UNAVAILABLE");
  const payload = await response.json() as { result?: T; error?: unknown };
  if (payload.error) throw new Error("BSC_RPC_UNAVAILABLE");
  return payload.result;
}

function topicAddress(topic: string | undefined) {
  return topic ? `0x${topic.slice(-40).toLowerCase()}` : "";
}

async function verifyTron(invoice: { amountCents: number; receiveAddress: string; createdAt: Date }, txHash: string) {
  if (!/^[0-9a-f]{64}$/.test(txHash)) throw new Error("INVALID_TX_HASH");
  const transfers = await confirmedTronTransfers(txHash);
  if (!transfers.length) throw new Error("PAYMENT_NOT_CONFIRMED");
  const addressed = transfers.filter((event) => tronTarget(event) === invoice.receiveAddress);
  if (!addressed.length) throw new Error("PAYMENT_ADDRESS_MISMATCH");
  const event = addressed.find((candidate) => tronAmount(candidate) >= BigInt(invoice.amountCents) * 10_000n);
  if (!event) throw new Error("PAYMENT_AMOUNT_INSUFFICIENT");
  const eventTime = event.block_timestamp ? new Date(event.block_timestamp) : new Date();
  if (eventTime.getTime() < invoice.createdAt.getTime() - 5 * 60_000) throw new Error("PAYMENT_TOO_OLD");
  return { blockNumber: event.block_number ? BigInt(event.block_number) : null, metadata: { tokenContract: USDT_TRC20_CONTRACT, eventTimestamp: event.block_timestamp ?? null } };
}

async function verifyBsc(invoice: { amountCents: number; receiveAddress: string; createdAt: Date }, txHash: string, confirmations: number) {
  if (!/^0x[0-9a-f]{64}$/.test(txHash)) throw new Error("INVALID_TX_HASH");
  const [chainIdHex, receipt, latestHex] = await Promise.all([
    bscRpc<string>("eth_chainId", []),
    bscRpc<RpcReceipt>("eth_getTransactionReceipt", [txHash]),
    bscRpc<string>("eth_blockNumber", [])
  ]);
  if (!chainIdHex || Number.parseInt(chainIdHex, 16) !== BSC_CHAIN_ID) throw new Error("BSC_WRONG_NETWORK");
  if (!receipt || receipt.status !== "0x1" || !receipt.blockNumber) throw new Error("PAYMENT_NOT_CONFIRMED");
  const blockNumber = Number.parseInt(receipt.blockNumber, 16);
  const latest = Number.parseInt(latestHex ?? "0x0", 16);
  if (latest - blockNumber + 1 < confirmations) throw new Error("PAYMENT_NOT_CONFIRMED");
  const matching = (receipt.logs ?? []).filter((log) =>
    log.address?.toLowerCase() === USDT_BSC_CONTRACT &&
    log.topics?.[0]?.toLowerCase() === TRANSFER_TOPIC &&
    topicAddress(log.topics?.[2]) === invoice.receiveAddress.toLowerCase()
  );
  if (!matching.length) throw new Error("PAYMENT_ADDRESS_MISMATCH");
  const requiredRaw = BigInt(invoice.amountCents) * 10_000_000_000_000_000n;
  if (!matching.some((log) => {
    try { return BigInt(log.data ?? "0x0") >= requiredRaw; } catch { return false; }
  })) throw new Error("PAYMENT_AMOUNT_INSUFFICIENT");
  const block = await bscRpc<{ timestamp?: string }>("eth_getBlockByNumber", [receipt.blockNumber, false]);
  const eventTimestamp = Number.parseInt(block?.timestamp ?? "0x0", 16) * 1000;
  if (eventTimestamp && eventTimestamp < invoice.createdAt.getTime() - 5 * 60_000) throw new Error("PAYMENT_TOO_OLD");
  return { blockNumber: BigInt(blockNumber), metadata: { tokenContract: USDT_BSC_CONTRACT, chainId: BSC_CHAIN_ID, confirmations: latest - blockNumber + 1, eventTimestamp } };
}

export function normalizeChainTxHash(method: UsdtChainPaymentMethod, value: string) {
  return method === "BSC_USDT"
    ? value.trim().toLowerCase()
    : value.trim().replace(/^0x/, "").toLowerCase();
}

export async function verifyUsdtTransfer(input: {
  method: UsdtChainPaymentMethod;
  amountCents: number;
  receiveAddress: string;
  createdAt: Date;
  txHash: string;
}) {
  const settings = await getCryptoPaymentSettings();
  const txHash = normalizeChainTxHash(input.method, input.txHash);
  const verification = input.method === "BSC_USDT"
    ? await verifyBsc(input, txHash, settings.bsc.confirmations)
    : await verifyTron(input, txHash);
  return { ...verification, txHash, network: input.method === "BSC_USDT" ? "BSC" : "TRON" } as const;
}

export async function verifyCryptoInvoice(userId: string, invoiceId: string, txHashInput: string) {
  const invoice = await prisma.cryptoPayment.findFirst({ where: { id: invoiceId, userId } });
  if (!invoice) throw new Error("INVOICE_NOT_FOUND");
  if (invoice.status === "PAID") return invoice;
  if (!["TRON_USDT", "BSC_USDT"].includes(invoice.paymentMethod)) throw new Error("MANUAL_PAYMENT_REQUIRED");
  if (invoice.expiresAt.getTime() < Date.now()) {
    await prisma.cryptoPayment.update({ where: { id: invoice.id }, data: { status: "EXPIRED" } });
    throw new Error("INVOICE_EXPIRED");
  }
  const method = invoice.paymentMethod as UsdtChainPaymentMethod;
  const txHash = normalizeChainTxHash(method, txHashInput);
  const used = await prisma.cryptoPayment.findUnique({ where: { txHash } });
  if (used && used.id !== invoice.id) throw new Error("TX_ALREADY_USED");
  const network = method === "BSC_USDT" ? "BSC" : "TRON";
  const claimed = await prisma.chainTransactionClaim.findUnique({ where: { network_txHash: { network, txHash } } });
  if (claimed && !(claimed.purpose === "SUBSCRIPTION" && claimed.referenceId === invoice.id)) throw new Error("TX_ALREADY_USED");
  let verification: { blockNumber: bigint | null; metadata: Record<string, unknown>; txHash: string; network: string };
  try {
    verification = await verifyUsdtTransfer({
      method,
      amountCents: invoice.amountCents,
      receiveAddress: invoice.receiveAddress,
      createdAt: invoice.createdAt,
      txHash
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PAYMENT_NOT_CONFIRMED") {
      await prisma.cryptoPayment.update({ where: { id: invoice.id }, data: { txHash, status: "CONFIRMING", submittedAt: invoice.submittedAt ?? new Date() } });
    }
    throw error;
  }
  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      const transactionClaim = await tx.chainTransactionClaim.upsert({
        where: { network_txHash: { network, txHash } },
        update: {},
        create: { network, txHash, purpose: "SUBSCRIPTION", referenceId: invoice.id, userId }
      });
      if (transactionClaim.purpose !== "SUBSCRIPTION" || transactionClaim.referenceId !== invoice.id) throw new Error("TX_ALREADY_USED");
      const paymentClaim = await tx.cryptoPayment.updateMany({
        where: { id: invoice.id, status: { not: "PAID" } },
        data: { txHash, status: "PAID", submittedAt: invoice.submittedAt ?? now, confirmedAt: now, blockNumber: verification.blockNumber, metadata: verification.metadata as Prisma.InputJsonValue }
      });
      if (paymentClaim.count !== 1) throw new Error("PAYMENT_ALREADY_PROCESSED");
      await activatePaidSubscription(tx, {
        userId,
        provider: invoice.paymentMethod === "BSC_USDT" ? "bsc-usdt" : "tron-usdt",
        providerSubscriptionId: `crypto:${invoice.id}`,
        planKey: invoice.planKey as BillablePlan,
        billingInterval: invoice.billingInterval as BillingInterval,
        amountCents: invoice.amountCents,
        paymentEventId: `crypto:${txHash}`,
        grantedBy: `crypto:${txHash}`,
        startedAt: now
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new Error("TX_ALREADY_USED");
    throw error;
  }
  return prisma.cryptoPayment.findUniqueOrThrow({ where: { id: invoice.id } });
}

export async function submitManualPayment(userId: string, invoiceId: string, input: { paymentReference?: string; proofUrl?: string }) {
  const invoice = await prisma.cryptoPayment.findFirst({ where: { id: invoiceId, userId } });
  if (!invoice) throw new Error("INVOICE_NOT_FOUND");
  if (!["BINANCE_UID", "WECHAT"].includes(invoice.paymentMethod)) throw new Error("CHAIN_PAYMENT_REQUIRED");
  if (invoice.status === "PAID") return invoice;
  if (invoice.expiresAt.getTime() < Date.now()) throw new Error("INVOICE_EXPIRED");
  const paymentReference = input.paymentReference?.trim().slice(0, 300) || null;
  const proofUrl = input.proofUrl?.trim() || null;
  if (!paymentReference && !proofUrl) throw new Error("PAYMENT_PROOF_REQUIRED");
  const settings = await getCryptoPaymentSettings();
  const now = new Date();
  return prisma.cryptoPayment.update({
    where: { id: invoice.id },
    data: {
      paymentReference,
      proofUrl,
      status: "REVIEW",
      submittedAt: now,
      reviewDueAt: new Date(now.getTime() + settings.reviewSlaHours * 60 * 60_000)
    }
  });
}

export async function reviewManualPayment(input: { invoiceId: string; adminUserId: string; approved: boolean; note?: string }) {
  const invoice = await prisma.cryptoPayment.findUnique({ where: { id: input.invoiceId } });
  if (!invoice) throw new Error("INVOICE_NOT_FOUND");
  if (!["BINANCE_UID", "WECHAT"].includes(invoice.paymentMethod)) throw new Error("NOT_MANUAL_PAYMENT");
  if (invoice.status === "PAID") return invoice;
  if (invoice.status !== "REVIEW") throw new Error("PAYMENT_NOT_IN_REVIEW");
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.cryptoPayment.updateMany({
      where: { id: invoice.id, status: "REVIEW" },
      data: {
        status: input.approved ? "PAID" : "FAILED",
        reviewedAt: now,
        reviewedBy: input.adminUserId,
        reviewNote: input.note?.trim().slice(0, 1000) || null,
        confirmedAt: input.approved ? now : null
      }
    });
    if (claimed.count !== 1) throw new Error("PAYMENT_ALREADY_REVIEWED");
    if (input.approved) {
      await activatePaidSubscription(tx, {
        userId: invoice.userId,
        provider: invoice.paymentMethod === "BINANCE_UID" ? "binance-uid" : "wechat",
        providerSubscriptionId: `manual:${invoice.id}`,
        planKey: invoice.planKey as BillablePlan,
        billingInterval: invoice.billingInterval as BillingInterval,
        amountCents: invoice.amountCents,
        paymentEventId: `manual:${invoice.id}`,
        grantedBy: `admin:${input.adminUserId}`,
        startedAt: now
      });
    }
    await tx.auditLog.create({
      data: {
        actorUserId: input.adminUserId,
        action: input.approved ? "PAYMENT_APPROVED" : "PAYMENT_REJECTED",
        targetType: "CryptoPayment",
        targetId: invoice.id,
        metadata: { paymentMethod: invoice.paymentMethod, note: input.note ?? null } as Prisma.InputJsonValue
      }
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return prisma.cryptoPayment.findUniqueOrThrow({ where: { id: invoice.id } });
}
