import { ImageResponse } from "next/og";
import { getPublishedResearchArticle } from "@/lib/research-data";

export const researchShareImageSize = { width: 1200, height: 630 };

export async function createResearchShareImage(slug: string) {
  const article = await getPublishedResearchArticle(slug);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.welinkbtc-onchainmain.xyz";
  const coverImage = new URL(article?.coverImageUrl || "/research/research-default.png", baseUrl).toString();
  const brandImage = new URL("/welinkbtc-onchain-brand.png", baseUrl).toString();

  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", padding: 42, color: "#f4f5ef", background: "#080b09", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", position: "absolute", inset: 0, opacity: .22, backgroundImage: "linear-gradient(rgba(120,239,148,.16) 1px, transparent 1px), linear-gradient(90deg, rgba(120,239,148,.16) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
      <div style={{ display: "flex", width: "46%", height: "100%", overflow: "hidden", border: "1px solid rgba(139,236,161,.38)", borderRadius: 28, background: "#101612" }}>
        <img src={coverImage} alt="" width="552" height="546" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
      <div style={{ display: "flex", width: "54%", height: "100%", flexDirection: "column", padding: "12px 8px 8px 46px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <img src={brandImage} alt="" width="62" height="62" style={{ borderRadius: 16 }} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: ".04em" }}>WELINKBTC</span>
            <span style={{ color: "#8beca1", fontSize: 14, letterSpacing: ".18em" }}>ON-CHAIN MAIN · RESEARCH</span>
          </div>
        </div>
        <div style={{ display: "flex", marginTop: 46, color: "#8beca1", fontSize: 15, fontWeight: 700, letterSpacing: ".12em" }}>{article?.category ?? "RESEARCH"} · VERIFIED BRIEF</div>
        <div style={{ display: "flex", marginTop: 20, fontSize: 43, fontWeight: 850, lineHeight: 1.12, letterSpacing: "-.035em" }}>{article?.title ?? "WELINKBTC Research"}</div>
        <div style={{ display: "flex", marginTop: 24, color: "#b5beb8", fontSize: 22, lineHeight: 1.55 }}>{article?.excerpt ?? "把周期、链上数据与市场结构连接到同一个工作台。"}</div>
        <div style={{ display: "flex", marginTop: "auto", alignItems: "center", justifyContent: "space-between", paddingTop: 22, borderTop: "1px solid rgba(255,255,255,.14)", color: "#8a968e", fontSize: 15 }}>
          <span>{article ? `${article.readingMinutes} MIN READ` : "RESEARCH DESK"}</span>
          <span>welinkbtc-onchainmain.xyz</span>
        </div>
      </div>
    </div>,
    researchShareImageSize
  );
}
