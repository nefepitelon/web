import "server-only";
import { prisma } from "@/lib/prisma";
import type { StmHistorySnapshot, StmStrategy } from "./types";

function historyWindows(strategies: StmStrategy[]) {
  return [...new Set(strategies.filter(strategy => strategy.enabled && ["S2", "S4"].includes(strategy.id)
    && Number.isFinite(strategy.windowMinutes) && strategy.windowMinutes > 0).map(strategy => strategy.windowMinutes))];
}

/** Mirrors the database projection for fixtures; production never downloads full snapshots. */
export function projectStmHistory(snapshots: StmHistorySnapshot[], strategies: StmStrategy[], now = Date.now()): StmHistorySnapshot[] {
  const windows = historyWindows(strategies);
  if (!windows.length) return [];
  const oldest = now - Math.max(...windows) * 60_000;
  const bounded = snapshots.filter(snapshot => {
    const at = Date.parse(snapshot.asOf);
    return Number.isFinite(at) && at >= oldest && at <= now;
  }).sort((left, right) => Date.parse(left.asOf) - Date.parse(right.asOf));
  const cohort = new Set<string>();
  for (const window of windows) {
    const first = bounded.find(snapshot => Date.parse(snapshot.asOf) >= now - window * 60_000);
    for (const trader of first?.traders ?? []) if (trader.qualified && trader.visibility === "public") cohort.add(trader.id);
  }
  return bounded.map(snapshot => ({ asOf: snapshot.asOf, traders: snapshot.traders.filter(trader => cohort.has(trader.id)).map(trader => ({
    id: trader.id, address: trader.address, clusterId: trader.clusterId ?? null,
    updatedAt: trader.updatedAt, visibility: trader.visibility, qualified: trader.qualified,
    holdings: trader.holdings.map(holding => ({ asset: holding.asset, quantity: holding.quantity, side: holding.side })),
  })) }));
}

/** Keep the original cohort and every later observation, including failed qualification. */
export async function readStmHistory(strategies: StmStrategy[], now = Date.now()): Promise<{ snapshots: StmHistorySnapshot[]; count: number }> {
  const windows = historyWindows(strategies);
  if (!windows.length) {
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::integer AS count FROM (
        SELECT id FROM stm_hunt_records WHERE "userId" = 'system' AND kind = 'snapshot'
        ORDER BY "createdAt" DESC, id DESC LIMIT 300
      ) AS latest`;
    return { snapshots: [], count: rows[0]?.count ?? 0 };
  }
  const nowIso = new Date(now).toISOString();
  const oldest = now - Math.max(...windows) * 60_000;
  const oldestIso = new Date(oldest).toISOString();
  const createdSince = new Date(oldest - 120_000);
  const starts = JSON.stringify(windows.map(window => new Date(now - window * 60_000).toISOString()));
  const rows = await prisma.$queryRaw<{ snapshots: StmHistorySnapshot[]; count: number }[]>`
    WITH latest AS MATERIALIZED (
      SELECT id, "createdAt" FROM stm_hunt_records
      WHERE "userId" = 'system' AND kind = 'snapshot'
      ORDER BY "createdAt" DESC, id DESC LIMIT 300
    ), bounded AS MATERIALIZED (
      SELECT records.id, records."createdAt", records.payload, records.payload->>'asOf' AS "asOf"
      FROM stm_hunt_records AS records JOIN latest USING (id)
      WHERE records."createdAt" >= ${createdSince}
        AND records.payload->>'asOf' >= ${oldestIso} AND records.payload->>'asOf' <= ${nowIso}
    ), cohort AS MATERIALIZED (
      SELECT DISTINCT trader.value->>'id' AS id
      FROM jsonb_array_elements_text(${starts}::jsonb) AS windows(start)
      CROSS JOIN LATERAL (
        SELECT payload FROM bounded WHERE "asOf" >= windows.start
        ORDER BY "asOf" ASC, "createdAt" DESC, id DESC LIMIT 1
      ) AS first_snapshot
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(first_snapshot.payload->'traders') = 'array'
          THEN first_snapshot.payload->'traders' ELSE '[]'::jsonb END
      ) AS trader(value)
      WHERE trader.value->'qualified' = 'true'::jsonb AND trader.value->>'visibility' = 'public'
    )
    SELECT (SELECT COUNT(*)::integer FROM latest) AS count,
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'asOf', bounded."asOf", 'traders', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', trader.value->'id', 'address', trader.value->'address', 'clusterId', trader.value->'clusterId',
            'visibility', trader.value->'visibility', 'qualified', trader.value->'qualified', 'updatedAt', trader.value->'updatedAt',
            'holdings', COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'asset', holding.value->'asset', 'quantity', holding.value->'quantity', 'side', holding.value->'side'
            ) ORDER BY holding.ordinality)
              FROM jsonb_array_elements(CASE WHEN jsonb_typeof(trader.value->'holdings') = 'array'
                THEN trader.value->'holdings' ELSE '[]'::jsonb END) WITH ORDINALITY AS holding(value, ordinality)
            ), '[]'::jsonb)
          ) ORDER BY trader.ordinality)
          FROM jsonb_array_elements(CASE WHEN jsonb_typeof(bounded.payload->'traders') = 'array'
            THEN bounded.payload->'traders' ELSE '[]'::jsonb END) WITH ORDINALITY AS trader(value, ordinality)
          WHERE trader.value->>'id' IN (SELECT id FROM cohort)
        ), '[]'::jsonb)
      ) ORDER BY bounded."asOf" ASC, bounded."createdAt" DESC, bounded.id DESC) FROM bounded), '[]'::jsonb) AS snapshots`;
  return { snapshots: rows[0]?.snapshots ?? [], count: rows[0]?.count ?? 0 };
}
