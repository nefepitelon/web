"use client";

import { useEffect, useState } from "react";

export function ResearchViewTracker({ articleId }: { articleId: string }) {
  useEffect(() => {
    const key = `welinkbtc:research-view:${articleId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Session storage is only a best-effort duplicate guard.
    }
    void fetch(`/api/research/${encodeURIComponent(articleId)}/view`, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" }
    });
  }, [articleId]);
  return null;
}

export function ReadingProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const update = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(scrollable > 0 ? Math.min(100, Math.max(0, (window.scrollY / scrollable) * 100)) : 0);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return <div className="research-reading-progress" aria-hidden="true"><i style={{ width: `${progress}%` }} /></div>;
}
