import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { QuantNativeWorkspace } from "@/components/quant-native-workspace";
import { getViewer } from "@/lib/membership";
import { getQuantEngine, isQuantEngineId } from "@/lib/quant-suite/catalog";
import { NATIVE_WORKSPACES, readNativeSources } from "@/lib/quant-suite/native-workspaces";
import { hasQuantAccess } from "@/lib/quant-suite/validation";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ engine: string }> }): Promise<Metadata> {
  const { engine } = await params;
  const metadata = getQuantEngine(engine);
  if (!metadata) return { title: "量化交易集" };
  return { title: `${metadata.name} · 量化交易集`, description: metadata.description };
}

export default async function QuantEnginePage({ params }: { params: Promise<{ engine: string }> }) {
  const { engine } = await params;
  if (!isQuantEngineId(engine)) notFound();
  const [viewer, files] = await Promise.all([getViewer(), readNativeSources(engine)]);
  const {files: _directory, ...info} = NATIVE_WORKSPACES[engine];
  return <AppShell viewer={viewer}><QuantNativeWorkspace key={engine} engine={engine} info={info} files={files} signedIn={Boolean(viewer)} canOperate={hasQuantAccess(viewer)} /></AppShell>;
}
