import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { start } from "workflow/api";
import { encryptTradingSecret, decryptTradingSecret } from "@/lib/alpha-execution/credentials";
import { checkRateLimit } from "@/lib/rate-limit";
import { isDatabaseConfigured, prisma } from "@/lib/prisma";
import type { Candidate, Command, Market, ScanMode, Stock, Topic } from "./types";
import { isCryptoScanMode } from "./types";
import { activeJob, cleanChunks, cleanOldChunks, cleanOldSnapshots, initialState, mutateState, publicState, readChunks, readState, writeChunk, writeSnapshot, type SnapshotVersions } from "./store";
import { analyzeSymbol, fetchBars, fetchCryptoUniverse, fetchQuote, fetchTopics, fetchUniverse, selectQuickUniverse } from "./market";
import { isFreshScheduleSlot, nextScheduleAt } from "./schedule";
import { BoxError } from "./validation";
import { fetchRadarUniverse, RADAR_SOURCE_LABELS } from "./radar-source";
import { boxScanWorkflow, boxScheduleWorkflow } from "./workflow";

const MAX_PUBLIC_RESULTS = 1000;
export const SCAN_CHUNK_SIZE = 8;
const localLimits = new Map<string, { count: number; until: number }>();
export async function limitRequests(request: Request, scope: string, maximum: number, userId?: string, options: { persistent?: boolean } = {}) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown";
  const key = `box:${scope}:${createHash("sha256").update(userId ?? ip).digest("hex").slice(0, 32)}`;
  if (options.persistent !== false && isDatabaseConfigured()) {
    if (!(await checkRateLimit(key, maximum, 60_000)).allowed) throw new BoxError("请求过于频繁，请稍后再试", 429);
  } else {
    const now = Date.now();
    if (localLimits.size > 2000) for (const [name, value] of localLimits) if (value.until < now) localLimits.delete(name);
    if (localLimits.size > 3000 && !localLimits.has(key)) throw new BoxError("请求过于频繁", 429);
    const current = localLimits.get(key);
    const bucket = current && current.until > now ? current : { count: 0, until: now + 60_000 };
    bucket.count++; localLimits.set(key, bucket);
    if (bucket.count > maximum) throw new BoxError("请求过于频繁，请稍后再试", 429);
  }
}
export async function dashboardState(userId?: string, knownVersions?: SnapshotVersions) {
  if (!userId) return publicState(initialState(), false);
  const state = await readState(userId, knownVersions ?? true);
  if (activeJob(state.job) && state.job && Date.now() - Date.parse(state.job.heartbeatAt) > 12 * 60_000) {
    await mutateState(userId, () => {});
    return dashboardState(userId, knownVersions);
  }
  const result = publicState(state);
  if (knownVersions === undefined) return result;
  result.stockUnchanged = knownVersions.stockVersion === state.stockSnapshot;
  result.cryptoUnchanged = knownVersions.cryptoVersion === state.cryptoSnapshot;
  return result;
}

export async function createScan(userId: string, mode: ScanMode, scheduleSlot?: string, sourceSymbols?: string[]) {
  const jobId = randomUUID();
  const state = await mutateState(userId, draft => {
    if (activeJob(draft.job)) throw new BoxError("已有扫描正在运行，请等待完成或先取消", 409);
    if (mode === "pool" && draft.settings.pool.length === 0) throw new BoxError("请先添加自选股");
    const now = new Date().toISOString();
    draft.job = {
      id: jobId, mode, status: "queued", total: 0, processed: 0, qualified: 0, errors: 0,
      startedAt: now, completedAt: null, heartbeatAt: now, runId: null, notified: false,
      ...(scheduleSlot ? { scheduleSlot } : {}),
      ...(mode === "crypto-risk-pool" ? { sourceSymbols: [...new Set(sourceSymbols ?? [])].map(symbol => ({ symbol, name: symbol.replace(/USDT$/, "") })) } : {}),
      logs: ["扫描任务已排队，正在读取真实行情；上次完成结果将保留至本次完成。"],
    };
  });
  return { jobId, state };
}

async function launchScan(userId: string, jobId: string) {
  try {
    const run = await start(boxScanWorkflow, [userId, jobId]);
    await mutateState(userId, draft => { if (draft.job?.id === jobId) draft.job.runId = run.runId; });
  } catch {
    await failScan(userId, jobId, "后台扫描启动失败，请重试；旧结果未被覆盖。");
    throw new BoxError("后台任务暂时无法启动，请稍后重试", 503);
  }
}

export async function executeCommand(userId: string, command: Command) {
  if (command.action === "scan") {
    const { jobId } = await createScan(userId, command.mode, undefined, command.symbols);
    await launchScan(userId, jobId);
  } else if (command.action === "cancel") {
    await mutateState(userId, draft => {
      if (draft.job && activeJob(draft.job)) {
        draft.job.status = "cancelled"; draft.job.completedAt = new Date().toISOString();
        draft.job.logs = [...draft.job.logs, "已取消扫描；正在读取的少量行情会结束，但不会覆盖上次结果。"].slice(-40);
      }
    });
  } else if (command.action === "pool-add") {
    const quote = await fetchQuote(command.symbol, "ashare").catch(() => null);
    if (!quote && !command.name) throw new BoxError("暂时无法校验该股票，请稍后重试或填写名称");
    await mutateState(userId, draft => {
      if (!draft.settings.pool.some(stock => stock.symbol === command.symbol)) {
        if (draft.settings.pool.length >= 100) throw new BoxError("自选股最多 100 个");
        draft.settings.pool.push({ symbol: command.symbol, name: command.name || quote?.name || command.symbol });
      }
    });
  } else if (command.action === "pool-remove") {
    await mutateState(userId, draft => { draft.settings.pool = draft.settings.pool.filter(stock => stock.symbol !== command.symbol); });
  } else if (command.action === "settings") {
    let encrypted: string | null | undefined;
    if (command.telegramToken !== undefined) {
      try { encrypted = command.telegramToken ? encryptTradingSecret(command.telegramToken) : null; }
      catch { throw new BoxError("通知密钥加密服务未配置，请联系管理员", 503); }
    }
    const restart = command.auto !== undefined || command.autoTimes !== undefined;
    const generation = randomUUID();
    const saved = await mutateState(userId, draft => {
      if (command.sectors !== undefined) draft.settings.sectors = [...new Set(command.sectors)];
      if (command.auto !== undefined) draft.settings.auto = command.auto;
      if (command.autoTimes !== undefined) draft.settings.autoTimes = [...new Set(command.autoTimes)].sort();
      if (command.telegramEnabled !== undefined) draft.settings.telegramEnabled = command.telegramEnabled;
      if (command.telegramChat !== undefined) draft.settings.telegramChat = command.telegramChat;
      if (encrypted !== undefined) draft.telegramEncrypted = encrypted;
      if (draft.settings.telegramEnabled && (!draft.telegramEncrypted || !draft.settings.telegramChat)) throw new BoxError("开启通知前请先填写 Bot Token 和 Chat ID");
      if (restart) { draft.generation = draft.settings.auto ? generation : null; draft.scheduleRunId = null; draft.error = null; }
    });
    if (restart && saved.settings.auto) {
      try {
        const run = await start(boxScheduleWorkflow, [userId, generation]);
        await mutateState(userId, draft => { if (draft.generation === generation) draft.scheduleRunId = run.runId; });
      } catch {
        await mutateState(userId, draft => { if (draft.generation === generation) { draft.settings.auto = false; draft.generation = null; } });
        throw new BoxError("自动扫描启动失败，已恢复关闭状态，请重试", 503);
      }
    }
    // A previous scheduler only wakes once more and observes the revoked generation.
  } else if (command.action === "telegram-test") {
    const state = await readState(userId);
    if (!state.telegramEncrypted || !state.settings.telegramChat) throw new BoxError("请先保存 Telegram 通知配置");
    await sendTelegram(state.telegramEncrypted, state.settings.telegramChat, "welinkBTC 箱体突破看板 · 通知连接测试成功。此消息由你主动发起，不包含交易指令。");
  }
  return dashboardState(userId);
}

async function eligibleUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
  return user?.status === "ACTIVE";
}
export interface PreparedScan { market: Market; universe: Stock[]; topics: Topic[]; sectors: string[] }
/** Only controlled market errors are suitable for the dashboard; never expose raw DB/HTTP bodies or credentials. */
export function scanFailureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (/扫描准备失败（|A 股|A股|行情源|行情响应|公开数据源|快速扫描|所有标的获取失败|扫描分片|扫描尚未完成|账户状态|后台扫描启动失败/.test(message)) {
    return message.replace(/https?:\/\/[^\s；，）]+/gi, "[数据源]")
      .replace(/(?:token|secret|password|authorization|api[_-]?key)\s*[:=]\s*[^\s；，]+/gi, "[已隐藏]")
      .replace(/[\r\n\t]+/g, " ").slice(0, 240);
  }
  if (/timeout|timed out|AbortError|TimeoutError/i.test(message)) return "公开行情请求超时，请稍后重试";
  if (/fetch failed|ECONN|ENOTFOUND|socket/i.test(message)) return "公开行情连接失败，请稍后重试";
  if (/Prisma|database|connection pool/i.test(message)) return "扫描状态存储暂不可用，请稍后重试";
  return "后台扫描步骤异常，请稍后重试";
}

export async function prepareScan(userId: string, jobId: string, attempt = 1): Promise<PreparedScan | null> {
  const state = await readState(userId);
  if (state.job?.id !== jobId || !activeJob(state.job)) return null;
  if (!(await eligibleUser(userId))) { await failScan(userId, jobId, "账户状态已变更，扫描已停止。"); return null; }
  const mode = state.job.mode;
  const market: Market = isCryptoScanMode(mode) ? "crypto" : "ashare";
  const warnings: string[] = [];
  const progress = async (message: string) => {
    const saved = await mutateState(userId, draft => {
      if (draft.job?.id !== jobId || !activeJob(draft.job)) return;
      draft.job.status = "running"; draft.job.heartbeatAt = new Date().toISOString();
      if (draft.job.logs.at(-1) !== message) draft.job.logs = [...draft.job.logs, message.slice(0, 240)].slice(-40);
    });
    if (saved.job?.id !== jobId || !activeJob(saved.job)) throw new Error("扫描准备已取消");
  };
  let stage = "初始化";
  try {
    await progress(`正在准备扫描 · 第 ${attempt} 次尝试；正在读取数据源，尚未进入逐股分析。`);
    stage = "热门板块";
    if (market === "ashare") await progress("正在读取热门板块；板块服务不可用时将跳过相关评分，不阻止股票扫描。");
    const topics = market === "ashare" ? await fetchTopics().catch(() => { warnings.push("热门板块源暂不可用，相关条件不会计分。"); return []; }) : [];
    stage = market === "crypto" ? "USDT 永续列表" : "A 股股票列表";
    await progress(`正在读取${stage}，请等待数据源校验与备用源切换。`);
    let universe: Stock[];
    if (market === "crypto") {
      const contracts = await fetchCryptoUniverse();
      if (state.job.mode === "crypto-risk-pool") {
        stage = "Alpha 雷达风控候选清单";
        await progress(`正在校验${stage}；仅保留 Binance USDT 永续合约。`);
        const supported = new Set(contracts.map(contract => contract.symbol));
        const requested = state.job.sourceSymbols ?? [];
        universe = requested.filter(stock => supported.has(stock.symbol));
        const skipped = requested.filter(stock => !supported.has(stock.symbol)).map(stock => stock.symbol);
        warnings.push(`${stage} · 候选 ${requested.length} 项，匹配 ${universe.length} 项。`);
        if (skipped.length) warnings.push(`跳过 ${skipped.length} 个无有效永续行情的候选：${skipped.join("、").slice(0, 140)}。`);
      } else if (state.job.mode === "crypto-radar" || state.job.mode === "crypto-mainstream" || state.job.mode === "crypto-alpha-market-cap" || state.job.mode === "crypto-alpha-open-interest") {
        stage = RADAR_SOURCE_LABELS[state.job.mode];
        await progress(`正在读取${stage}；沿用雷达七维扫描源，并校验 USDT 永续合约。`);
        const source = await fetchRadarUniverse(state.job.mode, contracts);
        universe = source.universe;
        warnings.push(`${stage} · 源快照 ${source.scannedAt} · 原榜 ${source.sourceCount} 项，匹配 ${universe.length} 项。`);
        if (source.skippedSymbols.length) warnings.push(`跳过 ${source.skippedSymbols.length} 个仅现货或无有效永续行情的标的：${source.skippedSymbols.join("、").slice(0, 140)}。`);
      } else universe = contracts.slice(0, 30);
    }
    else if (state.job.mode === "pool") universe = state.settings.pool;
    else {
      universe = await fetchUniverse(progress);
      if (!universe.length) throw new BoxError("A 股股票列表为空，数据源未提供有效标的", 503);
      if (state.job.mode === "quick") {
        stage = "快速扫描行情筛选";
        await progress(`已读取 ${universe.length} 只 A 股；正在按量比、换手率筛选快速扫描候选。`);
        universe = await selectQuickUniverse(universe, state.settings.pool, progress);
      }
    }
    universe = [...new Map(universe.map(stock => [stock.symbol, stock])).values()];
    if (!universe.length && state.job.mode !== "quick") throw new BoxError("行情源未返回可扫描标的，请稍后重试", 503);
    if (universe.length > 8000) throw new BoxError("行情源标的列表异常，扫描已安全停止", 503);
    const saved = await mutateState(userId, draft => {
      if (draft.job?.id !== jobId || !activeJob(draft.job)) return;
      draft.job.total = universe.length; draft.job.heartbeatAt = new Date().toISOString();
      const sourceLabel = mode === "crypto-risk-pool"
        ? "Alpha 雷达风控候选"
        : mode === "crypto-radar" || mode === "crypto-mainstream" || mode === "crypto-alpha-market-cap" || mode === "crypto-alpha-open-interest"
          ? RADAR_SOURCE_LABELS[mode]
          : market === "crypto" ? "USDT 永续涨幅榜" : "沪深 A 股";
      draft.job.logs = [...draft.job.logs, ...warnings, universe.length
        ? `已载入 ${universe.length} 个${sourceLabel}标的；分片持久扫描已开始。`
        : "行情已有效读取，但没有符合量比或换手率条件的快速扫描候选；这是零匹配结果，不是行情获取失败。"].slice(-40);
    });
    if (saved.job?.id !== jobId || !activeJob(saved.job)) return null;
    await cleanOldChunks(userId);
    return { market, universe, topics, sectors: state.settings.sectors };
  } catch (error) {
    const current = await readState(userId);
    if (current.job?.id !== jobId || !activeJob(current.job)) return null;
    const message = `扫描准备失败（${stage}）：${scanFailureReason(error)}`;
    console.warn("[box-breakout] prepare_failed", { jobId, mode: state.job.mode, attempt, stage, reason: scanFailureReason(error) });
    await progress(`${message}；${attempt < 4 ? "后台将自动重试。" : "已达到重试上限，将结束本次任务。"}`);
    throw new Error(message);
  }
}

export async function processScanChunk(userId: string, jobId: string, prepared: PreparedScan, offset: number): Promise<boolean> {
  const state = await readState(userId);
  if (state.job?.id !== jobId || !activeJob(state.job)) return false;
  if (state.job.processed > offset) return true; // Durable retry after a committed chunk.
  if (state.job.processed !== offset) throw new Error("扫描分片顺序异常");
  const slice = prepared.universe;
  if (slice.length > SCAN_CHUNK_SIZE) throw new Error("扫描分片过大");
  const results: Candidate[] = [], warnings: string[] = []; let errors = 0;
  for (let startIndex = 0; startIndex < slice.length; startIndex += 4) {
    await Promise.all(slice.slice(startIndex, startIndex + 4).map(async stock => {
      try {
        const candidate = await analyzeSymbol(stock, prepared.market, prepared.topics, prepared.sectors);
        results.push({ ...candidate, volume: { ...candidate.volume, ratios: candidate.volume.ratios.slice(-10) } });
        if (candidate.dataWarnings.length) warnings.push(`${stock.symbol}：${candidate.dataWarnings.join("；").slice(0, 160)}`);
      } catch (error) {
        errors++; warnings.push(`${stock.symbol} 行情暂不可用：${scanFailureReason(error)}，已跳过（不使用模拟数据）。`);
        console.warn("[box-breakout] symbol_failed", { jobId, market: prepared.market, symbol: stock.symbol, reason: scanFailureReason(error) });
      }
    }));
  }
  const committed = await writeChunk(userId, jobId, offset, { results, errors, warnings });
  const saved = await mutateState(userId, draft => {
    if (draft.job?.id !== jobId || !activeJob(draft.job) || draft.job.processed !== offset) return;
    draft.job.processed += slice.length; draft.job.errors += committed.errors; draft.job.qualified += committed.results.filter(result => result.qualified).length;
    draft.job.heartbeatAt = new Date().toISOString();
    draft.job.logs = [...draft.job.logs, ...committed.warnings.slice(-3), `已扫描 ${draft.job.processed}/${draft.job.total} · 达标 ${draft.job.qualified} · 获取失败 ${draft.job.errors}`].slice(-40);
  });
  return saved.job?.id === jobId && activeJob(saved.job);
}

export async function finishScan(userId: string, jobId: string, topics: Topic[]) {
  const current = await readState(userId);
  if (current.job?.id === jobId && current.job.status === "failed") throw new Error(current.job.logs.at(-1) ?? "后台扫描步骤异常，请稍后重试");
  if (current.job?.id !== jobId || !activeJob(current.job)) { await cleanChunks(userId, jobId); return; }
  const chunks = await readChunks(userId, jobId);
  const results = chunks.flatMap(chunk => chunk.results).sort((a, b) => b.score - a.score || b.quote.changePct - a.quote.changePct || a.symbol.localeCompare(b.symbol));
  if (!results.length && current.job.errors > 0) {
    const message = "所有标的获取失败；已保留上次有效结果，请稍后重试。";
    await failScan(userId, jobId, message);
    throw new Error(message);
  }
  // An empty but valid quick screen is a real empty snapshot, not a missing snapshot pointer.
  await writeSnapshot(userId, jobId, results.slice(0, MAX_PUBLIC_RESULTS));
  await mutateState(userId, draft => {
    if (draft.job?.id !== jobId || !activeJob(draft.job)) return;
    const now = new Date().toISOString();
    if (draft.job.processed < draft.job.total) throw new Error("扫描尚未完成");
    draft.job.completedAt = now; draft.job.heartbeatAt = now;
    draft.job.status = "complete";
    if (isCryptoScanMode(draft.job.mode)) { draft.crypto = []; draft.cryptoSnapshot = jobId; draft.cryptoSourceMode = draft.job.mode; }
    else { draft.stocks = []; draft.stockSnapshot = jobId; draft.topics = topics; }
    draft.asOf = now;
    draft.job.logs = [...draft.job.logs, `扫描完成：${draft.job.processed} 个标的，${draft.job.qualified} 个达标；数据不完整的条件已单独标注。`, ...(results.length > MAX_PUBLIC_RESULTS ? [`完整扫描已执行；界面按评分展示前 ${MAX_PUBLIC_RESULTS} 项，避免超大响应。`] : [])].slice(-40);
  });
  await cleanChunks(userId, jobId);
  await cleanOldSnapshots(userId);
}
export async function failScan(userId: string, jobId: string, message: string) {
  const reason = scanFailureReason(message);
  await mutateState(userId, draft => {
    if (draft.job?.id !== jobId || !activeJob(draft.job)) return;
    draft.job.status = "failed"; draft.job.completedAt = new Date().toISOString(); draft.job.heartbeatAt = draft.job.completedAt;
    draft.job.logs = [...draft.job.logs, `${reason}；上次完成结果已保留，可重新扫描。`.slice(0, 300)].slice(-40);
  });
  console.error("[box-breakout] scan_failed", { jobId, reason });
  await cleanChunks(userId, jobId);
}

async function sendTelegram(encrypted: string, chat: string, text: string) {
  let token: string;
  try { token = decryptTradingSecret(encrypted); } catch { throw new BoxError("Telegram 密钥解密失败，请重新保存", 503); }
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chat, text: text.slice(0, 3900), disable_web_page_preview: true }), signal: AbortSignal.timeout(12_000), cache: "no-store" });
    const data = await response.json();
    if (!response.ok || data?.ok !== true) throw new Error("rejected");
  } catch { throw new BoxError("Telegram 发送失败，请检查 Bot Token、Chat ID 与机器人权限", 502); }
}
export async function notifyScan(userId: string, jobId: string) {
  const state = await readState(userId, true);
  if (state.job?.id !== jobId || state.job.status !== "complete" || state.job.notified || !state.settings.telegramEnabled || !state.telegramEncrypted || !state.settings.telegramChat) return;
  const candidates = (isCryptoScanMode(state.job.mode) ? state.crypto : state.stocks).filter(candidate => candidate.qualified);
  if (!candidates.length) return;
  let claimed = false;
  await mutateState(userId, draft => {
    claimed = false;
    if (draft.job?.id === jobId && draft.job.status === "complete" && !draft.job.notified && draft.settings.telegramEnabled) { draft.job.notified = true; claimed = true; }
  });
  if (!claimed) return;
  // Claim before any network write and never retry ambiguous sends (Telegram has no idempotency key).
  const messages: string[] = []; let message = `welinkBTC 箱体突破 · ${isCryptoScanMode(state.job.mode) ? "加密" : "A股"}\n达标 ${candidates.length} 项 · 仅供研究，不构成交易建议\n`;
  for (const candidate of candidates) {
    const line = `\n${candidate.name} ${candidate.symbol} · ${candidate.score}分\n价格 ${candidate.quote.price} · 箱体 ${candidate.box?.low ?? "—"}–${candidate.box?.high ?? "—"} · 试探 ${candidate.box?.tests ?? 0} 次\n`;
    if (message.length + line.length > 3500) { messages.push(message); message = "welinkBTC 箱体突破（续）\n"; }
    message += line;
  }
  messages.push(message);
  try { for (const part of messages) await sendTelegram(state.telegramEncrypted, state.settings.telegramChat, part); }
  catch {
    await mutateState(userId, draft => { if (draft.job?.id === jobId) draft.job.logs = [...draft.job.logs, "Telegram 推送未确认成功，为避免重复消息不会自动重发；请检查通知配置。"].slice(-40); });
  }
}

export async function nextScheduledScan(userId: string, generation: string) {
  const state = await readState(userId);
  if (!state.settings.auto || state.generation !== generation || !(await eligibleUser(userId))) return null;
  return nextScheduleAt(Date.now(), state.settings.autoTimes);
}
export async function dispatchScheduledScan(userId: string, generation: string, slot: string) {
  if (!isFreshScheduleSlot(slot, Date.now())) return;
  if (!(await eligibleUser(userId))) return;
  const jobId = randomUUID();
  let claimed = false;
  await mutateState(userId, draft => {
    claimed = false;
    if (!draft.settings.auto || draft.generation !== generation || draft.lastScheduleSlot === slot) return;
    draft.lastScheduleSlot = slot;
    if (!activeJob(draft.job)) {
      claimed = true;
      const now = new Date().toISOString();
      draft.job = { id: jobId, mode: "market", status: "queued", total: 0, processed: 0, qualified: 0, errors: 0, startedAt: now, completedAt: null, heartbeatAt: now, runId: null, notified: false, scheduleSlot: slot, logs: ["已到北京时间自动扫描时段，全市场任务已排队。"] };
    }
  });
  if (!claimed) return;
  try { await launchScan(userId, jobId); }
  catch { /* launchScan persisted the failure; do not duplicate an ambiguous start. */ }
}

export async function failSchedule(userId: string, generation: string) {
  await mutateState(userId, draft => {
    if (draft.generation !== generation) return;
    draft.settings.auto = false; draft.generation = null; draft.scheduleRunId = null;
    draft.error = "自动扫描调度异常，已安全关闭；请重新开启自动扫描。已完成结果未受影响。";
  });
}

export async function getChart(symbol: string, market: Market) {
  const bars = await fetchBars(symbol, market);
  if (!bars.length) throw new BoxError("暂无有效 K 线数据", 502);
  return { bars, source: market === "crypto" ? "Binance USDⓈ-M Futures · 1D" : "A股公开日K · 腾讯 / 东财 / 新浪（按来源口径）" };
}
export async function getQuotes(symbols: string[], market: Market) {
  const quotes = [], errors: string[] = [];
  for (let offset = 0; offset < symbols.length; offset += 4) {
    const group = await Promise.all(symbols.slice(offset, offset + 4).map(async symbol => {
      try { return await fetchQuote(symbol, market); } catch { errors.push(`${symbol} 暂时无法获取`); return null; }
    }));
    quotes.push(...group.filter((quote): quote is NonNullable<typeof quote> => quote !== null));
  }
  if (!quotes.length) throw new BoxError("行情源暂不可用，请稍后重试", 502);
  return { quotes, ...(errors.length ? { errors } : {}) };
}
