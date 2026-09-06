"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const SESSION_KEY = "welinkbtc_analytics_session";

export function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/api/")) return;
    let sessionId = sessionStorage.getItem(SESSION_KEY);
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, sessionId);
    }
    void fetch("/api/analytics/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, eventType: "PAGE_VIEW", path: pathname }),
      keepalive: true
    });
  }, [pathname]);

  return null;
}
