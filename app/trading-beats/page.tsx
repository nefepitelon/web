import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { TradingBeatsSurface } from "@/components/trading-beats-surface";
import { getViewer } from "@/lib/membership";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "TradingBeats交易阻击台",
  description: "在 welinkBTC 系统内使用 TradingBeats 链上永续合约、地址追踪与钱包分析工具。",
};

export default async function TradingBeatsPage() {
  const viewer = await getViewer();

  return (
    <AppShell viewer={viewer}>
      <TradingBeatsSurface />
    </AppShell>
  );
}
