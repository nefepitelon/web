import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { ClassicGridSurface } from "@/components/classic-grid-surface";
import { FeatureAccessBoundary } from "@/components/feature-access-boundary";
import { getViewer } from "@/lib/membership";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "AIClassic网格",
  description: "服务器托管的 AIClassic 八所永续合约经典网格总控台。"
};

export default async function ClassicGridPage() {
  const viewer = await getViewer();
  return (
    <AppShell viewer={viewer}>
      <FeatureAccessBoundary
        viewer={viewer}
        entitlement="grid.classic"
        title="AIClassic 网格"
        description="Max 与管理员可使用服务器托管的经典网格控制台；其他角色可以查看权限说明并升级。API 密钥、启停和参数写入均由服务端再次鉴权。"
      >
        <ClassicGridSurface storageScope={viewer?.id || "guest"} />
      </FeatureAccessBoundary>
    </AppShell>
  );
}
