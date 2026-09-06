import { alphaExecutionErrorResponse, requireAlphaOperator } from "@/lib/alpha-execution/access";
import { CLASSIC_GRID_VENUES } from "@/lib/classic-grid/config";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const emptySnapshot = {
  startedAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  dryRun: true,
  paused: true,
  venues: []
};

export async function GET() {
  try {
    const viewer = await requireAlphaOperator();
    const bot = await prisma.classicGridBot.findUnique({
      where: { userId: viewer.id },
      select: {
        snapshot: true,
        configSummary: true,
        dryRun: true,
        paused: true,
        status: true,
        heartbeatAt: true,
        lastError: true,
      }
    });
    const snapshot = bot?.snapshot && typeof bot.snapshot === "object" ? bot.snapshot : emptySnapshot;
    const summary = bot?.configSummary && typeof bot.configSummary === "object"
      ? bot.configSummary as { venues?: unknown; statsRefreshRequestedAt?: unknown; statsRefreshedAt?: unknown }
      : null;
    const enabledVenues = Array.isArray(summary?.venues)
      ? summary.venues.filter((venue): venue is string => typeof venue === "string")
      : [];
    const { runtimeState: _runtimeState, ...publicSnapshot } = snapshot as typeof emptySnapshot & {
      runtimeState?: unknown;
      [key: string]: unknown;
    };
    return Response.json({
      ...publicSnapshot,
      dryRun: bot?.dryRun ?? true,
      paused: bot?.paused ?? true,
      welinkbtc: {
        status: bot?.status ?? "NOT_CONFIGURED",
        heartbeatAt: bot?.heartbeatAt?.toISOString() ?? null,
        lastError: bot?.lastError ?? null,
        enabledVenues,
        supportedVenues: CLASSIC_GRID_VENUES,
        statsRefreshRequestedAt: typeof summary?.statsRefreshRequestedAt === "string" ? summary.statsRefreshRequestedAt : null,
        statsRefreshedAt: typeof summary?.statsRefreshedAt === "string" ? summary.statsRefreshedAt : null,
      }
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) {
    return alphaExecutionErrorResponse(caught);
  }
}
