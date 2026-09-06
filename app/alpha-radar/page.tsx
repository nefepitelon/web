import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { LegacySurface } from "@/components/legacy-surface";
import { configuredAccess } from "@/lib/content-gates";
import { getViewer } from "@/lib/membership";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Alpha Radar" };

export default async function AlphaRadarPage() {
  const viewer = await getViewer();
  const access = await configuredAccess(viewer, "alpha.full");
  const preview = !access.allowed;
  return (
    <AppShell viewer={viewer}>
      <LegacySurface
        src="/legacy/alpha-radar"
        title="Alpha Radar"
        mode={preview ? "preview" : viewer?.role === "admin" ? "admin" : viewer?.plan === "max" ? "max" : viewer?.plan === "pro" ? "pro" : "member"}
        previewHeight={viewer ? 1050 + (access.previewLimit ?? 3) * 180 : 560 + (access.previewLimit ?? 3) * 120}
        upgradeTo={viewer ? "pro" : "login"}
        message={
          !viewer
            ? "访客可预览前三条信号与打码字段"
            : viewer.role === "admin"
              ? "管理员已解锁全量数据、完整字段与高级 Alpha 信号"
              : viewer.plan === "free"
              ? "Free 可查看部分字段；Pro 解锁完整基础版"
              : viewer.plan === "pro"
                ? "Pro 已解锁完整基础版；高级 Alpha 信号需 Max"
                : "Max 已解锁全量数据与高级信号"
        }
      />
    </AppShell>
  );
}
