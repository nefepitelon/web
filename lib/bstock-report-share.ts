import "server-only";

import { cache } from "react";
import { parseStoredAgentStudioReport, type AgentStudioReportLanguage } from "@/lib/bstock-agent-studio-localization";
import { prisma } from "@/lib/prisma";

const SHARE_KEY_PATTERN = /^[A-Za-z0-9_-]{32}$/;

export const getBstockReportShare = cache(async (shareKey: string) => {
  if (!SHARE_KEY_PATTERN.test(shareKey)) return null;
  const record = await prisma.bstockResearchShare.findUnique({
    where: { shareKey },
    select: {
      shareKey: true,
      language: true,
      symbol: true,
      ticker: true,
      companyName: true,
      companyNameZh: true,
      report: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true
    }
  });
  if (!record) return null;
  const report = parseStoredAgentStudioReport(record.report);
  if (!report) return null;
  return {
    ...record,
    language: (record.language === "en" ? "en" : "zh") as AgentStudioReportLanguage,
    report
  };
});

export function bstockReportSharePath(shareKey: string) {
  return `/bstock-alpha/report/${encodeURIComponent(shareKey)}`;
}

export function absoluteBstockReportShareUrl(shareKey: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.welinkbtc-onchainmain.xyz";
  return new URL(bstockReportSharePath(shareKey), baseUrl).toString();
}

export function bstockReportExcerpt(value: string | null | undefined, max = 180) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean;
}
