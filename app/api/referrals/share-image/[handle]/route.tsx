import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { referralShareBackground } from "@/lib/referral-share-background";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  if (!/^[a-z]{3,20}$/.test(handle)) return new Response("Not found", { status: 404 });
  const profile = await prisma.profile.findUnique({ where: { handle }, select: { displayName: true, avatarUrl: true } });
  if (!profile) return new Response("Not found", { status: 404 });
  const origin = new URL(request.url).origin;
  const referralUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? origin}/?ref=${handle}`;

  return new ImageResponse(
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", overflow: "hidden", color: "#f6f2e8", background: "#060706", fontFamily: "Arial, sans-serif" }}>
      <img src={referralShareBackground} width={630} height={630} style={{ position: "absolute", top: 0, right: 0, width: "54%", height: "100%", objectFit: "cover", objectPosition: "center" }} />
      <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, width: "100%", height: "100%", display: "flex", background: "linear-gradient(90deg, #070907 0%, #090d09 43%, rgba(8,10,8,.88) 55%, rgba(5,6,5,.12) 100%)" }} />
      <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, width: "100%", height: "100%", display: "flex", background: "linear-gradient(180deg, rgba(4,5,4,.06) 0%, rgba(4,5,4,0) 50%, rgba(4,5,4,.82) 100%)" }} />
      <div style={{ position: "absolute", left: -110, top: -210, width: 620, height: 620, display: "flex", borderRadius: 310, background: "radial-gradient(circle, rgba(97,177,85,.24) 0%, rgba(16,28,15,.08) 48%, rgba(6,7,6,0) 72%)" }} />

      <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "60px 66px 52px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 68, height: 68, borderRadius: 34, border: "2px solid rgba(238,157,57,.72)", background: "rgba(20,15,8,.82)", color: "#ee9d39", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, fontWeight: 900, boxShadow: "0 0 34px rgba(238,157,57,.26)" }}>B</div>
          <div style={{ display: "flex", flexDirection: "column" }}><span style={{ fontSize: 32, fontWeight: 900 }}>WELINKBTC</span><span style={{ color: "#82ed9b", fontSize: 16, letterSpacing: 5 }}>ON-CHAIN MAIN</span></div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <span style={{ color: "#82ed9b", fontSize: 21, fontWeight: 800, letterSpacing: 1 }}>INVITED BY {handle}.welinkBTC</span>
          <div style={{ maxWidth: 495, fontSize: 52, lineHeight: 1.08, fontWeight: 900, letterSpacing: -3 }}>系统跟踪BTC周期和链上信号!</div>
          <div style={{ maxWidth: 480, color: "#d6d8d2", fontSize: 25, lineHeight: 1.42 }}>从研究、信号、报价到清算，保持同一个工作台。</div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 28, borderTop: "1px solid rgba(130,237,155,.32)", paddingTop: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>{profile.avatarUrl ? <img src={profile.avatarUrl} width={54} height={54} style={{ borderRadius: 27, objectFit: "cover" }} /> : <div style={{ width: 54, height: 54, borderRadius: 27, background: "#ee9d39", color: "#10110f", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 900 }}>{handle[0].toUpperCase()}</div>}<div style={{ display: "flex", flexDirection: "column" }}><span style={{ fontSize: 20, fontWeight: 800 }}>{profile.displayName || handle}</span><span style={{ color: "#9ba49c", fontSize: 15 }}>{handle}.welinkBTC</span></div></div>
          <span style={{ maxWidth: 490, padding: "11px 16px", border: "1px solid rgba(130,237,155,.22)", borderRadius: 12, color: "#9cf3ad", background: "rgba(4,6,4,.72)", fontSize: 16 }}>{referralUrl}</span>
        </div>
      </div>
    </div>,
    { width: 1200, height: 630 }
  );
}
