import fs from "node:fs";
import path from "node:path";
import type { DashboardVenueRow } from "./dashboard";

const LEDGER_PATH = () => path.resolve(process.cwd(), "data", "ledger.json");

export type LedgerDay = {
  day: string;
  /** 当日网格毛利累计（估计，仅参考） */
  gridProfit: number;
  /** 今日赚/亏 = 总余额 − 日切开盘总余额（交易所权益） */
  dayProfit: number;
  /** @deprecated 本地完成格估算；看板成交量一律用 officialVolume */
  todayVolume: number;
  /** 各所官方今日成交名义合计（Asia/Shanghai 日切） */
  officialVolume?: number;
  /** 官方今日已实现盈亏（未扣手续费） */
  officialRealizedPnl?: number;
  /** 官方今日手续费 */
  officialFees?: number;
  /** 看板今日盈亏统一口径：官方已实现盈亏 − 官方手续费 */
  officialNetPnl?: number;
  /** 官方盈亏/成交量覆盖的已启用场所数 */
  officialPnlVenues?: number;
  officialVolumeVenues?: number;
  /** 官方成交笔数与平仓成交数 */
  officialFills?: number;
  officialCompletedRungs?: number;
  equity: number;
  equityChange: number;
  updatedAt: string;
};

export type CapitalFlow = {
  day: string;
  venue: string;
  /** 对账户权益的符号影响：入金为正，出金/提现为负 */
  amount: number;
  at: string;
  note?: string;
};

export type LedgerState = {
  dayKey: string;
  /** @deprecated 旧「完成格净值」基准，不再用于今日赚/亏 */
  dayOpenProfit: number | null;
  /** 当日首见（或日切后）权益合计基准 */
  dayOpenEquity: number | null;
  /**
   * 已计入 dayOpenEquity 的所。新所当日首次入账（入金）会并入开盘基准，
   * 避免「今日盈亏」被新入金抬高。
   */
  venuesInOpenEquity?: string[];
  /** 出入金流水（已同步调整 dayOpenEquity，不进今日盈亏） */
  capitalFlows?: CapitalFlow[];
  calendar: LedgerDay[];
  /** venue -> last seen counters */
  last: Record<
    string,
    {
      completedRungs: number;
      gridProfit: number;
      unrealizedPnl: number;
      mid: number;
      sizeBase: number;
      /** 上轮真实仓位；Vercel 每轮重建运行器时用于识别跨轮成交 */
      position?: number;
      /** 最近一次计入总权益的权益，所退出时用于扣开盘基准 */
      equityUsd?: number;
    }
  >;
  combined: {
    todayVolume: number;
    volumeWindow: string;
  };
};

/**
 * 启动时恢复当日各所已累计的完成格/毛利（写在 ledger.last）。
 * 跨日切日会清空 last，次日自然从 0 开始。
 */
export function loadVenueSessionCounters(): Record<
  string,
  { completedRungs: number; gridProfit: number; position?: number; mid?: number }
> {
  try {
    const state = loadLedger();
    if (state.dayKey !== shanghaiDayKey()) return {};
    const out: Record<
      string,
      { completedRungs: number; gridProfit: number; position?: number; mid?: number }
    > = {};
    for (const [k, v] of Object.entries(state.last || {})) {
      out[k] = {
        completedRungs: Number(v?.completedRungs) || 0,
        gridProfit: Number(v?.gridProfit) || 0,
        position: Number.isFinite(Number(v?.position)) ? Number(v.position) : undefined,
        mid: Number.isFinite(Number(v?.mid)) ? Number(v.mid) : undefined,
      };
    }
    return out;
  } catch {
    return {};
  }
}

function shanghaiDayKey(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function round(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

function emptyState(): LedgerState {
  const dayKey = shanghaiDayKey();
  return {
    dayKey,
    dayOpenProfit: null,
    dayOpenEquity: null,
    capitalFlows: [],
    calendar: [
      {
        day: dayKey,
        gridProfit: 0,
        dayProfit: 0,
        todayVolume: 0,
        equity: 0,
        equityChange: 0,
        updatedAt: new Date().toISOString(),
      },
    ],
    last: {},
    combined: {
      todayVolume: 0,
      volumeWindow: "官方各所今日成交合计 · Asia/Shanghai 日切",
    },
  };
}

export function loadLedger(): LedgerState {
  try {
    const p = LEDGER_PATH();
    if (!fs.existsSync(/* turbopackIgnore: true */ p)) return emptyState();
    const raw = fs.readFileSync(/* turbopackIgnore: true */ p, "utf8").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(raw) as LedgerState;
    if (!parsed || !Array.isArray(parsed.calendar)) return emptyState();
    parsed.dayKey = parsed.dayKey || shanghaiDayKey();
    parsed.last = parsed.last && typeof parsed.last === "object" ? parsed.last : {};
    parsed.combined = parsed.combined && typeof parsed.combined === "object"
      ? parsed.combined
      : { todayVolume: 0, volumeWindow: "官方各所今日成交合计 · Asia/Shanghai 日切" };
    if (parsed.dayOpenProfit === undefined) parsed.dayOpenProfit = null;
    if (parsed.dayOpenEquity === undefined) parsed.dayOpenEquity = null;
    if (!Array.isArray(parsed.capitalFlows)) parsed.capitalFlows = [];
    return parsed;
  } catch {
    return emptyState();
  }
}

function saveLedger(state: LedgerState): void {
  const dir = path.dirname(LEDGER_PATH());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(LEDGER_PATH(), JSON.stringify(state, null, 2), "utf8");
}

/** 当日出入金净值：入金为正、提现为负（对权益的影响） */
export function capitalFlowNetForDay(
  state: LedgerState,
  day = state.dayKey || shanghaiDayKey()
): number {
  let n = 0;
  for (const f of state.capitalFlows || []) {
    if (f.day !== day) continue;
    const a = Number(f.amount);
    if (Number.isFinite(a)) n += a;
  }
  return round(n);
}

/**
 * 登记出入金：同步调整 dayOpenEquity，使今日盈亏不含资金进出。
 * amount：入金为正，提现/出金为负。
 */
export function applyCapitalFlow(input: {
  venue: string;
  amount: number;
  note?: string;
}): LedgerState {
  const state = loadLedger();
  if (!Array.isArray(state.capitalFlows)) state.capitalFlows = [];
  const today = ensureToday(state);
  const amount = round(Number(input.amount));
  if (!Number.isFinite(amount) || amount === 0) {
    throw new Error("capital flow amount 必须是非 0 数字（入金为正，提现为负）");
  }
  const venue = String(input.venue || "manual").trim() || "manual";
  const day = state.dayKey || shanghaiDayKey();
  const note = input.note ? String(input.note).slice(0, 200) : undefined;

  // 同日同所同金额同备注 → 视为已登记，避免重复扣基准
  const dup = (state.capitalFlows || []).some(
    (f) =>
      f.day === day &&
      f.venue === venue &&
      Number(f.amount) === amount &&
      (f.note || "") === (note || "")
  );
  if (dup) {
    console.log(`[ledger] capital flow skip duplicate ${venue} ${amount}`);
    return state;
  }

  state.capitalFlows.push({
    day,
    venue,
    amount,
    at: new Date().toISOString(),
    note,
  });

  if (state.dayOpenEquity == null) {
    state.dayOpenEquity = Number(today.equity) || 0;
  }
  state.dayOpenEquity = round(Number(state.dayOpenEquity) + amount);

  const net = capitalFlowNetForDay(state, day);
  if (!(today.officialNetPnl != null && Number.isFinite(Number(today.officialNetPnl)))) {
    today.dayProfit = round(Number(today.equity) - Number(state.dayOpenEquity));
  }
  const yesterday = state.calendar.find((d) => d.day !== today.day);
  if (yesterday && Number(yesterday.equity) > 0) {
    today.equityChange = round(
      Number(today.equity) - Number(yesterday.equity) - net
    );
  } else {
    today.equityChange = today.dayProfit;
  }
  today.updatedAt = new Date().toISOString();
  state.calendar = [today, ...state.calendar.filter((d) => d.day !== today.day)];
  saveLedger(state);
  console.log(
    `[ledger] capital flow ${venue} ${amount > 0 ? "+" : ""}${amount}U → open=${Number(
      state.dayOpenEquity
    ).toFixed(2)} dayProfit=${today.dayProfit}`
  );
  return state;
}

function ensureToday(state: LedgerState): LedgerDay {
  const dayKey = shanghaiDayKey();
  if (state.dayKey !== dayKey) {
    // 日切：固化昨日，开新日
    state.dayKey = dayKey;
    state.last = {};
    state.combined.todayVolume = 0;
    state.dayOpenProfit = null;
    state.dayOpenEquity = null;
    state.venuesInOpenEquity = [];
    const prev = state.calendar[0];
    state.calendar.unshift({
      day: dayKey,
      gridProfit: 0,
      dayProfit: 0,
      todayVolume: 0,
      equity: prev?.equity ?? 0,
      equityChange: 0,
      updatedAt: new Date().toISOString(),
    });
    // 保留最近 60 天
    if (state.calendar.length > 60) state.calendar = state.calendar.slice(0, 60);
  }
  let today = state.calendar.find((d) => d.day === dayKey);
  if (!today) {
    today = {
      day: dayKey,
      gridProfit: 0,
      dayProfit: 0,
      todayVolume: 0,
      equity: 0,
      equityChange: 0,
      updatedAt: new Date().toISOString(),
    };
    state.calendar.unshift(today);
  }
  return today;
}

/** 用各所看板行推进账本：今日赚/亏按权益差；完成格仅估成交量与参考毛利 */
export function ingestVenuesForLedger(venues: DashboardVenueRow[]): LedgerState {
  const state = loadLedger();
  if (state.dayOpenEquity === undefined) state.dayOpenEquity = null;
  const today = ensureToday(state);

  let totalProfit = 0;
  let totalEquity = 0;
  let equityCount = 0;
  let volDelta = 0;

  for (const v of venues) {
    const key = v.venue;
    const prev = state.last[key];
    let rungs = Number(v.completedRungs) || 0;
    let profit = Number(v.gridProfit) || 0;
    const upnl = Number(v.unrealizedPnl) || 0;
    const mid = Number(v.mid) || 0;
    const size = Number(v.sizeBase) || 0;
    const eq = Number(v.equityUsd);
    if (Number.isFinite(eq) && eq > 0) {
      totalEquity += eq;
      equityCount += 1;
    }

    // 重启瞬间内存计数归 0、但账本里已有更高累计 → 不回写下、不重复计成交量
    if (prev && rungs < prev.completedRungs) {
      rungs = prev.completedRungs;
      profit = Math.max(profit, prev.gridProfit);
    }

    totalProfit += profit;

    if (prev) {
      const dRungs = Math.max(0, rungs - prev.completedRungs);
      const px = mid > 0 ? mid : prev.mid;
      const sz = size > 0 ? size : prev.sizeBase;
      if (dRungs > 0 && px > 0 && sz > 0) {
        volDelta += dRungs * sz * px;
      }
    }
    state.last[key] = {
      completedRungs: rungs,
      gridProfit: profit,
      unrealizedPnl: upnl,
      mid,
      sizeBase: size,
      position: Number.isFinite(Number(v.position)) ? Number(v.position) : undefined,
      equityUsd:
        Number.isFinite(eq) && eq > 0
          ? eq
          : Number(prev?.equityUsd) > 0
            ? Number(prev?.equityUsd)
            : undefined,
    };
  }

  // 所从看板消失（暂停/下线）：从开盘基准扣回其上次权益，避免今日盈亏被坑成大负
  if (
    state.dayOpenEquity != null &&
    Array.isArray(state.venuesInOpenEquity) &&
    state.venuesInOpenEquity.length
  ) {
    const present = new Set(venues.map((v) => v.venue));
    const keep: string[] = [];
    for (const id of state.venuesInOpenEquity) {
      if (present.has(id)) {
        keep.push(id);
        continue;
      }
      const lastEq = Number(state.last[id]?.equityUsd);
      if (Number.isFinite(lastEq) && lastEq > 0) {
        state.dayOpenEquity = round(Number(state.dayOpenEquity) - lastEq);
        console.log(
          `[ledger] 所退出 ${id} 扣开盘基准 ${lastEq.toFixed(2)}U → open=${Number(
            state.dayOpenEquity
          ).toFixed(2)}`
        );
      } else {
        console.log(
          `[ledger] 所退出 ${id} 无上次权益记录，未改开盘基准（需人工核对）`
        );
      }
      delete state.last[id];
    }
    state.venuesInOpenEquity = keep;
  }

  // 本地完成格估算不再写入对外成交量（看板/TG/日历一律官方）
  void volDelta;

  // 参考毛利只增不减（防重启写回低于已记账）
  today.gridProfit = round(Math.max(today.gridProfit || 0, totalProfit));

  const yesterday = state.calendar.find((d) => d.day !== today.day);
  if (equityCount > 0) {
    today.equity = round(totalEquity);

    // 旧账本无 venuesInOpenEquity：先按 last 里「非本次新入金所」占位，
    // 再让下面的新所逻辑把 phoenix 等入金并入开盘基准（只补一次）。
    if (!Array.isArray(state.venuesInOpenEquity)) {
      const known = Object.keys(state.last || {});
      // 若 phoenix 已在 last，仍视为未计入开盘（今日中途接入），需并入基准
      state.venuesInOpenEquity = known.filter(
        (k) => k !== "phoenix" && k !== "phoenix2"
      );
    }

    if (state.dayOpenEquity == null) {
      // 优先用昨日收盘权益作今日开盘；没有则冻结当前权益（当日差从 0 起）
      if (yesterday && Number(yesterday.equity) > 0) {
        state.dayOpenEquity = Number(yesterday.equity);
      } else {
        state.dayOpenEquity = today.equity;
      }
      state.venuesInOpenEquity = venues
        .filter((v) => {
          const e = Number(v.equityUsd);
          return Number.isFinite(e) && e > 0;
        })
        .map((v) => v.venue);
    } else {
      for (const v of venues) {
        const eq = Number(v.equityUsd);
        if (!(Number.isFinite(eq) && eq > 0)) continue;
        if (state.venuesInOpenEquity.includes(v.venue)) continue;
        // 新所当日入账（含入金）：并入开盘基准，不进今日盈亏
        state.dayOpenEquity = round(Number(state.dayOpenEquity) + eq);
        state.venuesInOpenEquity.push(v.venue);
        console.log(
          `[ledger] 新所 ${v.venue} 权益 ${eq.toFixed(2)}U 并入开盘基准（不计今日盈亏）`
        );
      }
    }

    // 官方已实现净盈亏可用时，禁止再用余额日差覆盖；余额仍保留作总权益展示。
    if (!(today.officialNetPnl != null && Number.isFinite(Number(today.officialNetPnl)))) {
      today.dayProfit = round(today.equity - state.dayOpenEquity);
    }
    const flowNet = capitalFlowNetForDay(state, today.day);
    if (yesterday && Number(yesterday.equity) > 0) {
      // 相对昨日余额变化，剔除出入金
      today.equityChange = round(
        today.equity - Number(yesterday.equity) - flowNet
      );
    } else {
      today.equityChange = today.dayProfit;
    }
  }

  today.updatedAt = new Date().toISOString();

  state.calendar = [today, ...state.calendar.filter((d) => d.day !== today.day)];
  saveLedger(state);
  return state;
}

export function ledgerPublicView(state: LedgerState = loadLedger()) {
  const dayKey = state.dayKey || shanghaiDayKey();
  const flowNet = capitalFlowNetForDay(state, dayKey);
  const flowsToday = (state.capitalFlows || []).filter((f) => f.day === dayKey);
  return {
    dayKey,
    capitalFlowNet: flowNet,
    capitalFlowsToday: flowsToday,
    calendar: state.calendar.map((d) => {
      const official =
        d.officialVolume != null && Number.isFinite(Number(d.officialVolume))
          ? Number(d.officialVolume)
          : null;
      return {
        day: d.day,
        /** 对外只暴露官方量；无官方则为 null（禁止回退本地估算） */
        todayVolume: official,
        officialVolume: official,
        volume: official,
        equity: d.equity,
        equityChange: d.equityChange,
        dayProfit: d.dayProfit,
        gridProfit: d.gridProfit,
        officialRealizedPnl: d.officialRealizedPnl ?? null,
        officialFees: d.officialFees ?? null,
        officialNetPnl: d.officialNetPnl ?? null,
        officialPnlVenues: d.officialPnlVenues ?? 0,
        officialVolumeVenues: d.officialVolumeVenues ?? 0,
        officialFills: d.officialFills ?? null,
        officialCompletedRungs: d.officialCompletedRungs ?? null,
        profitSource:
          d.officialNetPnl != null && Number.isFinite(Number(d.officialNetPnl))
            ? "official-realized-minus-fees"
            : "equity-delta-fallback",
      };
    }),
    combined: state.combined,
  };
}

/** 用官方今日成交合计写入当日日历（看板专用；不动网格） */
export function recordOfficialDayVolume(totalVolume: number): LedgerState {
  const state = loadLedger();
  const today = ensureToday(state);
  if (Number.isFinite(totalVolume) && totalVolume >= 0) {
    today.officialVolume = round(totalVolume);
    // combined.todayVolume 对外也跟官方，避免别处再读到本地估算
    state.combined.todayVolume = today.officialVolume;
    state.combined.volumeWindow = "官方各所今日成交合计 · Asia/Shanghai 日切";
    today.updatedAt = new Date().toISOString();
    state.calendar = [today, ...state.calendar.filter((d) => d.day !== today.day)];
    saveLedger(state);
  }
  return state;
}

/** 写入官方今日统计，并把今日盈亏切换为“已实现盈亏 − 手续费”口径。 */
export function recordOfficialDayStatistics(input: {
  volume: number | null;
  volumeVenues: number;
  realizedPnl: number | null;
  fees: number | null;
  netPnl: number | null;
  pnlVenues: number;
  fills: number | null;
  completedRungs: number | null;
}): LedgerState {
  const state = loadLedger();
  const today = ensureToday(state);
  if (input.volume != null && Number.isFinite(input.volume) && input.volume >= 0) {
    today.officialVolume = round(input.volume);
    today.officialVolumeVenues = Math.max(0, Math.floor(input.volumeVenues));
    state.combined.todayVolume = today.officialVolume;
    state.combined.volumeWindow = "官方各所今日成交合计 · Asia/Shanghai 日切";
  }
  if (input.netPnl != null && Number.isFinite(input.netPnl)) {
    today.officialRealizedPnl = round(Number(input.realizedPnl) || 0);
    today.officialFees = round(Math.abs(Number(input.fees) || 0));
    today.officialNetPnl = round(input.netPnl);
    today.officialPnlVenues = Math.max(0, Math.floor(input.pnlVenues));
    today.dayProfit = today.officialNetPnl;
  }
  if (input.fills != null && Number.isFinite(input.fills)) {
    today.officialFills = Math.max(0, Math.floor(input.fills));
  }
  if (input.completedRungs != null && Number.isFinite(input.completedRungs)) {
    today.officialCompletedRungs = Math.max(0, Math.floor(input.completedRungs));
  }
  today.updatedAt = new Date().toISOString();
  state.calendar = [today, ...state.calendar.filter((d) => d.day !== today.day)];
  saveLedger(state);
  return state;
}

/** 工作流私有持久态；API 层会在响应前剥离。 */
export function getLedgerStateForPersistence(): LedgerState {
  return loadLedger();
}

/** 回填历史某日官方成交量（仅看板账本） */
export function patchOfficialVolumeForDay(day: string, volume: number): LedgerState {
  const state = loadLedger();
  ensureToday(state);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("bad day");
  if (!(Number.isFinite(volume) && volume >= 0)) throw new Error("bad volume");
  let row = state.calendar.find((d) => d.day === day);
  if (!row) {
    row = {
      day,
      gridProfit: 0,
      dayProfit: 0,
      todayVolume: 0,
      equity: 0,
      equityChange: 0,
      updatedAt: new Date().toISOString(),
    };
    state.calendar.push(row);
  }
  row.officialVolume = round(volume);
  row.updatedAt = new Date().toISOString();
  state.calendar = [
    ...state.calendar.filter((d) => d.day === state.dayKey),
    ...state.calendar
      .filter((d) => d.day !== state.dayKey)
      .sort((a, b) => b.day.localeCompare(a.day)),
  ];
  saveLedger(state);
  return state;
}

/** 日历只保留 keepFromDay（含）之后的日期 */
export function trimLedgerCalendar(keepFromDay: string): LedgerState {
  const state = loadLedger();
  ensureToday(state);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(keepFromDay)) throw new Error("bad day");
  state.calendar = state.calendar
    .filter((d) => String(d.day) >= keepFromDay)
    .sort((a, b) => {
      if (a.day === state.dayKey) return -1;
      if (b.day === state.dayKey) return 1;
      return b.day.localeCompare(a.day);
    });
  saveLedger(state);
  return state;
}
