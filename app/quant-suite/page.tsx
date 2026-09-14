import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { QuantSuiteSurface } from "@/components/quant-suite-surface";
import { getViewer } from "@/lib/membership";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "量化交易集 · Quant Trading Suite",
  description: "WELINKBTC 量化交易工作台：统一管理 Freqtrade、NautilusTrader、Hummingbot、LEAN、Jesse 与 OctoBot 的配置、研究、运行与审计。",
};

export default async function QuantSuitePage() {
  const viewer = await getViewer();
  return <AppShell viewer={viewer}><QuantSuiteSurface signedIn={Boolean(viewer)} canOperate={Boolean(viewer && viewer.status === "ACTIVE" && (viewer.role === "admin" || viewer.plan === "max") && !viewer.needsSecondFactor)} canLive={Boolean(viewer?.status === "ACTIVE" && viewer.role === "admin" && !viewer.needsSecondFactor && viewer.twoFactorEnabled && viewer.twoFactorPassed)} operatorLabel={viewer?.username ?? viewer?.displayName ?? null} /></AppShell>;
}
