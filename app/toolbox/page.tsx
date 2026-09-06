import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { ToolboxWorkbench } from "@/components/toolbox-workbench";
import { getViewer } from "@/lib/membership";
import { getToolboxSnapshot } from "@/lib/toolbox";
import "./toolbox.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "百宝箱工具台",
  description: "welinkBTC 常用平台、研究工具与运营知识库。"
};

export default async function ToolboxPage() {
  const viewer = await getViewer();
  const snapshot = await getToolboxSnapshot(viewer);
  return (
    <AppShell viewer={viewer}>
      {!viewer ? <div className="toolbox-access-preview"><strong>未登录预览</strong><span>当前展示 8 条公开工具；登录 Free 账户可查看完整公开百宝箱并收藏，Pro 可导出，管理员与操作员可维护内容。</span><a href="/login?next=%2Ftoolbox">登录 / 注册</a></div> : null}
      <ToolboxWorkbench initialData={snapshot} />
    </AppShell>
  );
}
