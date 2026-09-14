import "server-only";
import { createPublicClient, decodeEventLog, erc20Abi, formatUnits, http, type Address, type Hash } from "viem";
import { bsc } from "viem/chains";
import { PAY_TOKEN_ADDRESSES, multiplyDecimals } from "@/lib/bstock-alpha-live";

const chain = createPublicClient({ chain: bsc, transport: http(process.env.BSC_RPC_URL || "https://bsc-dataseed1.binance.org", { timeout: 12_000, retryCount: 1 }) });
export async function readAutoGasCost(input: { txHash: string; walletAddress: string; bnbPriceUsd: number }) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.txHash) || !/^0x[0-9a-fA-F]{40}$/.test(input.walletAddress)
    || !Number.isFinite(input.bnbPriceUsd) || input.bnbPriceUsd <= 0) throw new Error("Gas 结算参数无效");
  const receipt = await chain.getTransactionReceipt({ hash: input.txHash as Hash });
  const block = await chain.getBlockNumber();
  if (block < receipt.blockNumber + 1n) throw new Error("等待第二个区块确认");
  const gasBnb = receipt.from.toLowerCase() === input.walletAddress.toLowerCase()
    ? formatUnits(receipt.gasUsed * receipt.effectiveGasPrice, 18) : "0";
  return { gasBnb, gasUsd: multiplyDecimals(gasBnb, String(input.bnbPriceUsd)),
    gasValuationPriceUsd: input.bnbPriceUsd, gasValuationSource: "ORDER_WALLET_SNAPSHOT",
    gasUsed: receipt.gasUsed.toString(), gasPriceWei: receipt.effectiveGasPrice.toString(), blockNumber: receipt.blockNumber.toString() };
}

export async function readAutoSettlement(input: { txHash: string; walletAddress: string; contractAddress: string; multiplier: string; side: string; usdtPriceUsd: number; bnbPriceUsd: number }) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.txHash)) throw new Error("订单尚未提供有效链上成交哈希");
  if (!/^0x[0-9a-fA-F]{40}$/.test(input.walletAddress) || !/^0x[0-9a-fA-F]{40}$/.test(input.contractAddress)
    || !["buy", "sell"].includes(input.side) || !Number.isFinite(input.usdtPriceUsd) || input.usdtPriceUsd <= 0
    || !Number.isFinite(input.bnbPriceUsd) || input.bnbPriceUsd <= 0
    || !Number.isFinite(Number(input.multiplier)) || Number(input.multiplier) <= 0) throw new Error("订单资金流结算参数无效");
  const receipt = await chain.getTransactionReceipt({ hash: input.txHash as Hash });
  if (receipt.status !== "success") throw new Error("链上交易失败，不能记为成交");
  const block = await chain.getBlockNumber();
  if (block < receipt.blockNumber + 1n) throw new Error("等待第二个区块确认");
  const addresses = [PAY_TOKEN_ADDRESSES.USDT, input.contractAddress].map(x => x.toLowerCase());
  const net = [0n, 0n];
  for (const log of receipt.logs) {
    const index = addresses.indexOf(log.address.toLowerCase());
    if (index < 0) continue;
    try {
      const event = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics, eventName: "Transfer" });
      if (event.args.to.toLowerCase() === input.walletAddress.toLowerCase()) net[index] += event.args.value;
      if (event.args.from.toLowerCase() === input.walletAddress.toLowerCase()) net[index] -= event.args.value;
    } catch { /* Only ERC-20 Transfer logs are settlement evidence. */ }
  }
  const buy = input.side === "buy";
  if ((buy && (net[0] >= 0n || net[1] <= 0n)) || (!buy && (net[0] <= 0n || net[1] >= 0n))) {
    throw new Error("成交回执的账户、资产或资金流向与自动订单不一致");
  }
  const [usdDecimals, tokenDecimals] = await Promise.all(addresses.map(address =>
    chain.readContract({ address: address as Address, abi: erc20Abi, functionName: "decimals" })));
  const paymentAmount = formatUnits(net[0] < 0n ? -net[0] : net[0], usdDecimals);
  const usd = multiplyDecimals(paymentAmount, String(input.usdtPriceUsd));
  const rawQuantity = formatUnits(net[1] < 0n ? -net[1] : net[1], tokenDecimals);
  const gasBnb = receipt.from.toLowerCase() === input.walletAddress.toLowerCase()
    ? formatUnits(receipt.gasUsed * receipt.effectiveGasPrice, 18) : "0";
  return { usd, paymentAmount, paymentToken: "USDT", paymentValuationPriceUsd: input.usdtPriceUsd,
    rawQuantity, quantity: multiplyDecimals(rawQuantity, input.multiplier),
    gasBnb, gasUsd: multiplyDecimals(gasBnb, String(input.bnbPriceUsd)),
    gasValuationPriceUsd: input.bnbPriceUsd, gasValuationSource: "ORDER_WALLET_SNAPSHOT",
    gasUsed: receipt.gasUsed.toString(), gasPriceWei: receipt.effectiveGasPrice.toString(), blockNumber: receipt.blockNumber.toString() };
}
