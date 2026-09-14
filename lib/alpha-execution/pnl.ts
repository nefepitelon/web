import "server-only";
import { createHash } from "node:crypto";
import { AlphaExecutionMode, AlphaMarketType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AlphaBinanceClient, type BinanceMarket } from "@/lib/alpha-execution/binance";
import { decryptTradingSecret } from "@/lib/alpha-execution/credentials";
import { collectIncomeSummary, emptyIncomeSummary, type LiveIncomeSummary } from "@/lib/alpha-execution/pnl-summary";

const DAY = 86_400_000;
const MAX_HISTORY = 89 * DAY; // Always within Binance's last-three-month retention.
const CACHE_MS = 5 * 60_000;
const summaries = new Map<string, { expires: number; result: Promise<LiveIncomeSummary> }>();

async function liveCredential(userId: string, market: BinanceMarket) {
  return prisma.alphaTradingCredential.findUnique({ where: {
    userId_environment_market: { userId, environment: AlphaExecutionMode.LIVE, market: market === "spot" ? AlphaMarketType.SPOT : AlphaMarketType.FUTURES },
  } });
}

async function readCredentialIncome(credential: Awaited<ReturnType<typeof liveCredential>>, market: BinanceMarket, startTime: number, endTime: number) {
  if (market === "spot") return emptyIncomeSummary(startTime, endTime, "unavailable", "现货成交接口不提供已实现盈亏；缺少完整历史成本与划转基准，不能将成交额或持仓估算冒充实际收益。");
  if (!credential?.enabled || !credential.verifiedAt) return emptyIncomeSummary(startTime, endTime, "not_configured", "尚无已验证的 LIVE 合约凭据，无法读取交易所结算流水。");
  let client: AlphaBinanceClient | undefined;
  try {
    client = new AlphaBinanceClient({ environment: "live", market,
      apiKey: decryptTradingSecret(credential.apiKeyEncrypted), apiSecret: decryptTradingSecret(credential.apiSecretEncrypted),
      proxy: credential.proxyEncrypted ? decryptTradingSecret(credential.proxyEncrypted) : null,
    });
    return await collectIncomeSummary((input) => client!.getIncomeHistoryPage(input), startTime, endTime);
  } catch {
    return emptyIncomeSummary(startTime, endTime, "unavailable", "交易所结算流水暂不可用；请检查当前凭据和连接状态。");
  } finally { await client?.close(); }
}

/** Read-only, uncached income for a risk window. Non-trading flows are separate. */
export async function fetchLiveIncomeForPeriod(userId: string, market: BinanceMarket, startTime: number, endTime: number) {
  if (!["spot", "futures"].includes(market) || !Number.isSafeInteger(startTime) || !Number.isSafeInteger(endTime)
    || startTime > endTime || endTime > Date.now() + 30_000 || startTime < Date.now() - MAX_HISTORY - 60_000) {
    throw new Error("盈亏统计范围必须在最近 89 天内，且结束时间不能晚于当前时间");
  }
  const credential = await liveCredential(userId, market);
  return readCredentialIncome(credential, market, startTime, endTime);
}

/** Dashboard summary; cache is scoped to owner and encrypted credential version. */
export async function getLivePnlSummary(userId: string, market: BinanceMarket) {
  const credential = await liveCredential(userId, market);
  const now = Date.now();
  const version = createHash("sha256").update(JSON.stringify([
    credential?.id, credential?.apiKeyEncrypted, credential?.apiSecretEncrypted, credential?.proxyEncrypted,
    credential?.enabled, credential?.verifiedAt,
  ])).digest("hex");
  const key = `${userId}:${market}:${version}`;
  const cached = summaries.get(key);
  if (cached && cached.expires > now) return cached.result;
  for (const [entryKey, entry] of summaries) if (entry.expires <= now) summaries.delete(entryKey);
  if (summaries.size >= 64) summaries.delete(summaries.keys().next().value!);
  const result = readCredentialIncome(credential, market, now - MAX_HISTORY, now);
  summaries.set(key, { expires: now + CACHE_MS, result });
  return result;
}
