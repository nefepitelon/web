import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { BoxBreakoutSurface } from "@/components/box-breakout-surface";
import { getViewer } from "@/lib/membership";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "箱体突破看板 · WELINKBTC",
  description: "沪深 A 股与 Binance USDT 永续箱体突破扫描：热门板块、连续倍量、资金控盘、箱顶试盘与原生日 K 线。",
};

export default async function BoxBreakoutPage() {
  const viewer = await getViewer();
  const canOperate = Boolean(viewer?.status === "ACTIVE" && !viewer.needsSecondFactor);
  return <AppShell viewer={viewer}><BoxBreakoutSurface signedIn={Boolean(viewer)} canOperate={canOperate} /></AppShell>;
}
