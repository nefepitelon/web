const DAY = 86400000;
export const REFERENCE_SPANS = [
  { cycle: "2017–2019", months: 14, kind: "supplied-reference" },
  { cycle: "2021–2023", months: 13, kind: "supplied-reference" },
  { cycle: "2025–2026", months: 11, kind: "supplied-reference-not-live" }
];

export function parseDailyPairs(payload, { positive = false } = {}) {
  if (!Array.isArray(payload)) throw new Error("Invalid public daily series");
  const dates = new Map();
  for (const row of payload) {
    if (!Array.isArray(row) || typeof row[0] !== "number" || typeof row[1] !== "number"
      || !Number.isFinite(row[0]) || !Number.isFinite(row[1]) || (positive ? row[1] <= 0 : row[1] < 0)) continue;
    const date = new Date(row[0] < 1e11 ? row[0] * 1000 : row[0]);
    if (!Number.isFinite(date.getTime())) continue;
    dates.set(date.toISOString().slice(0, 10), row[1]);
  }
  return [...dates].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
}

export function mergeDailyRows(...histories) {
  const dates = new Map();
  for (const rows of histories) for (const row of rows || []) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(Date.parse(row.date))
      && Number.isFinite(row.value) && row.value >= 0) dates.set(row.date, row.value);
  }
  return [...dates].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
}

// Explicit public reconstruction; the screenshot does not publish its formula.
// Windows use calendar days and only actual past observations. Isolated missing
// days remain missing; they must not restart a whole year of warm-up.
export function calculateRplrmSeries(ratioRows, priceRows) {
  const prices = new Map(priceRows.map(row => [row.date, row.value]));
  const ratios = mergeDailyRows(ratioRows);
  const queue = [], short = [];
  let sum365 = 0, sum7 = 0, firstTime = null;
  const result = [];
  for (const row of ratios) {
    const time = Date.parse(row.date);
    firstTime ??= time;
    queue.push({ time, value: row.value }); short.push({ time, value: row.value });
    sum365 += row.value; sum7 += row.value;
    while (queue[0]?.time < time - 364 * DAY) sum365 -= queue.shift().value;
    while (short[0]?.time < time - 6 * DAY) sum7 -= short.shift().value;
    if (time - firstTime < 364 * DAY || queue.length < 330 || short.length < 5
      || sum365 <= 0 || !Number.isFinite(prices.get(row.date))) continue;
    const ratio7 = sum7 / short.length, ratio365 = sum365 / queue.length;
    const momentum = ratio7 / ratio365;
    if (!Number.isFinite(momentum) || momentum < 0) continue;
    result.push({ date: row.date, price: prices.get(row.date), ratio: row.value, coverage7: short.length, coverage365: queue.length,
      ratio7, ratio365, momentum, profitMomentum: Math.max(momentum - 1, 0),
      lossMomentum: momentum > 0 ? Math.min(1 - 1 / momentum, 0) : null, state: (momentum - 1) / (momentum + 1) });
  }
  return result;
}

export function identifyRplrmPhases(series, { smoothingDays = 90, confirmationDays = 30 } = {}) {
  const phases = [], window = [];
  let sum = 0, pending = null, pendingDays = 0, phase = null, previous = null;
  for (let i = 0; i < series.length; i++) {
    const row = series[i], time = Date.parse(row.date);
    if (previous !== null && time - previous > DAY) pendingDays = 0;
    if (previous !== null && time - previous > 7 * DAY) {
      window.length = 0; sum = 0; pending = null; pendingDays = 0; phase = null;
    }
    previous = time;
    const log = Math.log(Math.max(1e-6, row.momentum));
    window.push({ log, time }); sum += log;
    while (window[0]?.time < time - (smoothingDays - 1) * DAY) sum -= window.shift().log;
    row.macroPhase = phase?.phase || null;
    if (window.length < Math.ceil(smoothingDays * 0.9)) continue;
    const next = sum / window.length < 0 ? "A" : "B";
    if (next === pending) pendingDays++; else { pending = next; pendingDays = 1; }
    if (pendingDays >= confirmationDays && next !== phase?.phase) {
      if (phase) { phase.endDate = series[i - 1].date; phase.endIndex = i - 1; phase.closed = true; }
      phase = { phase: next, startDate: row.date, startIndex: i, endDate: row.date, endIndex: i, closed: false };
      phases.push(phase);
    }
    if (phase) { phase.endDate = row.date; phase.endIndex = i; row.macroPhase = phase.phase; }
  }
  return phases.map(phase => ({ ...phase,
    days: Math.round((Date.parse(phase.endDate) - Date.parse(phase.startDate)) / DAY) + 1,
    months: (Date.parse(phase.endDate) - Date.parse(phase.startDate) + DAY) / DAY / 30.4375 }));
}

export function projectRplrm(series, phases, horizonDays = 365) {
  const last = series.at(-1);
  if (!last) return [];
  const logs = series.slice(-30).map(row => Math.log(Math.max(1e-6, row.momentum)));
  const latestLog = logs.at(-1), slope = logs.length > 1 ? (latestLog - logs[0]) / (logs.length - 1) : 0;
  const current = phases.at(-1);
  const historical = phases.filter(phase => phase.closed && phase.phase === current?.phase && phase.days >= 90);
  const age = current ? series.length - 1 - current.startIndex : 0;
  const points = [];
  for (let day = 0; day <= horizonDays; day += day === horizonDays ? 1 : Math.min(7, horizonDays - day)) {
    const analogs = historical.map(phase => series[phase.startIndex + age + day])
      .filter(row => row && row.date < (current?.startDate || last.date)).map(row => Math.log(Math.max(1e-6, row.momentum)));
    const average = analogs.length ? analogs.reduce((a, b) => a + b, 0) / analogs.length : 0;
    const fade = Math.exp(-day / 120);
    const central = latestLog * fade + Math.max(-0.025, Math.min(0.025, slope)) * Math.min(day, 60) * Math.exp(-day / 90)
      + average * (1 - fade);
    const spread = day === 0 ? 0 : Math.min(1.5, 0.18 + Math.sqrt(day / 365) * 0.9);
    const momentum = Math.exp(Math.max(-6, Math.min(6, central)));
    points.push({ date: new Date(Date.parse(last.date) + day * DAY).toISOString().slice(0, 10),
      momentum, profitMomentum: Math.max(momentum - 1, 0), lossMomentum: Math.min(1 - 1 / momentum, 0),
      state: Math.tanh(central / 2), lowState: Math.tanh((central - spread) / 2),
      highState: Math.tanh((central + spread) / 2), analogCount: analogs.length, scenario: true });
    if (day === horizonDays) break;
  }
  return points;
}

export function rplrmSnapshot(series, phases, livePrice = null) {
  const latest = series.at(-1), current = phases.at(-1);
  const closedA = phases.filter(phase => phase.closed && phase.phase === "A" && phase.days >= 90);
  const durations = closedA.map(phase => phase.days).sort((a, b) => a - b);
  const middle = Math.floor(durations.length / 2);
  const median = durations.length ? durations.length % 2 ? durations[middle] : (durations[middle - 1] + durations[middle]) / 2 : null;
  const recent = series.slice(-180), half = Math.floor(recent.length / 2);
  const earlyTrough = Math.min(...recent.slice(0, half).map(row => row.lossMomentum).filter(Number.isFinite));
  const lateTrough = Math.min(...recent.slice(half).map(row => row.lossMomentum).filter(Number.isFinite));
  return { ...latest, dailyPrice: latest.price, price: livePrice?.value || latest.price,
    priceAsOf: livePrice?.asOf || `${latest.date}T00:00:00Z`, onchainAsOf: latest.date,
    phase: current?.phase || "unconfirmed", phaseStart: current?.startDate || null,
    phaseDays: current?.days || 0, phaseMonths: current?.months || 0,
    closedASamples: closedA.length, medianADays: median,
    negativePressureEasing: lateTrough > earlyTrough,
    recentEarlyTrough: earlyTrough, recentLateTrough: lateTrough,
    positiveDays30: series.slice(-30).filter(row => row.state > 0).length,
    stateLabel: latest.state > 0 ? "repair-candidate" : "negative-momentum" };
}
