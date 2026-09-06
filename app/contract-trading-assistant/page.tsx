import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { ContractTradingAssistantSurface } from "@/components/contract-trading-assistant-surface";
import { getViewer } from "@/lib/membership";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "合约交易助手",
  description: "在 welinkBTC 系统内使用合约分析、数据监控与指标共振工具。"
};

export default async function ContractTradingAssistantPage() {
  const viewer = await getViewer();

  return (
    <AppShell viewer={viewer}>
      <ContractTradingAssistantSurface />
    </AppShell>
  );
}
