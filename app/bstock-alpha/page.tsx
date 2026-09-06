import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { BstockBrowserWalletBridge } from "@/components/bstock-browser-wallet-bridge";
import { LegacySurface } from "@/components/legacy-surface";
import { getViewer } from "@/lib/membership";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "bStockAlpha",
  description: "Agentic Wallet 驱动的代币化美股研究、风控、执行与 Realized PnL 工作台"
};

export default async function BStockAlphaPage() {
  const viewer = await getViewer();

  return (
    <AppShell viewer={viewer}>
      <BstockBrowserWalletBridge />
      <LegacySurface
        src="/legacy/bstock-alpha"
        title="bStockAlpha"
        mode="public"
        message="双 AI 研究 × 确定性风控 × Agentic Wallet × Realized PnL"
      />
    </AppShell>
  );
}
