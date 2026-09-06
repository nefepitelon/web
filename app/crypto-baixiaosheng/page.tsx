import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { CryptoBaixiaoshengSurface } from "@/components/crypto-baixiaosheng-surface";
import { getViewer } from "@/lib/membership";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "币圈百晓生",
  description: "在 welinkBTC 系统内查看实时币圈资讯、每日早报与市场日历。",
};

export default async function CryptoBaixiaoshengPage() {
  const viewer = await getViewer();

  return (
    <AppShell viewer={viewer}>
      <CryptoBaixiaoshengSurface />
    </AppShell>
  );
}
