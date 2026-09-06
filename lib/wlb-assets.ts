import "server-only";

import { Prisma } from "@prisma/client";
import {
  enabledPaymentMethods,
  getCryptoPaymentSettings,
  isValidEvmAddress,
  isValidTronAddress,
  normalizeChainTxHash,
  verifyUsdtTransfer,
  type UsdtChainPaymentMethod
} from "@/lib/crypto-payments";
import { prisma } from "@/lib/prisma";

export const WLB_PER_USDT = 10;
export const MILLI_WLB_PER_USDT_CENT = 100n;

export type WlbAssetSettings = {
  usdtToWlb: 10;
  depositEnabled: boolean;
  transferEnabled: boolean;
  withdrawalEnabled: boolean;
  minDepositUsdt: number;
  minTransferWlb: number;
  minWithdrawalWlb: number;
  withdrawalFeeWlb: number;
  maxDailyTransferWlb: number;
};

export const defaultWlbAssetSettings: WlbAssetSettings = {
  usdtToWlb: 10,
  depositEnabled: true,
  transferEnabled: true,
  withdrawalEnabled: true,
  minDepositUsdt: 1,
  minTransferWlb: 1,
  minWithdrawalWlb: 10,
  withdrawalFeeWlb: 0,
  maxDailyTransferWlb: 100_000
};

function settingRecord(value: Prisma.JsonValue | null | undefined) {
  return value && !Array.isArray(value) && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}

function bounded(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

export function parseWlbAssetSettings(value: Prisma.JsonValue | null | undefined): WlbAssetSettings {
  const input = settingRecord(value);
  return {
    usdtToWlb: 10,
    depositEnabled: input.depositEnabled !== false,
    transferEnabled: input.transferEnabled !== false,
    withdrawalEnabled: input.withdrawalEnabled !== false,
    minDepositUsdt: bounded(input.minDepositUsdt, 1, 0.01, 1_000_000),
    minTransferWlb: bounded(input.minTransferWlb, 1, 0.001, 1_000_000_000),
    minWithdrawalWlb: bounded(input.minWithdrawalWlb, 10, 0.1, 1_000_000_000),
    withdrawalFeeWlb: bounded(input.withdrawalFeeWlb, 0, 0, 1_000_000),
    maxDailyTransferWlb: bounded(input.maxDailyTransferWlb, 100_000, 1, 1_000_000_000)
  };
}

export async function getWlbAssetSettings() {
  const setting = await prisma.systemSetting.findUnique({ where: { key: "wlb.asset" } });
  return parseWlbAssetSettings(setting?.value);
}

export function parseUsdtToCents(value: string) {
  const normalized = value.trim();
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(normalized)) throw new Error("INVALID_AMOUNT");
  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error("INVALID_AMOUNT");
  return cents;
}

export function parseWlbToMilli(value: string) {
  const normalized = value.trim();
  if (!/^\d{1,12}(?:\.\d{1,3})?$/.test(normalized)) throw new Error("INVALID_AMOUNT");
  const [whole, fraction = ""] = normalized.split(".");
  const milli = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
  if (milli <= 0n) throw new Error("INVALID_AMOUNT");
  return milli;
}

export function formatWlb(milliWlb: bigint) {
  const negative = milliWlb < 0n;
  const absolute = negative ? -milliWlb : milliWlb;
  const whole = absolute / 1000n;
  const fraction = (absolute % 1000n).toString().padStart(3, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toLocaleString("en-US")}${fraction ? `.${fraction}` : ""}`;
}

export function formatUsdtFromMilliWlb(milliWlb: bigint) {
  const cents = milliWlb / MILLI_WLB_PER_USDT_CENT;
  const remainder = milliWlb % MILLI_WLB_PER_USDT_CENT;
  const sign = cents < 0n || remainder < 0n ? "-" : "";
  const absoluteCents = cents < 0n ? -cents : cents;
  return `${sign}${absoluteCents / 100n}.${(absoluteCents % 100n).toString().padStart(2, "0")}`;
}

function normalizeHandle(value: string) {
  const handle = value.trim().replace(/\.welinkbtc$/i, "").toLowerCase();
  if (!/^[a-z]{3,20}$/.test(handle)) throw new Error("INVALID_RECIPIENT");
  return handle;
}

async function ensureAccount(tx: Prisma.TransactionClient, userId: string) {
  return tx.wlbAccount.upsert({
    where: { userId },
    update: {},
    create: { userId }
  });
}

async function creditCommission(commission: {
  id: string;
  referrerUserId: string;
  referredUserId: string;
  rewardType: string;
  level: number;
  planKey: string;
  amountCents: number;
}) {
  if (commission.amountCents <= 0) return;
  const reference = `commission:${commission.id}`;
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.wlbTransaction.findUnique({ where: { externalReference: reference } });
      if (existing) return;
      const amountMilliWlb = BigInt(commission.amountCents) * MILLI_WLB_PER_USDT_CENT;
      const transaction = await tx.wlbTransaction.create({
        data: {
          type: "COMMISSION",
          status: "COMPLETED",
          ownerUserId: commission.referrerUserId,
          counterpartyUserId: commission.referredUserId,
          amountMilliWlb,
          usdtAmountCents: commission.amountCents,
          externalReference: reference,
          completedAt: new Date(),
          metadata: {
            commissionId: commission.id,
            rewardType: commission.rewardType,
            level: commission.level,
            planKey: commission.planKey,
            rate: WLB_PER_USDT
          } as Prisma.InputJsonValue
        }
      });
      const account = await tx.wlbAccount.upsert({
        where: { userId: commission.referrerUserId },
        update: {
          availableMilliWlb: { increment: amountMilliWlb },
          totalCreditedMilliWlb: { increment: amountMilliWlb }
        },
        create: {
          userId: commission.referrerUserId,
          availableMilliWlb: amountMilliWlb,
          totalCreditedMilliWlb: amountMilliWlb
        }
      });
      await tx.wlbLedgerEntry.create({
        data: {
          transactionId: transaction.id,
          userId: commission.referrerUserId,
          phase: "POST",
          availableDeltaMilliWlb: amountMilliWlb,
          pendingDeltaMilliWlb: 0n,
          availableAfterMilliWlb: account.availableMilliWlb,
          pendingAfterMilliWlb: account.pendingWithdrawalMilliWlb
        }
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
    throw error;
  }
}

export async function syncEligibleCommissionWlb(userId: string) {
  const commissions = await prisma.commissionLedger.findMany({
    where: { referrerUserId: userId, status: { in: ["APPROVED", "PAYABLE", "PAID"] }, amountCents: { gt: 0 } },
    select: { id: true, referrerUserId: true, referredUserId: true, rewardType: true, level: true, planKey: true, amountCents: true },
    orderBy: { createdAt: "asc" },
    take: 2000
  });
  for (const commission of commissions) await creditCommission(commission);
}

export async function createWlbDepositInvoice(userId: string, method: UsdtChainPaymentMethod, amountCents: number) {
  const [settings, cryptoSettings] = await Promise.all([getWlbAssetSettings(), getCryptoPaymentSettings()]);
  if (!settings.depositEnabled) throw new Error("DEPOSIT_DISABLED");
  if (!enabledPaymentMethods(cryptoSettings).includes(method)) throw new Error("PAYMENT_METHOD_NOT_CONFIGURED");
  if (amountCents < Math.ceil(settings.minDepositUsdt * 100) || amountCents > 100_000_000) throw new Error("AMOUNT_OUT_OF_RANGE");
  const receiveAddress = method === "BSC_USDT" ? cryptoSettings.bsc.receiveAddress : cryptoSettings.trc20.receiveAddress;
  const now = new Date();
  return prisma.wlbTransaction.create({
    data: {
      type: "DEPOSIT",
      status: "PENDING",
      ownerUserId: userId,
      amountMilliWlb: BigInt(amountCents) * MILLI_WLB_PER_USDT_CENT,
      usdtAmountCents: amountCents,
      paymentMethod: method,
      network: method === "BSC_USDT" ? "BSC" : "TRON",
      receiveAddress,
      expiresAt: new Date(now.getTime() + cryptoSettings.invoiceExpiryMinutes * 60_000),
      metadata: { rate: WLB_PER_USDT } as Prisma.InputJsonValue
    }
  });
}

export async function verifyWlbDeposit(userId: string, transactionId: string, txHashInput: string) {
  const deposit = await prisma.wlbTransaction.findFirst({
    where: { id: transactionId, ownerUserId: userId, type: "DEPOSIT" }
  });
  if (!deposit) throw new Error("DEPOSIT_NOT_FOUND");
  if (deposit.status === "COMPLETED") return deposit;
  if (!deposit.paymentMethod || !["BSC_USDT", "TRON_USDT"].includes(deposit.paymentMethod) || !deposit.usdtAmountCents || !deposit.receiveAddress || !deposit.network) {
    throw new Error("INVALID_DEPOSIT");
  }
  if (deposit.expiresAt && deposit.expiresAt.getTime() < Date.now()) {
    await prisma.wlbTransaction.update({ where: { id: deposit.id }, data: { status: "EXPIRED" } });
    throw new Error("INVOICE_EXPIRED");
  }
  const method = deposit.paymentMethod as UsdtChainPaymentMethod;
  const txHash = normalizeChainTxHash(method, txHashInput);
  const [assetUse, chainUse] = await Promise.all([
    prisma.wlbTransaction.findFirst({ where: { network: deposit.network, txHash, id: { not: deposit.id } }, select: { id: true } }),
    prisma.chainTransactionClaim.findUnique({ where: { network_txHash: { network: deposit.network, txHash } } })
  ]);
  if (assetUse || (chainUse && !(chainUse.purpose === "WLB_DEPOSIT" && chainUse.referenceId === deposit.id))) throw new Error("TX_ALREADY_USED");

  let verification: Awaited<ReturnType<typeof verifyUsdtTransfer>>;
  try {
    verification = await verifyUsdtTransfer({
      method,
      amountCents: deposit.usdtAmountCents,
      receiveAddress: deposit.receiveAddress,
      createdAt: deposit.createdAt,
      txHash
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PAYMENT_NOT_CONFIRMED") {
      await prisma.wlbTransaction.updateMany({
        where: { id: deposit.id, status: { in: ["PENDING", "CONFIRMING"] } },
        data: { txHash, status: "CONFIRMING" }
      });
    }
    throw error;
  }

  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      const claim = await tx.chainTransactionClaim.upsert({
        where: { network_txHash: { network: deposit.network!, txHash } },
        update: {},
        create: { network: deposit.network!, txHash, purpose: "WLB_DEPOSIT", referenceId: deposit.id, userId }
      });
      if (claim.purpose !== "WLB_DEPOSIT" || claim.referenceId !== deposit.id) throw new Error("TX_ALREADY_USED");
      const completed = await tx.wlbTransaction.updateMany({
        where: { id: deposit.id, status: { in: ["PENDING", "CONFIRMING"] } },
        data: {
          status: "COMPLETED",
          txHash,
          completedAt: now,
          metadata: { ...settingRecord(deposit.metadata), ...verification.metadata, rate: WLB_PER_USDT } as Prisma.InputJsonValue
        }
      });
      if (completed.count !== 1) throw new Error("DEPOSIT_ALREADY_PROCESSED");
      const account = await tx.wlbAccount.upsert({
        where: { userId },
        update: {
          availableMilliWlb: { increment: deposit.amountMilliWlb },
          totalCreditedMilliWlb: { increment: deposit.amountMilliWlb }
        },
        create: {
          userId,
          availableMilliWlb: deposit.amountMilliWlb,
          totalCreditedMilliWlb: deposit.amountMilliWlb
        }
      });
      await tx.wlbLedgerEntry.create({
        data: {
          transactionId: deposit.id,
          userId,
          phase: "POST",
          availableDeltaMilliWlb: deposit.amountMilliWlb,
          pendingDeltaMilliWlb: 0n,
          availableAfterMilliWlb: account.availableMilliWlb,
          pendingAfterMilliWlb: account.pendingWithdrawalMilliWlb
        }
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new Error("TX_ALREADY_USED");
    throw error;
  }
  return prisma.wlbTransaction.findUniqueOrThrow({ where: { id: deposit.id } });
}

export async function createWlbTransfer(userId: string, recipientInput: string, amountMilliWlb: bigint, note?: string) {
  const settings = await getWlbAssetSettings();
  if (!settings.transferEnabled) throw new Error("TRANSFER_DISABLED");
  const minimum = parseWlbToMilli(String(settings.minTransferWlb));
  if (amountMilliWlb < minimum) throw new Error("AMOUNT_OUT_OF_RANGE");
  const handle = normalizeHandle(recipientInput);
  const recipient = await prisma.user.findFirst({
    where: { status: "ACTIVE", profile: { is: { handle } } },
    select: { id: true }
  });
  if (!recipient) throw new Error("RECIPIENT_NOT_FOUND");
  if (recipient.id === userId) throw new Error("SELF_TRANSFER_NOT_ALLOWED");
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  return prisma.$transaction(async (tx) => {
    const daily = await tx.wlbTransaction.aggregate({
      where: { ownerUserId: userId, type: "TRANSFER", status: "COMPLETED", createdAt: { gte: start } },
      _sum: { amountMilliWlb: true }
    });
    const dailyLimit = parseWlbToMilli(String(settings.maxDailyTransferWlb));
    if ((daily._sum.amountMilliWlb ?? 0n) + amountMilliWlb > dailyLimit) throw new Error("DAILY_TRANSFER_LIMIT");
    await Promise.all([ensureAccount(tx, userId), ensureAccount(tx, recipient.id)]);
    const senderUpdated = await tx.wlbAccount.updateMany({
      where: { userId, availableMilliWlb: { gte: amountMilliWlb } },
      data: {
        availableMilliWlb: { decrement: amountMilliWlb },
        totalDebitedMilliWlb: { increment: amountMilliWlb }
      }
    });
    if (senderUpdated.count !== 1) throw new Error("INSUFFICIENT_WLB");
    const recipientAccount = await tx.wlbAccount.update({
      where: { userId: recipient.id },
      data: {
        availableMilliWlb: { increment: amountMilliWlb },
        totalCreditedMilliWlb: { increment: amountMilliWlb }
      }
    });
    const senderAccount = await tx.wlbAccount.findUniqueOrThrow({ where: { userId } });
    const transaction = await tx.wlbTransaction.create({
      data: {
        type: "TRANSFER",
        status: "COMPLETED",
        ownerUserId: userId,
        counterpartyUserId: recipient.id,
        amountMilliWlb,
        note: note?.trim().slice(0, 300) || null,
        completedAt: new Date()
      }
    });
    await tx.wlbLedgerEntry.createMany({
      data: [
        {
          transactionId: transaction.id,
          userId,
          phase: "POST",
          availableDeltaMilliWlb: -amountMilliWlb,
          pendingDeltaMilliWlb: 0n,
          availableAfterMilliWlb: senderAccount.availableMilliWlb,
          pendingAfterMilliWlb: senderAccount.pendingWithdrawalMilliWlb
        },
        {
          transactionId: transaction.id,
          userId: recipient.id,
          phase: "POST",
          availableDeltaMilliWlb: amountMilliWlb,
          pendingDeltaMilliWlb: 0n,
          availableAfterMilliWlb: recipientAccount.availableMilliWlb,
          pendingAfterMilliWlb: recipientAccount.pendingWithdrawalMilliWlb
        }
      ]
    });
    return transaction;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createWlbWithdrawal(userId: string, method: UsdtChainPaymentMethod, payoutAddress: string, amountMilliWlb: bigint, note?: string) {
  const [settings, cryptoSettings] = await Promise.all([getWlbAssetSettings(), getCryptoPaymentSettings()]);
  if (!settings.withdrawalEnabled) throw new Error("WITHDRAWAL_DISABLED");
  if (!enabledPaymentMethods(cryptoSettings).includes(method)) throw new Error("PAYMENT_METHOD_NOT_CONFIGURED");
  if (method === "BSC_USDT" ? !isValidEvmAddress(payoutAddress) : !isValidTronAddress(payoutAddress)) throw new Error("INVALID_PAYOUT_ADDRESS");
  const minimum = parseWlbToMilli(String(settings.minWithdrawalWlb));
  const feeMilliWlb = parseWlbToMilli(String(settings.withdrawalFeeWlb || 0.001));
  const actualFee = settings.withdrawalFeeWlb === 0 ? 0n : feeMilliWlb;
  if (amountMilliWlb < minimum || amountMilliWlb <= actualFee) throw new Error("AMOUNT_OUT_OF_RANGE");
  const payoutMilliWlb = amountMilliWlb - actualFee;
  if (payoutMilliWlb % MILLI_WLB_PER_USDT_CENT !== 0n) throw new Error("WITHDRAWAL_PRECISION");
  const payoutCents = Number(payoutMilliWlb / MILLI_WLB_PER_USDT_CENT);
  if (!Number.isSafeInteger(payoutCents) || payoutCents <= 0) throw new Error("INVALID_AMOUNT");

  return prisma.$transaction(async (tx) => {
    await ensureAccount(tx, userId);
    const reserved = await tx.wlbAccount.updateMany({
      where: { userId, availableMilliWlb: { gte: amountMilliWlb } },
      data: {
        availableMilliWlb: { decrement: amountMilliWlb },
        pendingWithdrawalMilliWlb: { increment: amountMilliWlb }
      }
    });
    if (reserved.count !== 1) throw new Error("INSUFFICIENT_WLB");
    const account = await tx.wlbAccount.findUniqueOrThrow({ where: { userId } });
    const transaction = await tx.wlbTransaction.create({
      data: {
        type: "WITHDRAWAL",
        status: "PENDING",
        ownerUserId: userId,
        amountMilliWlb,
        usdtAmountCents: payoutCents,
        paymentMethod: method,
        network: method === "BSC_USDT" ? "BSC" : "TRON",
        payoutAddress,
        note: note?.trim().slice(0, 300) || null,
        metadata: { feeMilliWlb: actualFee.toString(), payoutMilliWlb: payoutMilliWlb.toString(), rate: WLB_PER_USDT } as Prisma.InputJsonValue
      }
    });
    await tx.wlbLedgerEntry.create({
      data: {
        transactionId: transaction.id,
        userId,
        phase: "RESERVE",
        availableDeltaMilliWlb: -amountMilliWlb,
        pendingDeltaMilliWlb: amountMilliWlb,
        availableAfterMilliWlb: account.availableMilliWlb,
        pendingAfterMilliWlb: account.pendingWithdrawalMilliWlb
      }
    });
    return transaction;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function reviewWlbWithdrawal(input: {
  transactionId: string;
  adminUserId: string;
  approved: boolean;
  txHash?: string;
  note?: string;
}) {
  const withdrawal = await prisma.wlbTransaction.findFirst({
    where: { id: input.transactionId, type: "WITHDRAWAL" }
  });
  if (!withdrawal) throw new Error("WITHDRAWAL_NOT_FOUND");
  if (withdrawal.status !== "PENDING") throw new Error("WITHDRAWAL_ALREADY_REVIEWED");
  if (!withdrawal.network || !withdrawal.paymentMethod || !withdrawal.usdtAmountCents || !withdrawal.payoutAddress) throw new Error("INVALID_WITHDRAWAL");

  let verified: Awaited<ReturnType<typeof verifyUsdtTransfer>> | null = null;
  if (input.approved) {
    if (!input.txHash) throw new Error("TX_HASH_REQUIRED");
    verified = await verifyUsdtTransfer({
      method: withdrawal.paymentMethod as UsdtChainPaymentMethod,
      amountCents: withdrawal.usdtAmountCents,
      receiveAddress: withdrawal.payoutAddress,
      createdAt: withdrawal.createdAt,
      txHash: input.txHash
    });
    const claimed = await prisma.chainTransactionClaim.findUnique({
      where: { network_txHash: { network: withdrawal.network, txHash: verified.txHash } }
    });
    if (claimed && !(claimed.purpose === "WLB_WITHDRAWAL" && claimed.referenceId === withdrawal.id)) throw new Error("TX_ALREADY_USED");
  }

  try {
    await prisma.$transaction(async (tx) => {
      const changed = await tx.wlbTransaction.updateMany({
        where: { id: withdrawal.id, status: "PENDING" },
        data: {
          status: input.approved ? "COMPLETED" : "REJECTED",
          txHash: verified?.txHash ?? null,
          reviewedBy: input.adminUserId,
          reviewedAt: new Date(),
          completedAt: input.approved ? new Date() : null,
          note: input.note?.trim().slice(0, 1000) || withdrawal.note,
          metadata: verified ? { ...settingRecord(withdrawal.metadata), ...verified.metadata } as Prisma.InputJsonValue : withdrawal.metadata ?? undefined
        }
      });
      if (changed.count !== 1) throw new Error("WITHDRAWAL_ALREADY_REVIEWED");
      if (verified) {
        const claim = await tx.chainTransactionClaim.upsert({
          where: { network_txHash: { network: withdrawal.network!, txHash: verified.txHash } },
          update: {},
          create: { network: withdrawal.network!, txHash: verified.txHash, purpose: "WLB_WITHDRAWAL", referenceId: withdrawal.id, userId: withdrawal.ownerUserId }
        });
        if (claim.purpose !== "WLB_WITHDRAWAL" || claim.referenceId !== withdrawal.id) throw new Error("TX_ALREADY_USED");
      }
      const accountChanged = await tx.wlbAccount.updateMany({
        where: { userId: withdrawal.ownerUserId, pendingWithdrawalMilliWlb: { gte: withdrawal.amountMilliWlb } },
        data: input.approved
          ? {
              pendingWithdrawalMilliWlb: { decrement: withdrawal.amountMilliWlb },
              totalDebitedMilliWlb: { increment: withdrawal.amountMilliWlb }
            }
          : {
              availableMilliWlb: { increment: withdrawal.amountMilliWlb },
              pendingWithdrawalMilliWlb: { decrement: withdrawal.amountMilliWlb }
            }
      });
      if (accountChanged.count !== 1) throw new Error("WITHDRAWAL_RESERVE_MISSING");
      const account = await tx.wlbAccount.findUniqueOrThrow({ where: { userId: withdrawal.ownerUserId } });
      await tx.wlbLedgerEntry.create({
        data: {
          transactionId: withdrawal.id,
          userId: withdrawal.ownerUserId,
          phase: input.approved ? "SETTLE" : "RELEASE",
          availableDeltaMilliWlb: input.approved ? 0n : withdrawal.amountMilliWlb,
          pendingDeltaMilliWlb: -withdrawal.amountMilliWlb,
          availableAfterMilliWlb: account.availableMilliWlb,
          pendingAfterMilliWlb: account.pendingWithdrawalMilliWlb
        }
      });
      await tx.auditLog.create({
        data: {
          actorUserId: input.adminUserId,
          action: input.approved ? "wlb.withdrawal.approved" : "wlb.withdrawal.rejected",
          targetType: "WlbTransaction",
          targetId: withdrawal.id,
          metadata: { txHash: verified?.txHash ?? null, note: input.note ?? null } as Prisma.InputJsonValue
        }
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new Error("TX_ALREADY_USED");
    throw error;
  }
}

export async function grantWlbActivityReward(input: { adminUserId: string; recipient: string; amountMilliWlb: bigint; note: string }) {
  const handle = normalizeHandle(input.recipient);
  const recipient = await prisma.user.findFirst({
    where: { status: "ACTIVE", profile: { is: { handle } } },
    select: { id: true }
  });
  if (!recipient) throw new Error("RECIPIENT_NOT_FOUND");
  if (!input.note.trim()) throw new Error("REWARD_NOTE_REQUIRED");
  return prisma.$transaction(async (tx) => {
    const transaction = await tx.wlbTransaction.create({
      data: {
        type: "REWARD",
        status: "COMPLETED",
        ownerUserId: recipient.id,
        amountMilliWlb: input.amountMilliWlb,
        note: input.note.trim().slice(0, 1000),
        reviewedBy: input.adminUserId,
        reviewedAt: new Date(),
        completedAt: new Date(),
        metadata: { source: "ADMIN_ACTIVITY_REWARD" } as Prisma.InputJsonValue
      }
    });
    const account = await tx.wlbAccount.upsert({
      where: { userId: recipient.id },
      update: {
        availableMilliWlb: { increment: input.amountMilliWlb },
        totalCreditedMilliWlb: { increment: input.amountMilliWlb }
      },
      create: {
        userId: recipient.id,
        availableMilliWlb: input.amountMilliWlb,
        totalCreditedMilliWlb: input.amountMilliWlb
      }
    });
    await tx.wlbLedgerEntry.create({
      data: {
        transactionId: transaction.id,
        userId: recipient.id,
        phase: "POST",
        availableDeltaMilliWlb: input.amountMilliWlb,
        pendingDeltaMilliWlb: 0n,
        availableAfterMilliWlb: account.availableMilliWlb,
        pendingAfterMilliWlb: account.pendingWithdrawalMilliWlb
      }
    });
    await tx.auditLog.create({
      data: {
        actorUserId: input.adminUserId,
        action: "wlb.reward.granted",
        targetType: "WlbTransaction",
        targetId: transaction.id,
        metadata: { recipientUserId: recipient.id, amountMilliWlb: input.amountMilliWlb.toString(), note: input.note } as Prisma.InputJsonValue
      }
    });
    return transaction;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
