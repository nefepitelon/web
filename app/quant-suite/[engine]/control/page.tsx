import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { QuantSuiteSurface } from "@/components/quant-suite-surface";
import { getViewer } from "@/lib/membership";
import { isQuantEngineId, getQuantEngine } from "@/lib/quant-suite/catalog";
import { hasQuantAccess, hasQuantLiveAccess } from "@/lib/quant-suite/validation";

export const dynamic = "force-dynamic";
export async function generateMetadata({params}: {params: Promise<{engine: string}>}) {
  const {engine} = await params;
  return {title: `${getQuantEngine(engine)?.name ?? "量化交易集"} · 连接与执行`};
}
export default async function QuantControlPage({params}: {params: Promise<{engine: string}>}) {
  const {engine} = await params;
  if (!isQuantEngineId(engine)) notFound();
  const viewer = await getViewer();
  return <AppShell viewer={viewer}><div style={{padding: "12px 24px", background: "#101b24", borderBottom: "1px solid #2c3b45", color: "#7edcc9", fontSize: 13}}><Link href={`/quant-suite/${engine}`}>← {getQuantEngine(engine)?.name} · 原版界面 / SDK</Link></div><QuantSuiteSurface key={engine} selectedEngine={engine} signedIn={Boolean(viewer)} canOperate={hasQuantAccess(viewer)} canLive={hasQuantLiveAccess(viewer)} operatorLabel={viewer?.username ?? viewer?.displayName ?? null}/></AppShell>;
}
