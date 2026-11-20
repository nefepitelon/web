import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { PerpdexBox } from "@/components/perpdex-box";
import "../hedge-ops.css";
import "./standalone.css";

export const metadata: Metadata = {
  title: "Perpdex Box · 永续 DEX 市场总览",
  description: "公开永续 DEX 持仓量、成交量、TVL、交易对和基础费率比较，附数据来源和更新时间。",
};

export default function PerpdexBoxPage() {
  return <main className="hedge-ops-page perpdex-standalone">
    <header className="perpdex-standalone-header">
      <a href="/hedge-ops"><ArrowLeft size={15} aria-hidden="true" />返回套利对冲Ops</a>
      <nav className="hedge-ops-market-links" aria-label="切换市场数据"><a href="/hedge-ops/perpdex-box" aria-current="page">Perpdex Box</a><a href="/hedge-ops/cex-hub">Cex Hub</a></nav>
    </header>
    <PerpdexBox />
  </main>;
}
