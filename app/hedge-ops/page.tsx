import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { FeatureAccessBoundary } from "@/components/feature-access-boundary";
import { HedgeOpsSurface } from "@/components/hedge-ops-surface";
import { getViewer } from "@/lib/membership";
import "./hedge-ops.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "套利对冲Ops",
  description: "套利对冲工作台，集成 Arcus × RHC Lighter、Entropy × Arcus、Binance × Lighter Core，支持行情监控、策略执行和交易记录。",
};

export default async function HedgeOpsPage() {
  const viewer = await getViewer();
  return (
    <AppShell viewer={viewer}>
      <FeatureAccessBoundary
        viewer={viewer}
        entitlement="grid.ops"
        title="套利对冲Ops"
        description="Max 与管理员可进入完整套利对冲工作台，选择八套交易所组合查看行情、配置策略和管理运行任务。"
        returnTo="/hedge-ops"
      >
        <HedgeOpsSurface storageScope={viewer?.id || "guest"} />
      </FeatureAccessBoundary>
    </AppShell>
  );
}
