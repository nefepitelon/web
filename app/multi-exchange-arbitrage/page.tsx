import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { MultiExchangeArbitrageSurface } from "@/components/multi-exchange-arbitrage-surface";
import { getViewer } from "@/lib/membership";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "多交易所套利助手",
  description: "在 welinkBTC 系统内查看 PerpDEXList 的多交易所资金费率与价差套利数据。"
};

export default async function MultiExchangeArbitragePage() {
  const viewer = await getViewer();

  return (
    <AppShell viewer={viewer}>
      <MultiExchangeArbitrageSurface />
    </AppShell>
  );
}
