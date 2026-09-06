import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { TopTraderRadarSurface } from "@/components/top-trader-radar-surface";
import { getViewer } from "@/lib/membership";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "TopTrader策略雷达",
  description: "在 welinkBTC 系统内查看顶级交易员策略、仓位信号与市场雷达。",
};

export default async function TopTraderRadarPage() {
  const viewer = await getViewer();

  return (
    <AppShell viewer={viewer}>
      <TopTraderRadarSurface />
    </AppShell>
  );
}
