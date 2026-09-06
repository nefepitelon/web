import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { TideSightQuantSurface } from "@/components/tidesight-quant-surface";
import { getViewer } from "@/lib/membership";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "观潮量化 TideSight Quant",
  description: "WELINKBTC 低频趋势与市场中性量化交易控制平面：统一信号、组合分配、风控、执行与审计。",
  openGraph: {
    title: "观潮量化 TideSight Quant",
    description: "观市场之势，行系统之策。低频趋势与市场中性量化交易控制平面。",
  },
};

export default async function TideSightQuantPage() {
  const viewer = await getViewer();
  const canOperate = Boolean(viewer && (viewer.role === "admin" || viewer.plan === "max") && !viewer.needsSecondFactor);
  const canUnlockLive = Boolean(viewer?.role === "admin" && viewer.twoFactorEnabled && viewer.twoFactorPassed);

  return (
    <AppShell viewer={viewer}>
      <TideSightQuantSurface
        signedIn={Boolean(viewer)}
        canOperate={canOperate}
        canUnlockLive={canUnlockLive}
        operatorLabel={viewer?.username ?? viewer?.displayName ?? viewer?.email.split("@")[0] ?? null}
      />
    </AppShell>
  );
}
