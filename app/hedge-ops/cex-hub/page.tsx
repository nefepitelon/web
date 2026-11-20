import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { CexHub } from "@/components/cex-hub";
import "../hedge-ops.css";
import "../perpdex-box/standalone.css";

export const metadata: Metadata = {
  title: "Cex Hub · 中心化交易所市场总览",
  description: "常见中心化交易所公开现货与衍生品成交量、持仓量、评分及平台资料比较，附数据来源和读取时间。",
};

export default function CexHubPage() {
  return <main className="hedge-ops-page perpdex-standalone">
    <header className="perpdex-standalone-header">
      <a href="/hedge-ops"><ArrowLeft size={15} aria-hidden="true" />返回套利对冲Ops</a>
      <nav className="hedge-ops-market-links" aria-label="切换市场数据"><a href="/hedge-ops/perpdex-box">Perpdex Box</a><a href="/hedge-ops/cex-hub" aria-current="page">Cex Hub</a></nav>
    </header>
    <CexHub />
  </main>;
}
