import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createPublicClient, decodeEventLog, erc20Abi, formatUnits, http, parseAbi, type Address, type Hash } from "viem";
import { bsc } from "viem/chains";
import type { StmChainEvent } from "./types";

export const STM_PANCAKE_FACTORY = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73" as Address;
const pairAbi = parseAbi([
  "function token0() view returns (address)", "function token1() view returns (address)",
  "function getPair(address,address) view returns (address)",
  "event Swap(address indexed sender,uint256 amount0In,uint256 amount1In,uint256 amount0Out,uint256 amount1Out,address indexed to)",
]);
const routerAbi = parseAbi(["function getAmountsOut(uint256 amountIn,address[] path) view returns (uint256[] amounts)"]);
const ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E" as Address;
const USDT = "0x55d398326f99059fF775485246999027B3197955" as Address;
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" as Address;
export interface StmWalletProfile {
  id: string; chain: string; address: string; label: string; group: string;
  clusterId: string | null; qualified: boolean; reviewedAt: string | null;
}
export interface StmIngestInput { chain: "bsc"; hash: Hash; wallet: Address; token: Address }
export interface StmIngestRisk { passed: boolean; liquidityUsd: number | null; routeAvailable: boolean }

export function validStmSignature(raw: string, timestamp: string | null, signature: string | null, secret: string | undefined, now = Date.now()) {
  if (!secret || secret.length < 32 || !timestamp || !signature || !/^\d{10,13}$/.test(timestamp)) return false;
  const millis = Number(timestamp) * (timestamp.length === 10 ? 1000 : 1);
  if (Math.abs(now - millis) > 300_000 || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

// No caller-supplied RPC URL is accepted. Provider observations must match a
// confirmed transaction, a factory-registered pool and the wallet's net transfer.
export async function verifyStmBscSwap(input: StmIngestInput, profile: StmWalletProfile | null, risk: StmIngestRisk, options: { timeoutMs?: number; retryCount?: number; maxLogs?: number; deadlineMs?: number } = {}): Promise<StmChainEvent> {
  const deadline = Math.min(options.deadlineMs ?? Date.now() + 45_000, Date.now() + 45_000);
  const maxLogs = Math.max(1, Math.min(250, options.maxLogs ?? 250));
  const checkDeadline = () => { if (Date.now() >= deadline) throw new Error("链上核验预算已用尽，请稍后重试"); };
  checkDeadline();
  const client = createPublicClient({ chain: bsc, transport: http(process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org", { timeout: Math.max(500, Math.min(10_000, options.timeoutMs ?? 10_000)), retryCount: Math.max(0, Math.min(1, options.retryCount ?? 1)) }) });
  const receipt = await client.getTransactionReceipt({ hash: input.hash });
  if (receipt.status !== "success" || receipt.from.toLowerCase() !== input.wallet.toLowerCase()) throw new Error("交易未成功或交易发起人与监控钱包不一致");
  const [head, block, decimals, symbol, balance] = await Promise.all([
    client.getBlockNumber({ cacheTime: 0 }), client.getBlock({ blockHash: receipt.blockHash }),
    client.readContract({ address: input.token, abi: erc20Abi, functionName: "decimals" }),
    client.readContract({ address: input.token, abi: erc20Abi, functionName: "symbol" }),
    client.readContract({ address: input.token, abi: erc20Abi, functionName: "balanceOf", args: [input.wallet] }),
  ]);
  if (head - receipt.blockNumber < 3n) throw new Error("交易需至少 3 个后续区块确认后接收");
  if (Number(block.timestamp) * 1000 > Date.now() + 60_000) throw new Error("区块时间超出当前时间，不能作为已知成交");
  if (Date.now() - Number(block.timestamp) * 1000 > 86_400_000) throw new Error("只接收最近 24 小时成交，禁止把历史交易作为新信号");
  let delta = 0n;
  const transfers: Array<{ from: Address; to: Address; value: bigint }> = [];
  for (const log of receipt.logs.slice(0, maxLogs)) {
    checkDeadline();
    if (log.address.toLowerCase() !== input.token.toLowerCase()) continue;
    try {
      const event = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
      if (event.eventName !== "Transfer") continue;
      const a = event.args;
      transfers.push(a);
      if (a.to.toLowerCase() === input.wallet.toLowerCase()) delta += a.value;
      if (a.from.toLowerCase() === input.wallet.toLowerCase()) delta -= a.value;
    } catch { /* Other token logs are not transfers. */ }
  }
  if (delta === 0n) throw new Error("钱包没有该代币的净余额变化");
  let found = false;
  for (const log of receipt.logs.slice(0, maxLogs)) {
    checkDeadline();
    try {
      const event = decodeEventLog({ abi: pairAbi, data: log.data, topics: log.topics });
      if (event.eventName !== "Swap") continue;
      const [token0, token1] = await Promise.all([
        client.readContract({ address: log.address, abi: pairAbi, functionName: "token0" }),
        client.readContract({ address: log.address, abi: pairAbi, functionName: "token1" }),
      ]);
      const index = token0.toLowerCase() === input.token.toLowerCase() ? 0 : token1.toLowerCase() === input.token.toLowerCase() ? 1 : -1;
      if (index < 0) continue;
      const registered = await client.readContract({ address: STM_PANCAKE_FACTORY, abi: pairAbi, functionName: "getPair", args: [token0, token1] });
      if (registered.toLowerCase() !== log.address.toLowerCase()) continue;
      const a = event.args;
      const out = index === 0 ? a.amount0Out : a.amount1Out;
      const incoming = index === 0 ? a.amount0In : a.amount1In;
      const linked = transfers.reduce((sum, transfer) => {
        const matches = delta > 0n
          ? transfer.from.toLowerCase() === log.address.toLowerCase() && transfer.to.toLowerCase() === input.wallet.toLowerCase()
          : transfer.from.toLowerCase() === input.wallet.toLowerCase() && transfer.to.toLowerCase() === log.address.toLowerCase();
        return sum + (matches ? transfer.value : 0n);
      }, 0n);
      // A different transfer and an unrelated pool swap in one batched receipt
      // must not be misclassified as this wallet buying or selling.
      if ((delta > 0n && linked === delta && out === linked) || (delta < 0n && linked === -delta && incoming === linked)) { found = true; break; }
    } catch { /* Non-V2 pool logs are deliberately unsupported. */ }
  }
  if (!found) throw new Error("未找到已注册 PancakeSwap V2 池的同向 Swap 证据；转账不能作为买卖");
  const quantity = Number(formatUnits(delta < 0n ? -delta : delta, decimals));
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("成交数量无效");
  let routeAvailable = false;
  if (risk.passed && delta > 0n) {
    // A concrete exit quote is required in addition to a discovered DEX pair.
    const amount = delta / 100n || 1n;
    const paths: Address[][] = input.token.toLowerCase() === USDT.toLowerCase()
      ? [] : [[input.token, USDT], [input.token, WBNB, USDT]];
    for (const path of paths) {
      checkDeadline();
      try {
        const amounts = await client.readContract({ address: ROUTER, abi: routerAbi, functionName: "getAmountsOut", args: [amount, path] });
        if (amounts.at(-1)! > 0n) { routeAvailable = true; break; }
      } catch { /* No executable route through this path. */ }
    }
  }
  const wallet = input.wallet.toLowerCase();
  const token = input.token.toLowerCase();
  return {
    id: `bsc:${input.hash.toLowerCase()}:${wallet}:${token}`, traderId: `bsc:${wallet}`, asset: `bsc:${token}`,
    chain: "bsc", address: token, symbol: symbol.slice(0, 32), side: "spot", action: delta > 0n ? "swap-buy" : "swap-sell",
    occurredAt: new Date(Number(block.timestamp) * 1000).toISOString(), exact: true, verified: true,
    qualified: Boolean(profile?.qualified && profile.reviewedAt && profile.clusterId && profile.chain === "bsc" && profile.address.toLowerCase() === wallet),
    clusterId: profile?.qualified && profile.chain === "bsc" && profile.address.toLowerCase() === wallet ? profile.clusterId : null, quantity, transactionHash: input.hash,
    retained: delta > 0n && balance >= delta / 2n,
    liquidityUsd: risk.liquidityUsd, riskPassed: risk.passed, routeAvailable,
  };
}
