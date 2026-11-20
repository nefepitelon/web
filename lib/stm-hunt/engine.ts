import type { StmCandidate, StmChainEvent, StmHistorySnapshot, StmHistoryTrader, StmMarketEvidence, StmSignal, StmStrategy, StmTradeEvent } from "./types";

export const STM_STRATEGIES: StmStrategy[] = [
  { id: "S1", name: "趋势共振", description: "Alpha 候选 + 已收盘突破 + 独立交易员真实开/加多", version: 1, enabled: true, minEntities: 3, windowMinutes: 60, minVolumeRatio: 1.5, minLiquidityUsd: 100000 },
  { id: "S2", name: "持续吸筹", description: "固定实体连续三次完整数量快照；现货须有买入 Swap 佐证", version: 1, enabled: true, minEntities: 3, windowMinutes: 360, minVolumeRatio: 1.5, minLiquidityUsd: 100000 },
  { id: "S3", name: "链上先锋", description: "十分钟内独立优质钱包实买、保有、审计与可退出路由", version: 1, enabled: true, minEntities: 3, windowMinutes: 10, minVolumeRatio: 1.5, minLiquidityUsd: 100000 },
  { id: "S4", name: "分歧撤退", description: "价格上涨但原始持有群体连续减仓；提示退出而非开空", version: 1, enabled: true, minEntities: 3, windowMinutes: 360, minVolumeRatio: 1.5, minLiquidityUsd: 100000 },
  { id: "S5", name: "拥挤过滤", description: "自身历史资金费率 95 分位 + OI 数量增加 + 价格上涨", version: 1, enabled: true, minEntities: 3, windowMinutes: 60, minVolumeRatio: 1.5, minLiquidityUsd: 100000 },
];

export interface StmEngineInput {
  asOf: string; candidates: StmCandidate[]; snapshots: StmHistorySnapshot[];
  events: StmTradeEvent[]; chainEvents: StmChainEvent[]; markets: StmMarketEvidence[];
  strategies?: StmStrategy[];
}
const time = (value: string | null | undefined) => value ? Date.parse(value) : NaN;
const fresh = (value: string | null | undefined, now: number, minutes: number) => Number.isFinite(time(value)) && time(value) <= now && now - time(value) <= minutes * 60_000;
const entity = (id: string, address?: string | null) => {
  const value=address ?? id; const evm=value.match(/(?:^|:)(0x[0-9a-fA-F]{40})$/);
  return evm ? evm[1].toLowerCase() : value;
};
const unique = (events: StmTradeEvent[]) => new Set(events.map(event => event.clusterId || entity(event.traderId))).size;

export function evaluateStmStrategies(input: StmEngineInput): StmSignal[] {
  const now = time(input.asOf);
  if (!Number.isFinite(now)) throw new Error("Invalid evaluation timestamp");
  const strategies = input.strategies ?? STM_STRATEGIES;
  const output: StmSignal[] = [];
  const histories=new Map<number,{count:number;original:StmHistoryTrader[];series:Map<string,StmHistoryTrader[]>}>();
  for(const strategy of strategies.filter(row=>["S2","S4"].includes(row.id))) {
    if(histories.has(strategy.windowMinutes))continue;
    const snapshots=input.snapshots.filter(row=>fresh(row.asOf,now,strategy.windowMinutes)).sort((a,b)=>time(a.asOf)-time(b.asOf));
    const grouped=new Map<string,Map<string,StmHistoryTrader>>();
    for(const snapshot of snapshots)for(const trader of snapshot.traders) {
      if(!trader.updatedAt)continue;
      if(!grouped.has(trader.id))grouped.set(trader.id,new Map());
      grouped.get(trader.id)!.set(trader.updatedAt,trader);
    }
    histories.set(strategy.windowMinutes,{count:snapshots.length,original:snapshots[0]?.traders??[],series:new Map([...grouped].map(([id,values])=>[id,[...values.values()].sort((a,b)=>time(a.updatedAt)-time(b.updatedAt)).slice(-3)]))});
  }
  for (const candidate of input.candidates) {
    const market = input.markets.find(row => row.symbol === candidate.symbol && row.complete && fresh(row.asOf, now, 20));
    for (const strategy of strategies) {
      if (!strategy.enabled) continue;
      const signal: StmSignal = { id: `${strategy.id}:${strategy.version}:${candidate.id}:${Math.floor(now / 300000)}`,
        strategy: strategy.id, strategyVersion: strategy.version, candidateId: candidate.id, symbol: candidate.symbol,
        status: "watch", direction: strategy.id === "S4" ? "exit" : strategy.id === "S5" ? "observe" : "long",
        score: 0, entities: 0, reasons: [], missing: [], asOf: input.asOf,
        expiresAt: new Date(now + Math.min(strategy.windowMinutes, 120) * 60_000).toISOString(), actionable: false };
      const scoped = input.events.filter(event => event.asset === candidate.id && event.exact && event.qualified
        && fresh(event.occurredAt, now, strategy.windowMinutes));
      const onchain = input.chainEvents.filter(event => event.asset === candidate.id && event.verified && event.exact && event.qualified
        && fresh(event.occurredAt, now, Math.min(10, strategy.windowMinutes)));
      if (strategy.id === "S1") {
        if (candidate.market !== "cex") continue;
        if (!fresh(candidate.updatedAt, now, 120)) signal.missing.push("Alpha 候选超过两小时或缺少可靠时间");
        if (!market) signal.missing.push("缺少新鲜连续已收盘行情");
        else {
          if (!market.breakout) signal.missing.push("15 分钟收盘未突破此前 20 根高点");
          if (market.volumeRatio < strategy.minVolumeRatio) signal.missing.push(`小时成交量未达到 ${strategy.minVolumeRatio} 倍`);
        }
        signal.entities = unique(scoped.filter(row => row.side === "long" && ["open", "add"].includes(row.action)));
        if (signal.entities < strategy.minEntities) signal.missing.push(`真实开/加多实体 ${signal.entities}/${strategy.minEntities}，快照共振不计入成交`);
        signal.reasons.push("闭合 K 线确认；平空不计为新多");
      } else if (strategy.id === "S2" || strategy.id === "S4") {
        const history=histories.get(strategy.windowMinutes)!;
        const identities = new Set<string>();
        if (history.count < 3) signal.missing.push("需要三个时间递增的本地完整快照");
        else {
          for (const original of history.original) {
            if (original.visibility !== "public" || !original.qualified) continue;
            const series=history.series.get(original.id)??[];
            if(series.length!==3)continue;
            if (series.some(row => !row || !row.qualified || row.visibility !== "public" || !row.updatedAt || !fresh(row.updatedAt, now, strategy.windowMinutes))) continue;
            if (!(time(series[0]!.updatedAt) < time(series[1]!.updatedAt) && time(series[1]!.updatedAt) < time(series[2]!.updatedAt))) continue;
            const holdings = series.map(row => row!.holdings.find(holding => holding.asset === candidate.id && holding.side !== "short"));
            if (holdings.some(row => !row || row.quantity === null || row.quantity < 0)) continue;
            const quantities = holdings.map(row => row!.quantity!);
            const increasing = quantities[0] < quantities[1] && quantities[1] < quantities[2];
            const decreasing = quantities[0] > quantities[1] && quantities[1] > quantities[2];
            if ((strategy.id === "S2" && !increasing) || (strategy.id === "S4" && !decreasing)) continue;
            if (holdings[0]!.side === "spot") {
              // Balance changes can be transfers. Require actual verified Swap evidence in both intervals.
              const action = strategy.id === "S2" ? "swap-buy" : "swap-sell";
              const valid = [1,2].every(index => input.chainEvents.some(event => event.asset === candidate.id && event.verified && event.exact
                && entity(event.traderId) === entity(original.id, original.address) && event.action === action
                && time(event.occurredAt) > time(series[index-1]!.updatedAt) && time(event.occurredAt) <= time(series[index]!.updatedAt)));
              if (!valid) continue;
            }
            identities.add(original.clusterId || entity(original.id, original.address));
          }
        }
        signal.entities = identities.size;
        if (signal.entities < strategy.minEntities) signal.missing.push(`连续${strategy.id === "S2" ? "增持" : "减持"}实体 ${signal.entities}/${strategy.minEntities}，排除私密、截断、估值变化与转账`);
        if (strategy.id === "S4" && (!market || market.priceChange <= 0)) signal.missing.push("缺少当前价格上涨的确认");
        signal.reasons.push("固定原始持有人群体，不将榜单换人或隐藏仓位视为买卖");
      } else if (strategy.id === "S3") {
        if (candidate.market !== "onchain") continue;
        const buys = onchain.filter(event => event.action === "swap-buy" && event.retained === true && event.riskPassed
          && event.routeAvailable && event.liquidityUsd !== null && event.liquidityUsd >= strategy.minLiquidityUsd && !!event.clusterId);
        signal.entities = unique(buys);
        if (signal.entities < strategy.minEntities) signal.missing.push(`独立且仍持有的已核验买入钱包 ${signal.entities}/${strategy.minEntities}`);
        if (!buys.length) signal.missing.push("需要确认后的 Swap、风险检查、退出报价及流动性；榜单不是实时买单");
        signal.reasons.push(`仅统计最近 ${Math.min(10, strategy.windowMinutes)} 分钟；相同资金集群只计一次`);
      } else {
        if (candidate.market !== "cex") continue;
        if (!market || market.fundingPercentile === null || market.oiQuantityChange === null) signal.missing.push("缺少同币历史资金费率分位或 OI 合约数量，未知不视为正常");
        else if (market.fundingPercentile >= 95 && market.oiQuantityChange > 0 && market.priceChange > 0) {
          signal.status = "risk"; signal.reasons.push(`资金费率处于自身 ${market.fundingPercentile.toFixed(1)} 分位；OI 数量与价格同步上涨`);
        } else signal.reasons.push("当前未同时满足拥挤条件；不是反向开仓信号");
      }
      if (strategy.id !== "S5") {
        if (!signal.missing.length) { signal.status = strategy.id === "S4" ? "risk" : "ready"; signal.actionable = strategy.id !== "S4"; }
        else signal.status = signal.missing.some(reason => /缺少|需要|真实开|Alpha/.test(reason)) ? "blocked" : "watch";
      } else if (signal.missing.length) signal.status = "blocked";
      signal.score = signal.status === "ready" || signal.status === "risk" ? 100 : Math.min(75, signal.entities / strategy.minEntities * 60 + (market ? 15 : 0));
      output.push(signal);
    }
  }
  const veto = new Map(output.filter(row => row.strategy === "S5" && ["risk","blocked"].includes(row.status)).map(row => [row.candidateId,row.status]));
  for (const row of output) if (veto.has(row.candidateId) && ["S1", "S2", "S3"].includes(row.strategy)) {
    row.actionable = false; row.status = "blocked"; row.missing.push(veto.get(row.candidateId)==="risk" ? "S5 拥挤风险过滤已拦截新开仓" : "S5 风险证据未知，暂停新开仓");
  }
  return output;
}
