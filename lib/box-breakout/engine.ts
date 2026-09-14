import type { Bar, Box, Candidate, Condition, Control, Flow, Market, Volume } from "./types";

/** Public strategy parameters, independently implemented for the native dashboard. */
export const BOX_RULES = Object.freeze({ lookback: 60, breakoutLookback: 40, recentBreakouts: 15, volumeLookback: 5, volumeMultiple: 1.8, volumeDays: 3, qualified: 85 });

export function computeVolume(bars: Bar[]): Volume {
  const ratios = bars.map((bar, index) => {
    if (index < 5) return 0;
    const average = bars.slice(index - 5, index).reduce((sum, previous) => sum + previous.volume, 0) / 5;
    return average > 0 ? Math.round(bar.volume / average * 1000) / 1000 : 0;
  });
  let days = 0;
  let streak = 0;
  for (const ratio of ratios.slice(-10)) {
    streak = ratio >= BOX_RULES.volumeMultiple ? streak + 1 : 0;
    days = Math.max(days, streak);
  }
  return { days, ratio: ratios.at(-1) ?? 0, ratios };
}

export function computeBox(bars: Bar[]): Box | null {
  if (bars.length < 40) return null;
  let endIndex = bars.length;
  for (let index = Math.max(40, bars.length - 15); index < bars.length; index++) {
    const precedingHigh = Math.max(...bars.slice(index - 40, index).map(bar => bar.high));
    if (bars[index].close > precedingHigh * 1.005) { endIndex = index; break; }
  }
  const window = bars.slice(Math.max(0, endIndex - BOX_RULES.lookback), endIndex);
  const high = Math.max(...window.map(bar => bar.high));
  const low = Math.min(...window.map(bar => bar.low));
  if (!Number.isFinite(high) || low <= 0 || high <= low) return null;
  const averageVolume = window.reduce((sum, bar) => sum + bar.volume, 0) / window.length || 1;
  const probes = window.filter(bar => {
    const wick = bar.high - Math.max(bar.open, bar.close);
    return bar.high > bar.low && bar.high >= high * .985 && bar.close <= high * 1.005 &&
      bar.volume >= averageVolume * .7 && wick > 0 &&
      (wick / (bar.high - bar.low) >= .3 || bar.high >= high * .995);
  });
  return {
    low, high, tests: probes.length, testDates: probes.slice(-8).map(bar => bar.date),
    positionPct: Math.round(Math.min(100, Math.max(0, (bars.at(-1)!.close - low) / (high - low) * 100)) * 10) / 10,
    spanPct: Math.round((high - low) / low * 1000) / 10,
    startDate: window[0].date, endDate: window.at(-1)!.date, endIndex,
  };
}

export function computeFlow(values: { date: string; net: number }[]): Flow {
  const sample = values.slice(-5);
  if (!sample.length) return { net5d: null, positiveDays: 0, state: "无数据" };
  const net5d = sample.reduce((sum, item) => sum + item.net, 0);
  const positiveDays = sample.filter(item => item.net > 0).length;
  return { net5d, positiveDays, state: net5d > 0 ? (positiveDays >= 3 ? "流入" : "偏流入") : "流出" };
}

export function computeControl(turnover: number | undefined, holder: { ratio: number; date: string } | null): Control | null {
  // Missing disclosure is unknown, never fabricated as a medium-control signal.
  if (!holder) return null;
  let level: Control["level"] = holder.ratio <= -2 ? "高" : holder.ratio <= .5 ? "中" : "低";
  let note = `股东户数环比 ${holder.ratio > 0 ? "+" : ""}${holder.ratio.toFixed(1)}%（披露滞后代理）`;
  if (level === "高" && turnover !== undefined && turnover >= 15) {
    level = "中";
    note += `；换手率 ${turnover.toFixed(1)}% 偏高，降一级`;
  }
  return { level, holderChangePct: holder.ratio, date: holder.date, note };
}

export function matchThemes(concepts: string[], names: string[]): string[] {
  return concepts.filter(concept => names.some(name => concept === name ||
    (name.length > 2 && concept.includes(name)) || (concept.length > 2 && name.includes(concept))));
}

export function scoreConditions(input: {
  market: Market; volume: Volume; box: Box | null; changePct: number;
  themeMatched: boolean; flow: Flow | null; control: Control | null;
}): Pick<Candidate, "score" | "conditions" | "qualified" | "status"> {
  const { market, volume, box, changePct, themeMatched, flow, control } = input;
  const conditions: Condition[] = [];
  const crypto = market === "crypto";
  const fullVolume = volume.days >= 3 && volume.ratio >= 1.8;
  const partialVolume = volume.days >= 2 || volume.ratio >= 1.5;
  if (!crypto) conditions.push({ key: "theme", label: "热点题材", points: themeMatched ? 25 : 0, maximum: 25, passed: themeMatched, detail: themeMatched ? "匹配热门或关注板块" : "未匹配热点，或概念数据不可用" });
  conditions.push({ key: "volume", label: "倍量启动", points: fullVolume ? (crypto ? 34 : 25) : partialVolume ? (crypto ? 17 : 12) : 0, maximum: crypto ? 34 : 25, passed: fullVolume, detail: `近 10 日最长连续 ${volume.days} 日，当前 ${volume.ratio.toFixed(2)}×；要求 ≥3 日且 ≥1.8×` });
  if (!crypto) {
    const inflow = flow?.state === "流入";
    const strong = inflow && control?.level === "高";
    conditions.push({ key: "flow", label: "资金与控盘", points: strong ? 25 : inflow ? 15 : 0, maximum: 25, passed: strong, detail: `${flow?.state ?? "无数据"} · ${control ? `${control.level}控盘` : "股东户数不可用"}` });
  }
  const probes = box?.tests ?? 0;
  conditions.push({ key: "tests", label: "上沿试盘", points: probes >= 3 ? (crypto ? 33 : 25) : probes >= 2 ? (crypto ? 16 : 10) : 0, maximum: crypto ? 33 : 25, passed: probes >= 3, detail: box ? `${probes} 次符合触顶、量能和上影条件；要求 ≥3 次` : "有效日 K 不足，或无法形成箱体" });
  if (crypto) conditions.push({ key: "momentum", label: "24h 涨幅强度", points: changePct >= 10 ? 33 : changePct >= 5 ? 16 : 0, maximum: 33, passed: changePct >= 10, detail: `${changePct > 0 ? "+" : ""}${changePct.toFixed(2)}%；≥10% 满分，≥5% 半分` });
  const score = conditions.reduce((sum, condition) => sum + condition.points, 0);
  return { score, conditions, qualified: score >= 85, status: score >= 85 ? "达标关注" : score >= 70 ? "突破观察" : score >= 50 ? "观察" : "箱内 / 排除" };
}
