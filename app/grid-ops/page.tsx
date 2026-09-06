import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { GridOpsSurface } from "@/components/grid-ops-surface";
import { FeatureAccessBoundary } from "@/components/feature-access-boundary";
import { getViewer } from "@/lib/membership";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "AI网格交易Ops",
  description: "可自选本地交易引擎或线上服务器托管运行的多交易所永续合约网格交易总控台。"
};

export default async function GridOpsPage() {
  const viewer = await getViewer();

  return (
    <AppShell viewer={viewer}>
      <FeatureAccessBoundary
        viewer={viewer}
        entitlement="grid.ops"
        title="AI 网格交易 Ops"
        description="Max 与管理员可进入完整交易工作台；未登录、Free 与 Pro 账户保留产品说明和升级入口。所有交易写接口同时执行服务端权限校验。"
      >
        <GridOpsSurface storageScope={viewer?.id || "guest"} />
      </FeatureAccessBoundary>
    </AppShell>
  );
}
