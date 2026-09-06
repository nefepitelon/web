import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { LegacySurface } from "@/components/legacy-surface";
import { getViewer } from "@/lib/membership";
import { isDatabaseConfigured, prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ ref?: string }> }): Promise<Metadata> {
  const { ref } = await searchParams;
  const handle = ref && /^[a-z]{3,20}$/.test(ref) ? ref : null;
  if (!handle || !isDatabaseConfigured()) return { title: "WELINKBTC On-Chain Main" };
  const exists = await prisma.profile.findUnique({ where: { handle }, select: { id: true } });
  if (!exists) return { title: "WELINKBTC On-Chain Main" };
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.welinkbtc-onchainmain.xyz";
  const title = `${handle}.welinkBTC 邀请你加入 WELINKBTC`;
  const description = "系统跟踪BTC周期和链上信号！从研究、信号、报价到清算，保持同一个工作台。";
  return { title, description, openGraph: { title, description, images: [{ url: `${origin}/api/referrals/share-image/${handle}`, width: 1200, height: 630 }] }, twitter: { card: "summary_large_image", title, description, images: [`${origin}/api/referrals/share-image/${handle}`] } };
}

export default async function HomePage() {
  const viewer = await getViewer();
  return (
    <AppShell viewer={viewer}>
      <LegacySurface
        src="/legacy/index"
        title="Bitcoin Intelligence Network"
        mode="public"
        message={viewer ? `已登录为 ${viewer.username ?? viewer.email}` : "公开首页 · 无需登录"}
      />
    </AppShell>
  );
}
