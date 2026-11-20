import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { FeatureAccessBoundary } from "@/components/feature-access-boundary";
import { StmHuntSurface } from "@/components/stm-hunt-surface";
import { getViewer } from "@/lib/membership";
import "./stm-hunt.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "STM hunt · Smart Money Terminal",
  description: "聪明钱研究与交易终端：六大交易员数据源、S1–S5 策略、证据验证、模拟复盘与受控实盘执行。",
};

export default async function StmHuntPage() {
  const viewer = await getViewer();
  return (
    <AppShell viewer={viewer}>
      <FeatureAccessBoundary viewer={viewer} entitlement="grid.ops" title="STM hunt" description="追踪聪明钱，验证每一条证据。在同一工作台完成扫链、S1–S5 策略研究、模拟复盘与受控交易。Max 与管理员可使用完整工作台。" returnTo="/stm-hunt">
        <StmHuntSurface />
      </FeatureAccessBoundary>
    </AppShell>
  );
}
