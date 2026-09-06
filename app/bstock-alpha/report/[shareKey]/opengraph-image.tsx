import { ImageResponse } from "next/og";
import { getBstockReportShare } from "@/lib/bstock-report-share";

export const alt = "bStockAlpha Agent Studio AI research";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage({ params }: { params: Promise<{ shareKey: string }> }) {
  const { shareKey } = await params;
  const share = await getBstockReportShare(shareKey);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.welinkbtc-onchainmain.xyz";
  const brandImage = new URL("/welinkbtc-onchain-brand.png", baseUrl).toString();
  const assetImage = share
    ? new URL(`/api/bstock-alpha/brand-icon?symbol=${encodeURIComponent(share.symbol)}`, baseUrl).toString()
    : brandImage;
  const isZh = share?.language !== "en";
  const summary = share?.report.executiveSummary[0] || share?.report.conclusion[0] || (isZh ? "Agent Studio AI 投资研报" : "Agent Studio AI investment research");

  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", padding: 52, color: "#f3f8f5", background: "#070b0e", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", position: "absolute", inset: 0, opacity: .25, backgroundImage: "linear-gradient(rgba(127,245,174,.13) 1px,transparent 1px),linear-gradient(90deg,rgba(127,245,174,.13) 1px,transparent 1px)", backgroundSize: "52px 52px" }} />
      <div style={{ display: "flex", width: "100%", flexDirection: "column", padding: 34, border: "1px solid rgba(127,245,174,.34)", borderRadius: 30, background: "linear-gradient(135deg,rgba(19,38,29,.96),rgba(9,14,19,.96))" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <img src={brandImage} alt="" width="62" height="62" style={{ borderRadius: 16 }} />
            <div style={{ display: "flex", flexDirection: "column" }}><span style={{ fontSize: 28, fontWeight: 850 }}>bStock<span style={{ color: "#8ff4ad" }}>Alpha</span></span><span style={{ marginTop: 4, color: "#789087", fontSize: 13, letterSpacing: ".18em" }}>WELINKBTC · AGENTIC PNL TERMINAL</span></div>
          </div>
          <div style={{ display: "flex", padding: "10px 16px", border: "1px solid rgba(127,245,174,.34)", borderRadius: 999, color: "#8ff4ad", fontSize: 14 }}>{isZh ? "中文研报" : "ENGLISH REPORT"}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 52 }}>
          <img src={assetImage} alt="" width="92" height="92" style={{ borderRadius: 24, background: "#fff" }} />
          <div style={{ display: "flex", flexDirection: "column" }}><span style={{ color: "#8ff4ad", fontSize: 18, letterSpacing: ".14em" }}>{share?.symbol ?? "BSTOCK"} · BSC</span><strong style={{ marginTop: 7, fontSize: 48 }}>{share?.ticker ?? "AI RESEARCH"}</strong></div>
        </div>
        <div style={{ display: "flex", marginTop: 28, fontSize: 35, fontWeight: 800, lineHeight: 1.18 }}>{share?.report.title ?? "Agent Studio AI Research"}</div>
        <div style={{ display: "flex", marginTop: 18, maxWidth: 1040, color: "#b7c4be", fontSize: 20, lineHeight: 1.5 }}>{summary.slice(0, 230)}</div>
        <div style={{ display: "flex", marginTop: "auto", justifyContent: "space-between", paddingTop: 20, borderTop: "1px solid rgba(255,255,255,.13)", color: "#7f9188", fontSize: 14 }}><span>AGENT STUDIO · VERIFIED RESEARCH SHARE</span><span>welinkbtc-onchainmain.xyz</span></div>
      </div>
    </div>,
    size
  );
}
