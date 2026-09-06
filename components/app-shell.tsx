import type { Viewer } from "@/lib/membership";
import { PlatformHeader } from "@/components/platform-header";

export function AppShell({ viewer, children }: { viewer: Viewer | null; children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <PlatformHeader viewer={viewer} />
      {children}
    </div>
  );
}
