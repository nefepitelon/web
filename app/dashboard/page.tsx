import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { LegacySurface } from "@/components/legacy-surface";
import { configuredAccess } from "@/lib/content-gates";
import { getViewer } from "@/lib/membership";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "BTC 链上 Dashboard" };

export default async function DashboardPage() {
  const viewer = await getViewer();
  const access = await configuredAccess(viewer, "dashboard.advanced");
  const preview = !access.allowed;
  return (
    <AppShell viewer={viewer}>
      <LegacySurface
        src="/legacy/dashboard"
        title="BTC 链上 Dashboard"
        mode={preview ? "preview" : viewer?.role === "admin" ? "admin" : viewer?.plan === "max" ? "max" : viewer?.plan === "pro" ? "pro" : "member"}
        previewHeight={viewer ? 1500 + (access.previewLimit ?? 3) * 260 : 720 + (access.previewLimit ?? 2) * 200}
        upgradeTo={viewer ? "pro" : "login"}
        message={
          !viewer
            ? "访客可查看样例卡片，登录后解锁基础指标"
            : viewer.role === "admin"
              ? "管理员已解锁完整 Dashboard、全部高级指标与导出能力"
              : viewer.plan === "free"
              ? "Free 已解锁基础指标，高级估值与导出需要 Pro"
              : `${viewer.plan.toUpperCase()} 已解锁高级 Dashboard`
        }
      />
    </AppShell>
  );
}
