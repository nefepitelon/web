import "server-only";
import { createHash } from "node:crypto";
import { AlphaExecutionMode, Prisma } from "@prisma/client";
import { decodeEventLog, encodeFunctionData, erc20Abi, formatUnits, getAddress, isAddress, parseAbi, parseUnits } from "viem";
import { z } from "zod";
import { requireAlphaOperator } from "@/lib/alpha-execution/access";
import { executionSnapshot, getOrCreateAlphaExecutionConfig, marketFrom, modeFrom } from "@/lib/alpha-execution/data";
import { approveTradeIntent, cancelExecutionPlan, closeLivePosition, executePlan, preflightCredential, reconcileExecution, releaseKillSwitch, replaceLivePositionProtection, triggerKillSwitch } from "@/lib/alpha-execution/service";
import { requireBoundEvmBrowserWallet } from "@/lib/bstock-browser-wallet";
import { prisma } from "@/lib/prisma";
import { redactSecretData } from "@/lib/secret-redaction";
import { assessStmTokenRisk, readStmBscPrices, STM_BSC_ROUTER, STM_PAY_TOKENS, STM_WBNB, stmBscClient, type StmTokenRisk } from "./risk";
import tradingPolicy from "./trading-policy.js";
import { assertStmCexDailyRisk, assertStmCexSignal } from "./cex-risk";

export { assessStmTokenRisk } from "./risk";
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const addressSchema = z.string().trim().refine(isAddress, "需要完整 EVM 合约地址");
const quoteIdSchema = z.string().uuid();
const hashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
const routerAbi = parseAbi([
  "function getAmountsOut(uint256 amountIn,address[] path) view returns (uint256[] amounts)",
  "function swapExactTokensForTokens(uint256 amountIn,uint256 amountOutMin,address[] path,address to,uint256 deadline) returns (uint256[] amounts)"
]);
type StmQuote = {
  quoteId: string; status: "QUOTED" | "SUBMITTED" | "CONFIRMED" | "REVERTED" | "MISMATCH";
  walletAddress: string; tokenAddress: string; payToken: "USDT" | "USDC"; side: "buy" | "sell";
  amount: string; inputRaw: string; inputDecimals: number; outputDecimals: number;
  fromToken: string; toToken: string; quotedOutput: string; minimumOutput: string;
  symbol: string; notionalUsd: number; slippageBps: number; stopLossPct: number; takeProfitPct: number;
  entryPriceUsd: number; expiresAt: number; createdAt: number; requestDigest: string;
  policyFingerprint: string;
  transaction: { to: string; data: string; value: string; gas: string | null };
  approval: { token: string; spender: string; amount: string } | null;
  risk: StmTokenRisk; txHash: string | null; actualInput?: string; actualOutput?: string;
  completedAt?: string; blockNumber?: string; gasFeeBnb?: string;
  protectionMode: "manual-wallet-exit";
};
const cexIntent = z.object({
  venue: z.literal("cex"), symbol: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,26}USDT$/, "必须选择 Binance 的完整 USDT 交易对"),
  mode: z.enum(["paper", "live"]), market: z.enum(["spot", "futures"]), side: z.enum(["LONG", "SHORT"]),
  entryPrice: z.number().positive(), stopLoss: z.number().positive(), takeProfit: z.number().positive(),
  leverage: z.number().int().min(1).max(20), riskPct: z.number().min(0.1).max(1.5),
  strategy: z.enum(["S1", "S2", "S3", "S4", "S5"]), alphaScore: z.number().min(0).max(100).nullable().optional(),
  equity: z.number().positive().max(100_000_000).optional(), requestId: z.string().uuid().optional()
});
const bscQuoteInput = z.object({
  address: addressSchema, tokenAddress: addressSchema, side: z.enum(["buy", "sell"]),
  payToken: z.enum(["USDT", "USDC"]), amount: z.string().trim().max(80).regex(/^\d+(?:\.\d+)?$/),
  slippageBps: z.number().int().min(10).max(100), stopLossPct: z.number().min(1).max(30),
  takeProfitPct: z.number().min(1).max(300), requestId: z.string().uuid()
});

async function journal(userId: string, key: string, payload: Record<string, unknown>) {
  await prisma.stmHuntRecord.upsert({ where: { userId_kind_key: { userId, kind: "trade-journal", key } }, create: { userId, kind: "trade-journal", key, payload: json(payload) }, update: { payload: json(payload) } });
}

export async function stmTradingStatus(userId: string) {
  const [cex, wallets, journalRows, quotes] = await Promise.all([
    executionSnapshot(userId),
    prisma.wallet.findMany({ where: { userId, chain: "EVM" }, select: { address: true, chain: true, verifiedAt: true } }),
    prisma.stmHuntRecord.findMany({ where: { userId, kind: "trade-journal" }, orderBy: { createdAt: "desc" }, take: 60, select: { key: true, payload: true, createdAt: true } }),
    prisma.stmHuntRecord.findMany({ where: { userId, kind: "trade-quote" }, orderBy: { createdAt: "desc" }, take: 30 })
  ]);
  return { ok: true, cex, wallets, journal: journalRows, quotes: quotes.map(row => ({ ...row.payload as unknown as StmQuote, requestDigest: undefined })),
    capabilities: { cex: true, bsc: true, solana: false, cexSpotLive: false, cexFuturesLive: true, onchainAutomaticStops: false },
    setup: { credentials: "/alpha-radar#execution-control", wallet: "/account/connections", twoFactor: "/account/security" },
    notes: ["实盘沿用本站管理员、双重验证、API 权限校验及独立解锁。", "USDT 合约实盘通过交易所流水与日内基准核验；现货历史成本与划转未完整核验，STM 现货开仓仅开放模拟。", "BSC 仅提供已绑定浏览器钱包的 Pancake V2 零税代币交易。", "BSC 日亏损限额只覆盖 STM 已核验成交的 FIFO 结果，按稳定币名义价值计算，不含 Gas，不代表全钱包收益。", "BSC 止盈止损为监测价与手动退出，不是链上条件单；未授权自动签名。", "合约地址与 CEX ticker 分开核验，不以同名 token 自动关联。"] };
}

async function liveWalletGate(userId: string) {
  await requireAlphaOperator({ live: true });
  const config = await getOrCreateAlphaExecutionConfig(userId);
  if (!config.liveEnabled || !config.liveUnlockedAt) throw new Error("请先在 Alpha 执行中心完成独立实盘解锁");
  if (config.killSwitchActive || !config.reconciliationHealthy) throw new Error("全局熔断或对账异常，禁止创建或签署新交易");
  return config;
}

function walletPolicyFingerprint(config: Awaited<ReturnType<typeof getOrCreateAlphaExecutionConfig>>) {
  return createHash("sha256").update(JSON.stringify([config.liveUnlockedAt, config.riskPerTradePct, config.dailyLossLimitPct, config.maxOpenPositions, config.maxPortfolioExposurePct, config.perOrderNotionalLimit, config.dailyNotionalLimit])).digest("hex");
}

async function getQuote(userId: string, quoteId: string) {
  const row = await prisma.stmHuntRecord.findUnique({ where: { userId_kind_key: { userId, kind: "trade-quote", key: quoteId } } });
  if (!row) throw new Error("未找到当前用户的报价记录");
  return { row, quote: row.payload as unknown as StmQuote };
}

async function bindQuoteWallet(quote: StmQuote, address: string, userId: string) {
  const identity = await requireBoundEvmBrowserWallet(address);
  if (identity.userId !== userId || identity.address.toLowerCase() !== quote.walletAddress.toLowerCase()) throw new Error("报价与已验证钱包身份不一致");
  return identity;
}

async function tokenMetadata(token: `0x${string}`, wallet: `0x${string}`) {
  const [decimals, balance] = await Promise.all([
    stmBscClient.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
    stmBscClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [wallet] })
  ]);
  if (Number(decimals) > 30) throw new Error("不支持该代币精度");
  return { decimals: Number(decimals), balance, exact: formatUnits(balance, decimals) };
}

function rowsFingerprint(rows: Array<{ key: string; updatedAt: Date }>) {
  return createHash("sha256").update(rows.map(row => `${row.key}:${row.updatedAt.toISOString()}`).sort().join("|")).digest("hex");
}

async function trackedWalletExposure(rows: StmQuote[], wallet: `0x${string}`, token: `0x${string}`, asset: { decimals: number; balance: bigint; exact: string }, candidatePrice: number) {
  const addresses = [...new Set(rows.filter(row => row.walletAddress.toLowerCase() === wallet.toLowerCase() && row.status === "CONFIRMED").map(row => getAddress(row.tokenAddress)))];
  if (!addresses.includes(token)) addresses.push(token);
  if (addresses.length > 30) throw new Error("跟踪资产超出本次安全核验范围，请先整理与对账后再开仓");
  const balances = await Promise.all(addresses.map(async address => ({ address, meta: address === token ? asset : await tokenMetadata(address, wallet) })));
  const nonzero = balances.filter(row => row.meta.balance > 0n);
  const prices = await readStmBscPrices(nonzero.filter(row => row.address !== token).map(row => row.address));
  prices[token.toLowerCase()] = candidatePrice;
  return { exposureUsd: nonzero.reduce((sum, row) => sum + Number(row.meta.exact) * prices[row.address.toLowerCase()], 0), openPositions: nonzero.length };
}

async function recheckBscBuyBudget(quote: StmQuote, userId: string, config: Awaited<ReturnType<typeof getOrCreateAlphaExecutionConfig>>, risk: StmTokenRisk) {
  if (quote.side !== "buy") return;
  const wallet = getAddress(quote.walletAddress), token = getAddress(quote.tokenAddress);
  const [asset, usdt, usdc, rows] = await Promise.all([
    tokenMetadata(token, wallet), tokenMetadata(getAddress(STM_PAY_TOKENS.USDT), wallet),
    tokenMetadata(getAddress(STM_PAY_TOKENS.USDC), wallet), prisma.stmHuntRecord.findMany({ where: { userId, kind: "trade-quote" } })
  ]);
  if (!risk.priceUsd || !risk.liquidityUsd) throw new Error("签署前缺少可核验的价格或流动性");
  const prior = rows.map(row => row.payload as unknown as StmQuote);
  if (prior.some(row => row.quoteId !== quote.quoteId && (row.status === "SUBMITTED" || row.status === "MISMATCH" || (row.status === "QUOTED" && row.expiresAt > Date.now())))) throw new Error("出现其他待签署或待对账交易，禁止继续签署此报价");
  const current = prior.find(row => row.quoteId === quote.quoteId);
  if (!current || current.status !== "QUOTED" || current.txHash) throw new Error("报价已提交或状态变化，禁止再次签署");
  const exposure = await trackedWalletExposure(prior, wallet, token, asset, risk.priceUsd);
  const equityUsd = Number(usdt.exact) + Number(usdc.exact) + exposure.exposureUsd;
  const day = new Date().toISOString().slice(0, 10);
  const baselineRow = await prisma.stmHuntRecord.findUnique({ where: { userId_kind_key: { userId, kind: "trade-bsc-baseline", key: `${wallet.toLowerCase()}:${day}` } } });
  const baseline = baselineRow?.payload as { equityUsd?: number } | undefined;
  if (!baseline || typeof baseline.equityUsd !== "number" || !Number.isFinite(baseline.equityUsd) || baseline.equityUsd <= 0) throw new Error("跨日或钱包风险基准无法核验，请重新报价");
  const pnl = tradingPolicy.trackedDailyPnl(prior.filter(row => row.walletAddress.toLowerCase() === wallet.toLowerCase()), day);
  if (pnl.unknownCostBasis || pnl.realizedUsd <= -Math.min(equityUsd, baseline.equityUsd) * config.dailyLossLimitPct / 100) throw new Error("签署前日亏损额度或 FIFO 成本核验未通过");
  if (exposure.openPositions + (asset.balance === 0n ? 1 : 0) > config.maxOpenPositions) throw new Error("签署前持仓数量超过限额");
  const dailyReservedUsd = prior.filter(row => row.quoteId !== quote.quoteId && row.side === "buy" && new Date(row.createdAt).toISOString().startsWith(day) && (row.status === "SUBMITTED" || row.status === "CONFIRMED" || row.status === "MISMATCH" || (row.status === "QUOTED" && row.expiresAt > Date.now()))).reduce((sum, row) => sum + row.notionalUsd, 0);
  const budget = tradingPolicy.evaluateBuyBudget({ notionalUsd: quote.notionalUsd, equityUsd, stopLossPct: quote.stopLossPct, liquidityUsd: risk.liquidityUsd, existingExposureUsd: exposure.exposureUsd, dailyReservedUsd }, config);
  if (!budget.passed) throw new Error(`签署前钱包风险额度已变化：${budget.reasons.join("；")}`);
  const latest = await prisma.stmHuntRecord.findMany({ where: { userId, kind: "trade-quote" }, select: { key: true, updatedAt: true } });
  if (rowsFingerprint(latest) !== rowsFingerprint(rows)) throw new Error("签署核验期间交易状态已变化，请刷新并对账后重试");
}

async function createBscQuote(raw: Record<string, unknown>, userId: string) {
  const input = bscQuoteInput.parse(raw);
  const config = await liveWalletGate(userId);
  const identity = await requireBoundEvmBrowserWallet(input.address);
  if (identity.userId !== userId) throw new Error("钱包不属于当前用户");
  const token = getAddress(input.tokenAddress);
  const payment = getAddress(STM_PAY_TOKENS[input.payToken]);
  if (Object.values(STM_PAY_TOKENS).some(address => address.toLowerCase() === token.toLowerCase())) throw new Error("目标代币不能是付款稳定币");
  const digest = createHash("sha256").update(JSON.stringify({ ...input, address: identity.address.toLowerCase(), tokenAddress: token.toLowerCase() })).digest("hex");
  const existing = await prisma.stmHuntRecord.findUnique({ where: { userId_kind_key: { userId, kind: "trade-quote", key: input.requestId } } });
  if (existing) {
    const quote = existing.payload as unknown as StmQuote;
    if (quote.requestDigest !== digest) throw new Error("该请求编号已用于不同交易");
    if (quote.expiresAt <= Date.now() || quote.status !== "QUOTED") throw new Error("原报价已过期或已提交；请创建新的请求编号");
    return { ok: true, idempotent: true, chainId: 56, ...quote };
  }
  const risk = await assessStmTokenRisk({ chain: "bsc", address: token }, { maxAgeMs: 15_000 });
  if (!risk.eligible || !risk.priceUsd || !risk.liquidityUsd) throw new Error(`合约未通过交易检查：${[...risk.reasons, ...risk.unknown].join("；")}`);
  const [asset, usdt, usdc, bnbBalance] = await Promise.all([
    tokenMetadata(token, identity.address), tokenMetadata(getAddress(STM_PAY_TOKENS.USDT), identity.address),
    tokenMetadata(getAddress(STM_PAY_TOKENS.USDC), identity.address), stmBscClient.getBalance({ address: identity.address })
  ]);
  const portfolioRows = input.side === "buy" ? await prisma.stmHuntRecord.findMany({ where: { userId, kind: "trade-quote" } }) : [];
  const exposure = input.side === "buy" ? await trackedWalletExposure(portfolioRows.map(row => row.payload as unknown as StmQuote), identity.address, token, asset, risk.priceUsd) : { exposureUsd: 0, openPositions: 0 };
  if (bnbBalance < parseUnits("0.0003", 18)) throw new Error("BNB Gas 余额不足，请至少保留 0.0003 BNB");
  const pay = input.payToken === "USDT" ? usdt : usdc;
  const fromToken = input.side === "buy" ? payment : token;
  const toToken = input.side === "buy" ? token : payment;
  const from = input.side === "buy" ? pay : asset;
  const to = input.side === "buy" ? asset : pay;
  const amountIn = parseUnits(input.amount, from.decimals);
  if (amountIn <= 0n || amountIn > from.balance) throw new Error("交易数量无效或已验证钱包余额不足");
  // Paths are built only from explicit contract identities and fixed payment /
  // wrapped native assets. Neither URLs nor arbitrary calldata are accepted.
  const paths: `0x${string}`[][] = [[fromToken, toToken], [fromToken, STM_WBNB, toToken]];
  const routes = await Promise.allSettled(paths.map(path => stmBscClient.readContract({ address: STM_BSC_ROUTER, abi: routerAbi, functionName: "getAmountsOut", args: [amountIn, path] })));
  const valid = routes.flatMap((route, index) => route.status === "fulfilled" && route.value.at(-1)! > 0n ? [{ path: paths[index], output: route.value.at(-1)! }] : []).sort((a, b) => a.output > b.output ? -1 : 1);
  if (!valid.length) throw new Error("Pancake V2 未找到当前金额可执行的交易路径");
  const route = valid[0];
  const notionalUsd = Number(input.amount) * (input.side === "buy" ? 1 : risk.priceUsd);
  const output = Number(formatUnits(route.output, to.decimals));
  const expectedOutput = input.side === "buy" ? notionalUsd / risk.priceUsd : notionalUsd;
  if (!Number.isFinite(notionalUsd) || notionalUsd <= 0 || !Number.isFinite(output) || output <= 0 || Math.abs(output / expectedOutput - 1) > 0.03) throw new Error("可执行报价与独立池参考价偏差超过 3%，已阻止交易");
  const expiresAt = Date.now() + 60_000;
  const minimumRaw = route.output * BigInt(10_000 - input.slippageBps) / 10_000n;
  const calldata = encodeFunctionData({ abi: routerAbi, functionName: "swapExactTokensForTokens", args: [amountIn, minimumRaw, route.path, identity.address, BigInt(Math.floor(expiresAt / 1000))] });
  const allowance = await stmBscClient.readContract({ address: fromToken, abi: erc20Abi, functionName: "allowance", args: [identity.address, STM_BSC_ROUTER] });
  const quote: StmQuote = {
    quoteId: input.requestId, status: "QUOTED", walletAddress: identity.address, tokenAddress: token, payToken: input.payToken, side: input.side,
    amount: input.amount, inputRaw: amountIn.toString(), inputDecimals: from.decimals, outputDecimals: to.decimals,
    fromToken, toToken, quotedOutput: formatUnits(route.output, to.decimals), minimumOutput: formatUnits(minimumRaw, to.decimals),
    symbol: risk.symbol ?? token, notionalUsd, slippageBps: input.slippageBps, stopLossPct: input.stopLossPct, takeProfitPct: input.takeProfitPct,
    entryPriceUsd: risk.priceUsd, expiresAt, createdAt: Date.now(), requestDigest: digest, policyFingerprint: walletPolicyFingerprint(config),
    transaction: { to: STM_BSC_ROUTER, data: calldata, value: "0", gas: null },
    approval: allowance >= amountIn ? null : { token: fromToken, spender: STM_BSC_ROUTER, amount: amountIn.toString() },
    risk, txHash: null, protectionMode: "manual-wallet-exit"
  };
  const savedQuote = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`stm-wallet:${userId}`}))::text`;
    const rows = await tx.stmHuntRecord.findMany({ where: { userId, kind: "trade-quote" } });
    const prior = rows.map(row => row.payload as unknown as StmQuote);
    const duplicate = prior.find(row => row.quoteId === quote.quoteId);
    if (duplicate) {
      if (duplicate.requestDigest !== digest) throw new Error("请求编号冲突");
      return duplicate;
    }
    if (prior.some(row => row.status === "SUBMITTED" || row.status === "MISMATCH" || (row.status === "QUOTED" && row.expiresAt > Date.now()))) throw new Error("有待签署或待对账订单，请先确认原订单；不要重复广播");
    if (input.side === "buy") {
      if (rowsFingerprint(rows) !== rowsFingerprint(portfolioRows)) throw new Error("账户交易记录在核验期间发生变化，请刷新报价；无需重复广播");
      // Stablecoin balances and this token form a conservative equity floor.
      // Other tokens are not assigned an invented USD value.
      const equityUsd = Number(usdt.exact) + Number(usdc.exact) + exposure.exposureUsd;
      const day = new Date().toISOString().slice(0, 10);
      const dailyReservedUsd = prior.filter(row => row.side === "buy" && new Date(row.createdAt).toISOString().startsWith(day) && (row.status === "SUBMITTED" || row.status === "CONFIRMED" || row.status === "MISMATCH" || (row.status === "QUOTED" && row.expiresAt > Date.now()))).reduce((sum, row) => sum + row.notionalUsd, 0);
      const pnl = tradingPolicy.trackedDailyPnl(prior.filter(row => row.walletAddress.toLowerCase() === identity.address.toLowerCase()), day);
      if (pnl.unknownCostBasis) throw new Error("今日 STM 卖出缺少可核验的成本批次，禁止以零亏损假设继续开仓；需人工对账");
      const baselineKey = `${identity.address.toLowerCase()}:${day}`;
      const baselineRow = await tx.stmHuntRecord.findUnique({ where: { userId_kind_key: { userId, kind: "trade-bsc-baseline", key: baselineKey } } });
      const baseline = baselineRow?.payload as { equityUsd?: number } | undefined;
      if (baselineRow && (!(typeof baseline?.equityUsd === "number") || !Number.isFinite(baseline.equityUsd) || baseline.equityUsd <= 0)) throw new Error("已保存的钱包日内风险基准无效，不能重置以忽略亏损");
      if (!baselineRow) await tx.stmHuntRecord.create({ data: { userId, kind: "trade-bsc-baseline", key: baselineKey, payload: { equityUsd, day, scope: "STM_TRACKED_WALLET", observedAt: new Date().toISOString() } } });
      const startEquity = Math.min(baseline?.equityUsd ?? equityUsd, equityUsd);
      if (pnl.realizedUsd <= -startEquity * config.dailyLossLimitPct / 100) throw new Error("STM 已结算 FIFO 亏损达到当日止损额度（Gas 费用另计）");
      if (exposure.openPositions + (asset.balance === 0n ? 1 : 0) > config.maxOpenPositions) throw new Error("超过钱包已跟踪持仓数量上限");
      const budget = tradingPolicy.evaluateBuyBudget({ notionalUsd, equityUsd, stopLossPct: input.stopLossPct, liquidityUsd: risk.liquidityUsd!, existingExposureUsd: exposure.exposureUsd, dailyReservedUsd }, config);
      if (!budget.passed) throw new Error(budget.reasons.join("；"));
    } else if (notionalUsd > Math.min(2_000, config.perOrderNotionalLimit)) throw new Error("卖出名义金额超过单笔限额，请分批退出");
    await tx.stmHuntRecord.create({ data: { userId, kind: "trade-quote", key: quote.quoteId, payload: json(quote) } });
    return quote;
  }, { maxWait: 5_000, timeout: 15_000 });
  await journal(userId, `quote:${quote.quoteId}`, { action: "quote", quoteId: quote.quoteId, symbol: quote.symbol, side: quote.side, notionalUsd, message: "已创建限时链上报价，尚未广播。止盈止损仅为人工退出参考价。" });
  return { ok: true, chainId: 56, ...savedQuote, warning: "批准精确额度后，需再次校验报价并由钱包确认交易。止盈止损为人工执行；链上回执匹配并达到 3 次确认后才结算。" };
}

async function validateBscQuote(raw: Record<string, unknown>, userId: string) {
  const input = z.object({ quoteId: quoteIdSchema, address: addressSchema }).parse(raw);
  const config = await liveWalletGate(userId);
  const { quote } = await getQuote(userId, input.quoteId);
  const identity = await bindQuoteWallet(quote, input.address, userId);
  const permission = tradingPolicy.signingQuotePermission(quote, Date.now(), walletPolicyFingerprint(config));
  if (!permission.passed) throw new Error(permission.reason);
  const risk = await assessStmTokenRisk({ chain: "bsc", address: quote.tokenAddress }, { maxAgeMs: 5_000 });
  if (!risk.eligible) throw new Error("签署前风险复查未通过，已停止新交易");
  await recheckBscBuyBudget(quote, userId, config, risk);
  await stmBscClient.call({ account: identity.address, to: getAddress(quote.transaction.to), data: quote.transaction.data as `0x${string}`, value: 0n });
  const gas = await stmBscClient.estimateGas({ account: identity.address, to: getAddress(quote.transaction.to), data: quote.transaction.data as `0x${string}`, value: 0n });
  const [balance, gasPrice] = await Promise.all([stmBscClient.getBalance({ address: identity.address }), stmBscClient.getGasPrice()]);
  const gasLimit = gas * 12n / 10n;
  if (balance < gasLimit * gasPrice) throw new Error("钱包不足以支付实时 Gas 费用");
  if (quote.expiresAt <= Date.now() + 5_000) throw new Error("核验期间报价已接近过期，请重新报价");
  return { ok: true, quoteId: quote.quoteId, expiresAt: quote.expiresAt, chainId: 56, transaction: { ...quote.transaction, gas: gasLimit.toString() }, risk };
}

async function submitBscQuote(raw: Record<string, unknown>, userId: string) {
  const input = z.object({ quoteId: quoteIdSchema, address: addressSchema, txHash: hashSchema, confirmation: z.literal("CONFIRM_STM_BSC_TRADE") }).parse(raw);
  const { quote } = await getQuote(userId, input.quoteId);
  await bindQuoteWallet(quote, input.address, userId);
  // Registration records an already signed transaction, so it remains possible
  // after a kill switch or quote expiry. It never grants permission to sign.
  const hash = input.txHash.toLowerCase();
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`stm-wallet:${userId}`}))::text`;
    const row = await tx.stmHuntRecord.findUniqueOrThrow({ where: { userId_kind_key: { userId, kind: "trade-quote", key: input.quoteId } } });
    const current = row.payload as unknown as StmQuote;
    const decision = tradingPolicy.registrationDecision(current, hash);
    if (decision === "conflict") throw new Error("该报价已绑定其他交易或已结束，不能替换交易哈希");
    if (decision === "idempotent") return { status: current.status, idempotent: true };
    const reuse = await tx.stmHuntRecord.findUnique({ where: { userId_kind_key: { userId, kind: "trade-hash", key: hash } } });
    if (reuse && (reuse.payload as Record<string, unknown>).quoteId !== input.quoteId) throw new Error("该交易哈希已关联其他报价");
    await tx.stmHuntRecord.upsert({ where: { userId_kind_key: { userId, kind: "trade-hash", key: hash } }, create: { userId, kind: "trade-hash", key: hash, payload: { quoteId: input.quoteId } }, update: {} });
    await tx.stmHuntRecord.update({ where: { id: row.id }, data: { payload: json({ ...current, txHash: hash, status: "SUBMITTED" }) } });
    return { status: "SUBMITTED", idempotent: false };
  });
  await journal(userId, `submit:${input.quoteId}`, { action: "submit", quoteId: input.quoteId, txHash: hash, message: "已登记钱包交易，等待独立验证交易内容与链上确认。" });
  return { ok: true, ...result, quoteId: input.quoteId, txHash: hash, successful: false, final: false };
}

async function reconcileBscQuote(raw: Record<string, unknown>, userId: string) {
  const input = z.object({ quoteId: quoteIdSchema, address: addressSchema }).parse(raw);
  const { row, quote } = await getQuote(userId, input.quoteId);
  const identity = await bindQuoteWallet(quote, input.address, userId);
  if (!quote.txHash) throw new Error("该报价尚未登记广播交易哈希");
  const hash = quote.txHash as `0x${string}`;
  const [transaction, receipt] = await Promise.allSettled([stmBscClient.getTransaction({ hash }), stmBscClient.getTransactionReceipt({ hash })]);
  if (transaction.status !== "fulfilled" || receipt.status !== "fulfilled") return { ok: true, status: "PENDING", final: false, successful: false, quoteId: quote.quoteId, txHash: hash, retryAfterMs: 3_000 };
  let status: StmQuote["status"] = quote.status;
  let detail: Record<string, unknown> = {};
  if (!tradingPolicy.transactionMatchesQuote(quote, transaction.value)) {
    status = "MISMATCH"; detail = { reason: "TRANSACTION_CONTENT_MISMATCH", message: "发起人、路由、金额或 calldata 与原报价不符。未计入成交，请人工核对。" };
  } else if (receipt.value.status !== "success") {
    status = "REVERTED"; detail = { reason: "BSC_TRANSACTION_REVERTED" };
  } else {
    const head = await stmBscClient.getBlockNumber({ cacheTime: 0 });
    const confirmations = head - receipt.value.blockNumber + 1n;
    if (confirmations < 3n) return { ok: true, status: "CONFIRMING", final: false, successful: false, confirmations: Number(confirmations), requiredConfirmations: 3, quoteId: quote.quoteId, txHash: hash, retryAfterMs: 3_000 };
    let received = 0n;
    let spent = 0n;
    for (const log of receipt.value.logs) {
      if (![quote.fromToken.toLowerCase(), quote.toToken.toLowerCase()].includes(log.address.toLowerCase())) continue;
      try {
        const transfer = decodeEventLog({ abi: erc20Abi, eventName: "Transfer", data: log.data, topics: log.topics });
        if (log.address.toLowerCase() === quote.toToken.toLowerCase() && transfer.args.to.toLowerCase() === identity.address.toLowerCase()) received += transfer.args.value;
        if (log.address.toLowerCase() === quote.fromToken.toLowerCase() && transfer.args.from.toLowerCase() === identity.address.toLowerCase()) spent += transfer.args.value;
      } catch { /* Other events are not transfer evidence. */ }
    }
    if (spent !== BigInt(quote.inputRaw) || received < parseUnits(quote.minimumOutput, quote.outputDecimals)) {
      status = "MISMATCH"; detail = { reason: "TRANSFER_EVIDENCE_MISMATCH", message: "交易成功，但到账证据与报价不符，已转人工对账。" };
    } else {
      status = "CONFIRMED";
      detail = { actualInput: formatUnits(spent, quote.inputDecimals), actualOutput: formatUnits(received, quote.outputDecimals), completedAt: new Date().toISOString(), blockNumber: receipt.value.blockNumber.toString(), gasFeeBnb: formatUnits(receipt.value.gasUsed * receipt.value.effectiveGasPrice, 18) };
    }
  }
  await prisma.stmHuntRecord.update({ where: { id: row.id }, data: { payload: json({ ...quote, ...detail, status }) } });
  await journal(userId, `settlement:${quote.quoteId}`, { action: "reconcile", quoteId: quote.quoteId, symbol: quote.symbol, side: quote.side, status, txHash: hash, ...detail, message: status === "CONFIRMED" ? "交易内容、实际转账与三次链上确认已验证。" : detail.message ?? "交易未成交。" });
  return { ok: status !== "MISMATCH", status, final: true, successful: status === "CONFIRMED", quoteId: quote.quoteId, txHash: hash, ...detail };
}

export async function handleStmTradeAction(raw: Record<string, unknown>) {
  const viewer = await requireAlphaOperator();
  const action = z.string().parse(raw.action);
  if (action === "quote") return createBscQuote(raw, viewer.id);
  if (action === "validate-quote") return validateBscQuote(raw, viewer.id);
  if (action === "submit") return submitBscQuote(raw, viewer.id);
  if (action === "reconcile" && raw.venue === "bsc") return reconcileBscQuote(raw, viewer.id);
  if (action === "intent") {
    const input = cexIntent.parse(raw);
    if (input.mode === "live") await requireAlphaOperator({ live: true });
    if (input.market === "spot" && input.side === "SHORT") throw new Error("现货不支持无持仓开空，请选择合约市场");
    if (input.mode === "live" && input.market === "spot") throw new Error("STM 现货实盘开仓缺少完整历史成本与划转核验，暂仅开放现货模拟；USDT 合约实盘有完整的账户日亏损校验。");
    if (input.strategy === "S4" || input.strategy === "S5") throw new Error("S4 与 S5 是减仓或风险过滤策略，不生成新开仓意图");
    if (input.mode === "live") await assertStmCexSignal(viewer.id, { symbol: input.symbol, strategy: input.strategy, side: input.side });
    const config = await getOrCreateAlphaExecutionConfig(viewer.id);
    if (input.mode === "live" && (!config.liveEnabled || !config.liveUnlockedAt)) throw new Error("生产实盘尚未独立解锁");
    await prisma.alphaExecutionConfig.update({ where: { userId: viewer.id }, data: { activeMode: modeFrom(input.mode), defaultMarket: marketFrom(input.market) } });
    const dailyRisk = input.mode === "live" ? await assertStmCexDailyRisk(viewer.id, { market: input.market }) : null;
    const result = await approveTradeIntent({ ...input, source: `stm-hunt:${input.strategy}`, orderType: "MARKET" }, viewer.id, viewer.twoFactorPassed);
    if (dailyRisk && result.ok && result.executionPlan?.planId) {
      const quantity = Number(result.executionPlan.mainOrder?.quantity);
      const price = Number(result.intent.entryPrice);
      const proposed = tradingPolicy.evaluateCexAccountRisk(dailyRisk.account, dailyRisk.policy, { symbol: input.symbol, notional: quantity * price, stopRisk: quantity * Math.abs(price - input.stopLoss), leverage: input.leverage });
      if (!proposed.passed) {
        await cancelExecutionPlan(result.executionPlan.planId, viewer.id);
        throw new Error(proposed.reasons.join("；"));
      }
    }
    if (result.executionPlan?.planId) await journal(viewer.id, `cex:${result.executionPlan.planId}`, { action: "intent", strategy: input.strategy, symbol: input.symbol, mode: input.mode, planId: result.executionPlan.planId, message: "风险审批已完成，等待用户确认执行。" });
    return { ...redactSecretData(result), planId: result.executionPlan?.planId ?? null, dailyRisk: dailyRisk ? { dailyPnl: dailyRisk.dailyPnl, dayStartEquity: dailyRisk.dayStartEquity, equity: dailyRisk.equity, observedAt: dailyRisk.observedAt, scope: dailyRisk.scope } : null };
  }
  if (action === "execute" || action === "cancel") {
    const input = z.object({ planId: z.string().min(4).max(80), confirmation: action === "execute" ? z.literal("EXECUTE_APPROVED_PLAN") : z.string().optional() }).parse(raw);
    const plan = await prisma.alphaExecutionPlan.findFirst({ where: { id: input.planId, userId: viewer.id, intent: { source: { startsWith: "stm-hunt:" } } }, select: { environment: true } });
    if (!plan) throw new Error("STM 执行计划不存在或不属于当前用户");
    if (plan.environment === AlphaExecutionMode.LIVE) await requireAlphaOperator({ live: true });
    return action === "execute" ? executePlan(input.planId, viewer.id) : cancelExecutionPlan(input.planId, viewer.id);
  }
  if (action === "preflight") {
    await requireAlphaOperator({ live: true });
    const input = z.object({ market: z.enum(["spot", "futures"]) }).parse(raw);
    return { ok: true, result: await preflightCredential(viewer.id, AlphaExecutionMode.LIVE, marketFrom(input.market)) };
  }
  if (action === "reconcile") return { ok: true, result: await reconcileExecution(viewer.id) };
  if (action === "kill-switch") {
    const input = z.object({ active: z.boolean() }).parse(raw);
    if (!input.active) await requireAlphaOperator({ live: true });
    return input.active ? triggerKillSwitch(viewer.id) : releaseKillSwitch(viewer.id);
  }
  if (action === "close-position" || action === "protection") {
    const input = z.object({ positionId: z.string().min(4).max(80), confirmation: z.literal("CONFIRM_STM_POSITION_ACTION"), stopLoss: z.number().positive().optional(), takeProfit: z.number().positive().optional() }).parse(raw);
    const position = await prisma.alphaTradingPosition.findFirst({ where: { id: input.positionId, userId: viewer.id, plan: { intent: { source: { startsWith: "stm-hunt:" } } } }, select: { environment: true } });
    if (!position) throw new Error("STM 仓位不存在");
    if (position.environment === "LIVE") await requireAlphaOperator({ live: true });
    if (action === "close-position") return closeLivePosition(input.positionId, viewer.id);
    if (!input.stopLoss || !input.takeProfit) throw new Error("需要有效止盈止损价格");
    return replaceLivePositionProtection(input.positionId, viewer.id, input.stopLoss, input.takeProfit);
  }
  throw new Error("不支持的 STM 交易动作");
}
