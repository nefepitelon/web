import type { Viewer } from "@/lib/membership";
import { MaxTrialAnnouncement } from "@/components/max-trial-announcement";
import { PlatformHeader } from "@/components/platform-header";

export function AppShell({ viewer, children }: { viewer: Viewer | null; children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <PlatformHeader viewer={viewer} />
      {children}
      {viewer?.showMaxGiftAnnouncement && viewer.maxGiftAnnouncementEndsAt ? (
        <MaxTrialAnnouncement endsAt={viewer.maxGiftAnnouncementEndsAt} />
      ) : null}
    </div>
  );
}
