import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { LegacySurface } from "@/components/legacy-surface";
import { getViewer } from "@/lib/membership";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "AlphaOps" };

export default async function AlphaOpsPage() {
  const viewer = await getViewer();
  return (
    <AppShell viewer={viewer}>
      <LegacySurface
        src="/legacy/alphaops"
        title="AlphaOps Hub"
        mode={viewer ? (viewer.role === "admin" ? "admin" : "member") : "preview"}
        previewHeight={1450}
        message={viewer?.role === "admin" ? "管理员已解锁完整平台资料与全部运营工具" : viewer ? "会员基础资料与运营工具已解锁" : "访客可预览平台与研究摘要"}
      />
    </AppShell>
  );
}
