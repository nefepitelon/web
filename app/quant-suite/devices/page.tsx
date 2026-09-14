import { AppShell } from "@/components/app-shell";
import { QuantDeviceManager } from "@/components/quant-device-manager";
import { getViewer } from "@/lib/membership";
import { hasQuantAccess } from "@/lib/quant-suite/validation";
export const dynamic = "force-dynamic";
export const metadata = {title: "本地交易执行器 · 量化交易集"};
export default async function QuantDevicesPage() {
  const viewer = await getViewer();
  return <AppShell viewer={viewer}><QuantDeviceManager canOperate={hasQuantAccess(viewer)}/></AppShell>;
}
