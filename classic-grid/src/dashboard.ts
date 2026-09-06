import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ingestVenuesForLedger,
  ledgerPublicView,
  loadLedger,
  applyCapitalFlow,
  recordOfficialDayStatistics,
  patchOfficialVolumeForDay,
  trimLedgerCalendar,
} from "./ledger";
import { summarizeOfficialStats, type OfficialBundle } from "./officialStats";
import {
  getBotPauseState,
  loadBotPauseState,
  setBotPaused,
  type BotPauseState,
} from "./botControl";

export type DashboardVenueRow = {
  venue: string;
  market: string;
  mid: number;
  anchorMid: number;
  lower: number;
  upper: number;
  spacing: number;
  sizeBase: number;
  gridCount: number;
  position: number;
  /** 当前市场真实杠杆；读不到时使用实际生效的网格杠杆 */
  leverage?: number;
  openOrders: number;
  seeded: boolean;
  completedRungs: number;
  gridProfit: number;
  unrealizedPnl?: number;
  /** 官方爆仓价 */
  liquidationPrice?: number;
  equityUsd?: number;
  orders?: Array<{ side: string; price: number }>;
  /** 官方今日量/费/平仓盈亏；无则 null，前端回退本地 */
  officialVolume?: number | null;
  officialFees?: number | null;
  officialRealizedPnl?: number | null;
  officialFills?: number | null;
  officialCloseFills?: number | null;
  officialSource?: "official" | "unavailable" | "local";
  lastError?: string;
  updatedAt: string;
};

export type DashboardSnapshot = {
  startedAt: string;
  updatedAt: string;
  dryRun: boolean;
  /** 紧急暂停：不下单/不撤单/不补单，仅刷新看板只读 */
  paused: boolean;
  pausedAt?: string;
  venues: DashboardVenueRow[];
  ledger?: ReturnType<typeof ledgerPublicView>;
  official?: OfficialBundle | null;
  statistics?: ReturnType<typeof summarizeOfficialStats> | null;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "..", "public");

loadBotPauseState();

let snapshot: DashboardSnapshot = {
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  dryRun: true,
  paused: getBotPauseState().paused,
  pausedAt: getBotPauseState().paused ? getBotPauseState().updatedAt : undefined,
  venues: [],
  ledger: ledgerPublicView(loadLedger()),
};

export function resetDashboardSnapshot(): DashboardSnapshot {
  loadBotPauseState();
  const pause = getBotPauseState();
  snapshot = {
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    dryRun: true,
    paused: pause.paused,
    pausedAt: pause.paused ? pause.updatedAt : undefined,
    venues: [],
    ledger: ledgerPublicView(loadLedger()),
  };
  return snapshot;
}

function syncPauseIntoSnapshot(): void {
  const p = getBotPauseState();
  snapshot = {
    ...snapshot,
    paused: p.paused,
    pausedAt: p.paused ? p.updatedAt : undefined,
    updatedAt: new Date().toISOString(),
  };
}

export function getDashboardSnapshot(): DashboardSnapshot {
  return snapshot;
}

export function setDashboardMeta(p: { dryRun: boolean }): void {
  syncPauseIntoSnapshot();
  snapshot = {
    ...snapshot,
    dryRun: p.dryRun,
    updatedAt: new Date().toISOString(),
    ledger: ledgerPublicView(loadLedger()),
  };
}

export function applyBotPause(paused: boolean, reason?: string): BotPauseState {
  const next = setBotPaused(paused, reason);
  syncPauseIntoSnapshot();
  persistStatus();
  return next;
}

export function setDashboardOfficial(official: OfficialBundle | null): void {
  let ledger = snapshot.ledger || ledgerPublicView(loadLedger());
  const enabled = snapshot.venues.map((row) => row.venue) as Array<keyof OfficialBundle["venues"]>;
  const statistics = summarizeOfficialStats(official, enabled);
  const venues = snapshot.venues.map((row) => {
    const item = official?.venues?.[row.venue as keyof OfficialBundle["venues"]];
    if (!item || item.source !== "official") return row;
    return {
      ...row,
      completedRungs:
        item.closeFills != null && Number.isFinite(Number(item.closeFills))
          ? Math.max(Number(row.completedRungs) || 0, Number(item.closeFills))
          : row.completedRungs,
      officialVolume: item.volume,
      officialFees: item.fees,
      officialRealizedPnl: item.realizedPnl,
      officialFills: item.fills,
      officialCloseFills: item.closeFills,
      officialSource: "official" as const,
    };
  });
  if (official?.venues) {
    try {
      recordOfficialDayStatistics(statistics);
      ledger = ledgerPublicView(ingestVenuesForLedger(venues));
    } catch {
      ledger = ledgerPublicView(loadLedger());
    }
  }
  snapshot = {
    ...snapshot,
    official,
    statistics,
    venues,
    ledger,
    updatedAt: new Date().toISOString(),
  };
  persistStatus();
}

function persistStatus(): void {
  try {
    const dataDir = path.resolve(process.cwd(), "data");
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(
      path.join(dataDir, "status.json"),
      JSON.stringify(snapshot, null, 2),
      "utf8"
    );
  } catch {
    /* ignore */
  }
}

export function upsertDashboardVenue(row: DashboardVenueRow): void {
  const next = snapshot.venues.filter((v) => v.venue !== row.venue);
  next.push(row);
  next.sort((a, b) => a.venue.localeCompare(b.venue));
  let ledger;
  try {
    ledger = ledgerPublicView(ingestVenuesForLedger(next));
  } catch {
    ledger = ledgerPublicView(loadLedger());
  }
  snapshot = {
    ...snapshot,
    venues: next,
    updatedAt: new Date().toISOString(),
    ledger,
  };
  persistStatus();
}

export function startDashboardServer(port: number): http.Server | null {
  if (!(port > 0)) return null;
  const host = String(process.env.DASHBOARD_HOST || "127.0.0.1").trim();
  const authRequired = !["127.0.0.1", "::1", "localhost"].includes(host.toLowerCase());
  const authToken = String(process.env.DASHBOARD_AUTH_TOKEN || "").trim();
  if (authRequired && authToken.length < 32) {
    throw new Error("远程看板必须配置至少 32 位 DASHBOARD_AUTH_TOKEN");
  }

  const secureHeaders = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  } as const;
  const sendJson = (res: http.ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, {
      ...secureHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
    });
    res.end(JSON.stringify(body));
  };
  const authorized = (req: http.IncomingMessage) => {
    if (!authRequired) return true;
    const supplied = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const left = Buffer.from(supplied);
    const right = Buffer.from(authToken);
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  };
  const sameOrigin = (req: http.IncomingMessage) => {
    const origin = req.headers.origin;
    if (!origin) return true;
    try {
      return new URL(origin).host === String(req.headers.host || "");
    } catch {
      return false;
    }
  };
  const readJson = async (req: http.IncomingMessage): Promise<any> => {
    const declared = Number(req.headers["content-length"] || 0);
    if (declared > 64 * 1024) throw new Error("请求体超过 64KB 限制");
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += part.length;
      if (size > 64 * 1024) throw new Error("请求体超过 64KB 限制");
      chunks.push(part);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    return raw ? JSON.parse(raw) : {};
  };

  const server = http.createServer(async (req, res) => {
    const url = req.url?.split("?")[0] || "/";
    if (url === "/api/meta") {
      sendJson(res, 200, { authRequired, port, host });
      return;
    }
    if (!authorized(req)) {
      res.setHeader("WWW-Authenticate", "Bearer");
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }
    if (req.method === "POST" && !sameOrigin(req)) {
      sendJson(res, 403, { ok: false, error: "cross-origin request rejected" });
      return;
    }
    if (url === "/api/snapshot" || url === "/api/status" || url === "/api/overview") {
      syncPauseIntoSnapshot();
      const body = {
        ...snapshot,
        ledger: ledgerPublicView(loadLedger()),
      };
      sendJson(res, 200, body);
      return;
    }
    if (url === "/api/statistics-refresh" && req.method === "POST") {
      try {
        const { refreshOfficialStats } = await import("./officialStats");
        const enabled = snapshot.venues.map((row) => row.venue) as Array<keyof OfficialBundle["venues"]>;
        const official = await refreshOfficialStats({
          force: true,
          minIntervalMs: 0,
          venues: enabled,
          previous: snapshot.official,
        });
        setDashboardOfficial(official);
        sendJson(res, 200, { ok: true, requestedAt: official.updatedAt });
      } catch (error: any) {
        sendJson(res, 500, { ok: false, error: String(error?.message || error).slice(0, 240) });
      }
      return;
    }
    if (
      (url === "/api/pause" || url === "/api/resume" || url === "/api/bot-pause") &&
      req.method === "POST"
    ) {
      try {
        const j = await readJson(req);
        const reason = j?.reason ? String(j.reason).slice(0, 200) : undefined;
        if (url === "/api/bot-pause" && typeof j?.paused === "boolean") {
          const st = applyBotPause(j.paused, reason || "dashboard");
          sendJson(res, 200, { ok: true, ...st });
          return;
        }
        const wantPause = url === "/api/pause";
        const st = applyBotPause(wantPause, reason || "dashboard");
        sendJson(res, 200, { ok: true, ...st });
      } catch (error: any) {
        sendJson(res, 400, { ok: false, error: String(error?.message || error).slice(0, 240) });
      }
      return;
    }
    if (url === "/api/capital-flow" && req.method === "POST") {
      try {
          const j = await readJson(req);
          const items = Array.isArray(j?.flows)
            ? j.flows
            : [
                {
                  venue: j?.venue,
                  amount:
                    j?.amount != null
                      ? Number(j.amount)
                      : j?.withdraw != null
                        ? -Math.abs(Number(j.withdraw))
                        : j?.deposit != null
                          ? Math.abs(Number(j.deposit))
                          : NaN,
                  note: j?.note,
                },
              ];
          const applied = [];
          for (const it of items) {
            const venue = String(it?.venue || "manual");
            let amount = Number(it?.amount);
            if (!Number.isFinite(amount) && it?.withdraw != null) {
              amount = -Math.abs(Number(it.withdraw));
            }
            if (!Number.isFinite(amount) && it?.deposit != null) {
              amount = Math.abs(Number(it.deposit));
            }
            const st = applyCapitalFlow({
              venue,
              amount,
              note: it?.note ? String(it.note) : undefined,
            });
            applied.push({
              venue,
              amount,
              dayProfit: st.calendar[0]?.dayProfit,
              dayOpenEquity: st.dayOpenEquity,
            });
          }
          const view = ledgerPublicView();
          // 刷新看板里的 ledger 视图
          snapshot = {
            ...snapshot,
            ledger: view,
            updatedAt: new Date().toISOString(),
          };
          persistStatus();
          sendJson(res, 200, { ok: true, applied, ledger: view });
        } catch (e: any) {
          sendJson(res, 400, { ok: false, error: String(e?.message || e).slice(0, 240) });
        }
      return;
    }
    if (url === "/api/ledger/official-volume" && req.method === "POST") {
      try {
          const j = await readJson(req);
          const items = Array.isArray(j?.days)
            ? j.days
            : [{ day: j?.day, volume: j?.volume }];
          const applied = [];
          for (const it of items) {
            const day = String(it?.day || "");
            const volume = Number(it?.volume);
            const st = patchOfficialVolumeForDay(day, volume);
            const row = st.calendar.find((d) => d.day === day);
            applied.push({ day, volume: row?.officialVolume ?? volume });
          }
          const view = ledgerPublicView();
          snapshot = {
            ...snapshot,
            ledger: view,
            updatedAt: new Date().toISOString(),
          };
          persistStatus();
          sendJson(res, 200, { ok: true, applied, ledger: view });
        } catch (e: any) {
          sendJson(res, 400, { ok: false, error: String(e?.message || e).slice(0, 240) });
        }
      return;
    }
    if (url === "/api/ledger/calendar-trim" && req.method === "POST") {
      try {
          const j = await readJson(req);
          const from = String(j?.from || j?.keepFrom || "");
          const st = trimLedgerCalendar(from);
          const view = ledgerPublicView(st);
          snapshot = {
            ...snapshot,
            ledger: view,
            updatedAt: new Date().toISOString(),
          };
          persistStatus();
          sendJson(res, 200, {
            ok: true,
            from,
            days: view.calendar.map((d) => d.day),
            ledger: view,
          });
        } catch (e: any) {
          sendJson(res, 400, { ok: false, error: String(e?.message || e).slice(0, 240) });
        }
      return;
    }
    if (url === "/" || url === "/index.html") {
      const htmlPath = path.join(PUBLIC_DIR, "index.html");
      if (!fs.existsSync(/* turbopackIgnore: true */ htmlPath)) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("public/index.html missing");
        return;
      }
      res.writeHead(200, {
        ...secureHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      });
      res.end(fs.readFileSync(/* turbopackIgnore: true */ htmlPath));
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  });
  server.listen(port, host, () => {
    console.log(`[dashboard] http://${host}:${port}/  api=/api/snapshot auth=${authRequired ? "required" : "local"}`);
  });
  server.on("error", (e: NodeJS.ErrnoException) => {
    console.error(`[dashboard] listen failed: ${e.message}`);
  });
  return server;
}
