import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { LegacySurface } from "@/components/legacy-surface";
import { configuredAccess } from "@/lib/content-gates";
import { getViewer } from "@/lib/membership";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "AI Ops" };

export default async function AiOpsPage() {
  const viewer = await getViewer();
  const access = await configuredAccess(viewer, "ai.low");
  return (
    <AppShell viewer={viewer}>
      <LegacySurface
        src="/legacy/ai-ops"
        title="AI Ops"
        mode={access.allowed && viewer ? (viewer.role === "admin" ? "admin" : viewer.plan === "max" ? "max" : viewer.plan === "pro" ? "pro" : "member") : "preview"}
        previewHeight={640 + (access.previewLimit ?? 1) * 280}
        upgradeTo="login"
        message={
          !viewer
            ? "访客可查看功能介绍，登录后获得低额度试用"
            : viewer.role === "admin"
              ? "管理员享有全量工具、管理额度与优先队列"
              : viewer.plan === "free"
              ? "Free 每月 3 次小微深研额度"
              : viewer.plan === "pro"
                ? "Pro 每月 35 次标准研究额度"
                : "Max 享有高额度与优先队列"
        }
      />
    </AppShell>
  );
}
