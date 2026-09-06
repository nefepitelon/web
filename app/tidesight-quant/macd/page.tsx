import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { TideSightQuantSurface } from "@/components/tidesight-quant-surface";
import { getViewer } from "@/lib/membership";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "MACD 多周期监控信号 | 观潮量化 TideSight Quant",
  description: "BTC、ETH、BNB、SOL、ZEC、TAO、ENA、ONDO、UNI、XRP、SUI、HYPE 共 12 个标的、6 个周期的闭合 K 线 MACD 实时图表和交叉信号。",
};

export default async function TideSightMacdPage() {
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
        initialTab="macd"
      />
    </AppShell>
  );
}
