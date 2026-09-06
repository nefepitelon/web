import {
  anchorGrid,
  assertLiveAllowed,
  gridFor,
  loadRuntimeConfig,
  type RuntimeConfig,
} from "./config";
import {
  setDashboardMeta,
  setDashboardOfficial,
  startDashboardServer,
  upsertDashboardVenue,
  getDashboardSnapshot,
} from "./dashboard";
import { isBotPaused, loadBotPauseState } from "./botControl";
import {
  assertFeeOk,
  assertMarginOk,
  buildGrid,
  computeRisk,
  planFromFillsAndSeed,
  type BuiltGrid,
} from "./grid";
import { loadVenueSessionCounters } from "./ledger";
import { resolveLiveSizing } from "./liveSizing";
import { getOfficialCache, refreshOfficialStats } from "./officialStats";
import { createExecutor, type VenueExecutor } from "./venues/index";
import type { GridParams, Side, VenueId } from "./types";
import {
  classifyTrade,
  tgBoot,
  tgClose,
  tgDailyOverview,
  tgError,
  isSoftPlaceError,
  tgOpen,
} from "./telegram";
import { loadEnv } from "./loadEnv";
import fs from "node:fs";
import path from "node:path";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 读侧瞬时网络/SDK 抖动：不标面板异常、不刷仓位归零 */
function isTransientReadError(msg: string): boolean {
  return /fetch failed|ECONNRESET|ETIMEDOUT|ECONNREFUSED|socket hang up|UND_ERR|internal assertion violation|network|getaddrinfo|429|Too Many|rate.?limit/i.test(
    msg
  );
}

/** 软启：从 data/status.json 恢复锚点，避免重锚导致误撤现有挂单 */
function loadSoftResumeAnchors(): Partial<
  Record<VenueId, { anchorMid: number; gridCount: number }>
> {
  loadEnv();
  if (!["1", "true", "yes", "YES"].includes(String(process.env.SOFT_RESUME || "").trim())) {
    return {};
  }
  try {
    const p = path.resolve(process.cwd(), "data", "status.json");
    if (!fs.existsSync(/* turbopackIgnore: true */ p)) return {};
    const j = JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ p, "utf8"));
    const out: Partial<Record<VenueId, { anchorMid: number; gridCount: number }>> = {};
    for (const v of j.venues || []) {
      const id = String(v.venue) as VenueId;
      const mid = Number(v.anchorMid);
      const gc = Number(v.gridCount);
      if (mid > 0 && gc > 0) out[id] = { anchorMid: mid, gridCount: gc };
    }
    console.log(
      `[soft-resume] loaded anchors: ${Object.entries(out)
        .map(([k, v]) => `${k}=${v!.anchorMid.toFixed(1)}`)
        .join(", ") || "(none)"}`
    );
    return out;
  } catch (e: any) {
    console.warn(`[soft-resume] load failed: ${String(e?.message || e).slice(0, 120)}`);
    return {};
  }
}

let softResumeAnchors: Partial<
  Record<VenueId, { anchorMid: number; gridCount: number }>
> = {};

type Tracked = { levelIndex: number; side: Side; price: number; size: number };

type VenueRuntime = {
  ex: VenueExecutor;
  seeded: boolean;
  active: Map<string, Tracked>;
  completedRungs: number;
  gridProfit: number;
  built: BuiltGrid | null;
  params: GridParams | null;
  anchorMid: number;
  lastError?: string;
  /** 本地 inventory：上一次仓位与成本名义 */
  lastPosition: number | null;
  invCost: number;
  unrealizedPnl: number;
};

/** 用 mid 变动维护本地均价，估浮盈亏（所方无 entry 时兜底） */
function syncInventory(rt: VenueRuntime, position: number, mid: number): number {
  if (!(mid > 0)) {
    rt.unrealizedPnl = 0;
    return 0;
  }
  if (rt.lastPosition == null) {
    rt.lastPosition = position;
    rt.invCost = position * mid;
    rt.unrealizedPnl = 0;
    return 0;
  }
  const prev = rt.lastPosition;
  const d = position - prev;
  if (Math.abs(d) > 1e-12) {
    if (prev === 0) {
      rt.invCost = position * mid;
    } else if (Math.sign(position) !== Math.sign(prev) && Math.abs(position) > 1e-12) {
      // 翻向：剩余新方向按现价建仓
      rt.invCost = position * mid;
    } else if (Math.abs(position) > Math.abs(prev) + 1e-12) {
      // 加仓
      rt.invCost += d * mid;
    } else {
      // 减仓：保留均价
      const avg = prev !== 0 ? rt.invCost / prev : mid;
      rt.invCost = position * avg;
    }
  }
  rt.lastPosition = position;
  rt.unrealizedPnl = position * mid - rt.invCost;
  if (Math.abs(position) < 1e-12) {
    rt.invCost = 0;
    rt.unrealizedPnl = 0;
  }
  return rt.unrealizedPnl;
}

async function ensureAnchored(
  rt: VenueRuntime,
  market: string,
  cfg: RuntimeConfig,
  midHint?: number
): Promise<{ mid: number; snap: Awaited<ReturnType<VenueExecutor["snapshot"]>> }> {
  const snap = await rt.ex.snapshot(market);
  const mid = midHint && midHint > 0 ? midHint : snap.mid;
  if (rt.built && rt.params) return { mid: snap.mid, snap };

  const base = gridFor(cfg, rt.ex.id);
  const resume = softResumeAnchors[rt.ex.id];
  const midForAnchor =
    resume && resume.anchorMid > 0 ? resume.anchorMid : mid;
  if (resume && resume.anchorMid > 0 && Math.abs(midForAnchor - mid) > 1) {
    console.log(
      `[${rt.ex.id}] soft-resume anchorMid=${midForAnchor.toFixed(2)} (live mid=${mid.toFixed(2)})`
    );
  }
  const sizing = resolveLiveSizing(base, snap);
  const anchored = anchorGrid(
    {
      ...base,
      equityUsd: sizing.equityUsd,
      // Extended 的实际账户杠杆可能低于环境模板；定档必须使用真实值，
      // 否则会把“30x 模板”错误套到实际 10x 账户并触发 1140。
      leverage: sizing.leverage ?? base.leverage,
    },
    midForAnchor,
    {
      sizeIncrement: snap.sizeIncrement,
      minOrderSize: snap.minOrderSize,
      minOrderNotionalUsd: snap.minOrderNotionalUsd,
    }
  );
  const built = buildGrid({
    lower: anchored.lower,
    upper: anchored.upper,
    gridCount: anchored.gridCount,
  });
  const risk = computeRisk(built, anchored, midForAnchor);
  const fee = assertFeeOk(risk.spacingPct, anchored.feeRate);
  const margin = assertMarginOk(risk, anchored.equityUsd, anchored.marginFraction);
  const eachSide = anchored.gridCount / 2;
  console.log(
    `[${rt.ex.id}] anchor mid=${midForAnchor.toFixed(2)} → [${anchored.lower.toFixed(2)},${anchored.upper.toFixed(2)}] ≈上下各${eachSide} 共${anchored.gridCount} spacing=${built.spacing} size=${anchored.sizeBase} lev=${anchored.leverage}x`
  );
  if (rt.ex.id === "extended" && sizing.liveEquityUsd != null) {
    console.log(
      `[extended] sizing equity=${sizing.liveEquityUsd.toFixed(4)}U available=${sizing.availableForTradeUsd?.toFixed(4) ?? "n/a"}U recoverable=${sizing.recoverableOrderMarginUsd?.toFixed(4) ?? "n/a"}U effective=${sizing.equityUsd.toFixed(4)}U leverage=${anchored.leverage}x`
    );
  }
  console.log(
    `[${rt.ex.id}] risk notional≈${risk.notional}U margin≈${risk.requiredMargin}U perRung≈${risk.perRungProfit}U spacing=${risk.spacingPct}%`
  );
  console.log(`[${rt.ex.id}] fee: ${fee.message}`);
  console.log(`[${rt.ex.id}] margin: ${margin.message}`);
  if (!fee.ok) throw new Error(`[${rt.ex.id}] ${fee.message}`);
  if (!margin.ok) throw new Error(`[${rt.ex.id}] ${margin.message}`);

  rt.built = built;
  rt.params = anchored;
  rt.anchorMid = midForAnchor;
  // 软启：有旧锚点则视为已铺过，只补漏档、不整表重铺
  if (resume && resume.anchorMid > 0) {
    rt.seeded = true;
  }
  cfg.grids[rt.ex.id] = anchored;
  return { mid: snap.mid, snap };
}

async function tickOne(
  rt: VenueRuntime,
  market: string,
  cfg: RuntimeConfig
): Promise<void> {
  // 紧急暂停：只读刷新看板，绝不 apply（不下单/不撤单/不补单）
  if (isBotPaused()) {
    if (!rt.params || !rt.built) {
      try {
        await ensureAnchored(rt, market, cfg);
      } catch (e: any) {
        console.warn(
          `[${rt.ex.id}] PAUSED ensureAnchored: ${String(e?.message || e).slice(0, 120)}`
        );
      }
    }
    const snap = await rt.ex.snapshot(market);
    syncInventory(rt, snap.position, snap.mid);
    const upnlOfficial =
      snap.unrealizedPnl != null && Number.isFinite(Number(snap.unrealizedPnl))
        ? Number(snap.unrealizedPnl)
        : null;
    rt.unrealizedPnl = upnlOfficial ?? 0;
    const g = rt.params;
    const built = rt.built;
    const off = getOfficialCache()?.venues?.[rt.ex.id];
    upsertDashboardVenue({
      venue: rt.ex.id,
      market,
      mid: snap.mid,
      anchorMid: rt.anchorMid || 0,
      lower: g?.lower || 0,
      upper: g?.upper || 0,
      spacing: built?.spacing || 0,
      sizeBase: g?.sizeBase || 0,
      gridCount: g?.gridCount || gridFor(cfg, rt.ex.id).gridCount,
      position: snap.position,
      leverage: snap.leverage ?? g?.leverage ?? gridFor(cfg, rt.ex.id).leverage,
      openOrders: snap.openOrders.length,
      seeded: rt.seeded,
      completedRungs: rt.completedRungs,
      gridProfit: Number(rt.gridProfit.toFixed(4)),
      unrealizedPnl:
        upnlOfficial != null ? Number(upnlOfficial.toFixed(4)) : undefined,
      equityUsd:
        snap.equityUsd != null && Number.isFinite(snap.equityUsd)
          ? Number(snap.equityUsd.toFixed(4))
          : undefined,
      orders: snap.openOrders.slice(0, 120).map((o) => ({
        side: o.side,
        price: Number(o.price),
      })),
      officialVolume: off?.source === "official" ? off.volume : null,
      officialFees: off?.source === "official" ? off.fees : null,
      officialRealizedPnl: off?.source === "official" ? off.realizedPnl : null,
      officialFills: off?.source === "official" ? off.fills : null,
      officialCloseFills: off?.source === "official" ? off.closeFills : null,
      officialSource: off?.source === "official" ? "official" : "local",
      lastError: undefined,
      updatedAt: new Date().toISOString(),
    });
    console.log(
      `[${rt.ex.id}] PAUSED mid=${snap.mid.toFixed(2)} pos=${snap.position} oo=${snap.openOrders.length}`
    );
    return;
  }

  const { mid, snap } = await ensureAnchored(rt, market, cfg);
  const g = rt.params!;
  const built = rt.built!;
  const posBefore = rt.lastPosition ?? snap.position;
  // 仅维护仓位变化跟踪（开平仓 TG）；浮盈亏看板一律用所方官方字段
  syncInventory(rt, snap.position, snap.mid);
  const upnlOfficial =
    snap.unrealizedPnl != null && Number.isFinite(Number(snap.unrealizedPnl))
      ? Number(snap.unrealizedPnl)
      : null;
  rt.unrealizedPnl = upnlOfficial ?? 0;
  const plan = planFromFillsAndSeed({
    market,
    mid,
    levels: built.levels,
    spacing: built.spacing,
    mode: g.mode,
    sizeBase: g.sizeBase,
    openOrders: snap.openOrders,
    prevActive: rt.active,
    maxWrites: g.maxWritesPerTick,
    seeded: rt.seeded,
    maxOpenOrders: g.maxOpenOrders,
    skipBand: g.skipBand,
    sizeTolerance:
      snap.sizeIncrement != null && snap.sizeIncrement > 0
        ? snap.sizeIncrement / 2
        : undefined,
  });

  // TG / 完成格：按交易所真实仓位变化，不按「挂单 ID 消失」推断（撤补会误报吃格）
  {
    const size = g.sizeBase;
    const perRung = built.spacing * size;
    const posNow = snap.position;
    const thresh = size * 0.35;
    if (size > 0 && Number.isFinite(posBefore) && Math.abs(posNow - posBefore) >= thresh) {
      let sim = posBefore;
      for (let step = 0; step < 40 && Math.abs(posNow - sim) >= thresh; step++) {
        const side: Side = posNow > sim ? "buy" : "sell";
        const { kind, posAfter } = classifyTrade(sim, side, size);
        if (side === "buy" && posAfter > posNow + size * 0.1) break;
        if (side === "sell" && posAfter < posNow - size * 0.1) break;
        sim = posAfter;
        const displayPos = Math.abs(posNow - sim) < thresh ? posNow : sim;
        if (kind === "开多" || kind === "开空") {
          void tgOpen({
            venue: rt.ex.id,
            kind,
            posAfter: displayPos,
            mid: snap.mid,
            fillBase: size,
            openOrders: snap.openOrders,
          });
        } else {
          rt.completedRungs += 1;
          rt.gridProfit += perRung;
          void tgClose({
            venue: rt.ex.id,
            kind,
            posAfter: displayPos,
            mid: snap.mid,
            fillBase: size,
            openOrders: snap.openOrders,
            pnlUsd: perRung,
          });
        }
      }
    }
  }

  console.log(
    `[${rt.ex.id}] mid=${snap.mid.toFixed(2)} pos=${snap.position} oo=${snap.openOrders.length} count=${g.gridCount} spacing=${built.spacing} size=${g.sizeBase} fills=${plan.filled.length} intents=${plan.intents.length} rungs=${rt.completedRungs} profit≈${rt.gridProfit.toFixed(4)} upnl≈${upnlOfficial != null ? upnlOfficial.toFixed(4) : "n/a"}`
  );

  let applyErr: string | undefined;
  if (plan.intents.length) {
    const result = await rt.ex.apply(plan.intents);
    if (result.failed || result.errors.length) {
      console.log(
        `[${rt.ex.id}] apply placed=${result.placed} cancelled=${result.cancelled} failed=${result.failed} ${result.errors.join("; ")}`
      );
      const raw =
        result.errors.slice(0, 2).join("; ") || `failed=${result.failed}`;
      void tgError(rt.ex.id, raw);
      // 穿价/post-only 类：不提醒也不挂看板红字（下轮会重试）
      if (!isSoftPlaceError(rt.ex.id, raw)) applyErr = raw;
    }
  }

  rt.active = plan.nextActive;
  rt.seeded = true;
  rt.lastError = applyErr;

  const off = getOfficialCache()?.venues?.[rt.ex.id];
  upsertDashboardVenue({
    venue: rt.ex.id,
    market,
    mid: snap.mid,
    anchorMid: rt.anchorMid,
    lower: g.lower,
    upper: g.upper,
    spacing: built.spacing,
    sizeBase: g.sizeBase,
    gridCount: g.gridCount,
    position: snap.position,
    leverage: snap.leverage ?? g.leverage,
    openOrders: snap.openOrders.length,
    seeded: rt.seeded,
    completedRungs: rt.completedRungs,
    gridProfit: Number(rt.gridProfit.toFixed(4)),
    unrealizedPnl:
      upnlOfficial != null ? Number(upnlOfficial.toFixed(4)) : undefined,
    equityUsd:
      snap.equityUsd != null && Number.isFinite(snap.equityUsd)
        ? Number(snap.equityUsd.toFixed(4))
        : undefined,
    orders: snap.openOrders.slice(0, 120).map((o) => ({
      side: o.side,
      price: Number(o.price),
    })),
    officialVolume: off?.source === "official" ? off.volume : null,
    officialFees: off?.source === "official" ? off.fees : null,
    officialRealizedPnl: off?.source === "official" ? off.realizedPnl : null,
    officialFills: off?.source === "official" ? off.fills : null,
    officialCloseFills: off?.source === "official" ? off.closeFills : null,
    officialSource: off?.source === "official" ? "official" : "local",
    lastError: applyErr,
    updatedAt: new Date().toISOString(),
  });
}

export async function runLoop(opts?: {
  once?: boolean;
  installSignalHandlers?: boolean;
  exitOnStop?: boolean;
  serveDashboard?: boolean;
  refreshOfficialStats?: boolean;
}): Promise<void> {
  const cfg = loadRuntimeConfig();
  assertLiveAllowed(cfg);
  softResumeAnchors = loadSoftResumeAnchors();
  loadBotPauseState();
  if (isBotPaused()) {
    console.warn("[bot-control] starting in PAUSED mode（data/bot-paused.json）");
  }

  console.log(
    `classic-grid start dryRun=${cfg.dryRun} venues=${cfg.venues.join(",")} markets=${cfg.markets.join(",")} tickMs=${cfg.tickMs}`
  );
  const gridSummary = cfg.venues
    .map((id) => {
      const g = cfg.grids[id];
      return `${id}=${g.gridCount}g/${g.leverage}x`;
    })
    .join(" ");
  void tgBoot(
    `dryRun=${cfg.dryRun}\nvenues=${cfg.venues.join(",")}\nmarkets=${cfg.markets.join(",")}\n` +
      `tickMs=${cfg.tickMs}\nmarginFrac=${cfg.grids[cfg.venues[0]]?.marginFraction ?? ""}\n` +
      gridSummary
  );

  setDashboardMeta({ dryRun: cfg.dryRun });
  const dash = opts?.serveDashboard === false ? null : startDashboardServer(cfg.dashboardPort);

  // 后台拉官方日统计（不阻塞启动）
  if (opts?.refreshOfficialStats !== false) {
    void refreshOfficialStats({ force: true })
      .then((b) => setDashboardOfficial(b))
      .catch((e) => console.error(`[official] refresh failed: ${String(e?.message || e).slice(0, 160)}`));
  }

  let lastHourlyKey = "";
  let lastOfficialDashAt = 0;
  const maybeHourlyTg = async () => {
    const now = new Date();
    const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
    if (key === lastHourlyKey) return;
    // 整点后 2 分钟内触发，避免刚启动连发
    if (now.getMinutes() > 5 && lastHourlyKey !== "") return;
    if (now.getMinutes() > 5 && lastHourlyKey === "") {
      // 启动不在整点：跳过，等下一整点
      lastHourlyKey = key;
      return;
    }
    try {
      const bundle = await refreshOfficialStats({ force: true, minIntervalMs: 0 });
      setDashboardOfficial(bundle);
      const snap = getDashboardSnapshot();
      const venues = snap.venues || [];
      const equitySum = venues.reduce((s, v) => s + (Number(v.equityUsd) || 0), 0);
      const oo = venues.reduce((s, v) => s + (Number(v.openOrders) || 0), 0);
      const expectOo = venues.reduce((s, v) => {
        const gc = Number(v.gridCount) || 0;
        return s + (gc > 0 ? gc : 0);
      }, 0);
      const healthy = venues.filter((v) => !v.lastError && v.seeded).length;
      let vol = 0;
      let fees = 0;
      let vn = 0;
      let fn = 0;
      for (const id of Object.keys(bundle.venues || {}) as VenueId[]) {
        const o = bundle.venues?.[id];
        if (!o || o.source !== "official") continue;
        if (o.volume != null && Number.isFinite(o.volume)) {
          vol += o.volume;
          vn++;
        }
        if (o.fees != null && Number.isFinite(o.fees)) {
          fees += o.fees;
          fn++;
        }
      }
      const cal = snap.ledger?.calendar || [];
      const todayRow =
        cal.find((r) => r.day === snap.ledger?.dayKey) || cal[0];
      const dayProfit =
        todayRow != null && Number.isFinite(Number(todayRow.dayProfit))
          ? Number(todayRow.dayProfit)
          : null;
      lastHourlyKey = key;
      await tgDailyOverview({
        dayKey: snap.ledger?.dayKey || bundle.dayKey || key,
        dayProfit,
        equity: equitySum > 0 ? equitySum : null,
        volume: vn > 0 ? vol : null,
        fees: fn > 0 ? fees : null,
        openOrders: oo,
        expectOrders: expectOo,
        healthy,
        totalVenues: venues.length || 5,
      });
    } catch (e: any) {
      console.error(`[tg-hourly] ${String(e?.message || e).slice(0, 160)}`);
    }
  };

  const saved = loadVenueSessionCounters();
  const runtimes: VenueRuntime[] = [];
  for (const venue of cfg.venues) {
    const prev = saved[venue];
    if (prev && (prev.completedRungs > 0 || prev.gridProfit > 0)) {
      console.log(
        `[${venue}] restore ledger rungs=${prev.completedRungs} profit≈${prev.gridProfit.toFixed(4)}`
      );
    }
    runtimes.push({
      ex: createExecutor(venue, cfg.dryRun),
      seeded: false,
      active: new Map(),
      completedRungs: prev?.completedRungs || 0,
      gridProfit: prev?.gridProfit || 0,
      built: null,
      params: null,
      anchorMid: 0,
      lastPosition: prev?.position ?? null,
      invCost:
        prev?.position != null && prev?.mid != null
          ? Number(prev.position) * Number(prev.mid)
          : 0,
      unrealizedPnl: 0,
    });
  }

  for (const rt of runtimes) {
    try {
      await rt.ex.connect();
      console.log(`[${rt.ex.id}] connected`);
    } catch (e: any) {
      const msg = String(e?.message || e).slice(0, 200);
      console.error(`[${rt.ex.id}] connect failed: ${msg}`);
      rt.lastError = msg;
      void tgError(rt.ex.id, `connect failed: ${msg}`);
      upsertDashboardVenue({
        venue: rt.ex.id,
        market: cfg.markets[0] || "BTC",
        mid: 0,
        anchorMid: 0,
        lower: 0,
        upper: 0,
        spacing: 0,
        sizeBase: 0,
        gridCount: gridFor(cfg, rt.ex.id).gridCount,
            position: 0,
            leverage: gridFor(cfg, rt.ex.id).leverage,
        openOrders: 0,
        seeded: false,
        completedRungs: 0,
        gridProfit: 0,
        unrealizedPnl: 0,
        lastError: msg,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  const stop = async () => {
    if (dash) {
      try {
        dash.close();
      } catch {
        /* ignore */
      }
    }
    for (const rt of runtimes) {
      try {
        rt.ex.disconnect();
      } catch {
        /* ignore */
      }
    }
    process.exit(0);
  };
  if (opts?.installSignalHandlers !== false) {
    process.on("SIGINT", () => void stop());
    process.on("SIGTERM", () => void stop());
  }

  do {
    for (const market of cfg.markets) {
      for (const rt of runtimes) {
        try {
          // 首连失败（如 Ext 429）时每轮重试，避免整场卡死
          if (!rt.seeded && rt.lastError) {
            try {
              rt.ex.disconnect();
            } catch {
              /* ignore */
            }
            await rt.ex.connect();
            console.log(`[${rt.ex.id}] reconnected`);
            rt.lastError = undefined;
          }
          await tickOne(rt, market, cfg);
        } catch (e: any) {
          const msg = String(e?.message || e).slice(0, 200);
          const transient = isTransientReadError(msg);
          console.error(
            `[${rt.ex.id}] tick failed${transient ? " (transient)" : ""}: ${msg}`
          );
          // 瞬时读失败：保留上次看板，不标异常、不把仓位/挂单刷成 0（绝不因此撤单）
          if (!transient) {
            rt.lastError = msg;
            void tgError(rt.ex.id, `tick failed: ${msg}`);
          } else {
            rt.lastError = undefined;
            void tgError(rt.ex.id, `tick failed: ${msg}`);
          }
          const prev = getDashboardSnapshot().venues.find(
            (v) => v.venue === rt.ex.id
          );
          upsertDashboardVenue({
            venue: rt.ex.id,
            market,
            mid: transient && prev?.mid ? prev.mid : 0,
            anchorMid: rt.anchorMid || prev?.anchorMid || 0,
            lower: rt.params?.lower || prev?.lower || 0,
            upper: rt.params?.upper || prev?.upper || 0,
            spacing: rt.built?.spacing || prev?.spacing || 0,
            sizeBase: rt.params?.sizeBase || prev?.sizeBase || 0,
            gridCount:
              gridFor(cfg, rt.ex.id).gridCount || prev?.gridCount || 0,
            position:
              transient && prev && Number.isFinite(prev.position)
                ? prev.position
                : 0,
            leverage: rt.params?.leverage ?? prev?.leverage ?? gridFor(cfg, rt.ex.id).leverage,
            openOrders:
              transient && prev && Number.isFinite(prev.openOrders)
                ? prev.openOrders
                : 0,
            seeded: rt.seeded,
            completedRungs: rt.completedRungs,
            gridProfit: Number(rt.gridProfit.toFixed(4)),
            unrealizedPnl: Number(rt.unrealizedPnl.toFixed(4)),
            equityUsd: transient ? prev?.equityUsd : undefined,
            orders: transient ? prev?.orders : undefined,
            officialVolume: prev?.officialVolume,
            officialFees: prev?.officialFees,
            officialRealizedPnl: prev?.officialRealizedPnl,
            officialFills: prev?.officialFills,
            officialCloseFills: prev?.officialCloseFills,
            officialSource: prev?.officialSource,
            lastError: transient ? undefined : msg,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }
    void maybeHourlyTg();
    // 看板官方统计：约 5 分钟一轮（过勤会堆内存，且 Extended 易与下单抢 429）
    if (opts?.refreshOfficialStats !== false && Date.now() - lastOfficialDashAt > 300_000) {
      lastOfficialDashAt = Date.now();
      void refreshOfficialStats({ force: true, minIntervalMs: 240_000 })
        .then((b) => setDashboardOfficial(b))
        .catch(() => {});
    }
    if (opts?.once) break;
    await sleep(cfg.tickMs);
  } while (true);

  if (opts?.exitOnStop === false) {
    if (dash) dash.close();
    for (const rt of runtimes) rt.ex.disconnect();
    return;
  }
  await stop();
}

export async function runStatus(): Promise<void> {
  const cfg = loadRuntimeConfig();
  const dry = cfg.dryRun;
  if (dry) {
    console.log("status: DRY_RUN=1 → 假 snapshot（设 DRY_RUN=0 可读实盘，仍不下单）");
  }
  for (const venue of cfg.venues) {
    const ex = createExecutor(venue, dry);
    try {
      await ex.connect();
      for (const market of cfg.markets) {
        const snap = await ex.snapshot(market);
        const anchored = snap.mid > 0 ? anchorGrid(gridFor(cfg, venue), snap.mid) : gridFor(cfg, venue);
        console.log(
          JSON.stringify(
            {
              venue: snap.venue,
              market: snap.market,
              mid: snap.mid,
              position: snap.position,
              openOrders: snap.openOrders.length,
              grid: anchored,
              sample: snap.openOrders.slice(0, 3),
            },
            null,
            2
          )
        );
      }
    } catch (e: any) {
      console.error(`[${venue}] ${String(e?.message || e).slice(0, 300)}`);
    } finally {
      ex.disconnect();
    }
  }
}

export async function runFlat(): Promise<void> {
  const cfg = loadRuntimeConfig();
  assertLiveAllowed(cfg);
  if (cfg.dryRun) {
    console.log("flat: DRY_RUN=1 → 只打印，不撤单/清仓");
  }
  for (const venue of cfg.venues) {
    const ex = createExecutor(venue, cfg.dryRun);
    try {
      await ex.connect();
      for (const market of cfg.markets) {
        try {
          await ex.cancelAll(market);
          console.log(`[${venue}] cancelAll ${market} done`);
        } catch (e: any) {
          console.error(
            `[${venue}] cancelAll failed: ${String(e?.message || e).slice(0, 300)}`
          );
        }
        try {
          await ex.closePosition(market);
          console.log(`[${venue}] closePosition ${market} done`);
        } catch (e: any) {
          console.error(
            `[${venue}] closePosition failed: ${String(e?.message || e).slice(0, 300)}`
          );
        }
        try {
          const snap = await ex.snapshot(market);
          console.log(
            `[${venue}] after flat pos=${snap.position} oo=${snap.openOrders.length}`
          );
        } catch {
          /* ignore */
        }
      }
    } catch (e: any) {
      console.error(`[${venue}] flat failed: ${String(e?.message || e).slice(0, 300)}`);
    } finally {
      ex.disconnect();
    }
  }
}
