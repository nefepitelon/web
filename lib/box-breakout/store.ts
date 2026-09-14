import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Candidate, CryptoScanMode, DashboardState, ScanJob, Settings, Topic } from "./types";
import { BoxError } from "./validation";
import { createSnapshotCache } from "./snapshot-cache";

export interface StoredJob extends ScanJob { heartbeatAt: string; runId: string | null; notified: boolean; scheduleSlot?: string }
export interface StoredState {
  revision: number; settings: Settings; telegramEncrypted: string | null;
  generation: string | null; scheduleRunId: string | null; lastScheduleSlot: string | null;
  job: StoredJob | null; stocks: Candidate[]; crypto: Candidate[]; topics: Topic[]; asOf: string | null;
  stockSnapshot: string | null; cryptoSnapshot: string | null; cryptoSourceMode?: CryptoScanMode; error: string | null;
}
export interface Chunk { results: Candidate[]; errors: number; warnings: string[] }
export const JOB_STALE_MS = 12 * 60_000;
export const keyForUser = (userId: string) => `box-breakout:v1:${encodeURIComponent(userId)}`;
const asJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export function initialState(): StoredState {
  return { revision: 0, settings: { pool: [], sectors: [], auto: false, autoTimes: ["11:30", "15:00"], telegramEnabled: false, telegramChat: "", telegramConfigured: false }, telegramEncrypted: null, generation: null, scheduleRunId: null, lastScheduleSlot: null, job: null, stocks: [], crypto: [], topics: [], asOf: null, stockSnapshot: null, cryptoSnapshot: null, error: null };
}
export function publicState(state: StoredState, signedIn = true): DashboardState {
  const job = state.job;
  return {
    settings: { ...state.settings, telegramConfigured: Boolean(state.telegramEncrypted), pool: [...state.settings.pool], sectors: [...state.settings.sectors] },
    job: job ? { id: job.id, mode: job.mode, status: job.status, total: job.total, processed: job.processed, qualified: job.qualified, errors: job.errors, startedAt: job.startedAt, completedAt: job.completedAt, logs: job.logs } : null,
    stocks: state.stocks, crypto: state.crypto, cryptoSourceMode: state.cryptoSourceMode ?? "crypto", topics: state.topics, asOf: state.asOf, signedIn, ...(state.error ? { error: state.error } : {}),
    stockVersion: state.stockSnapshot, cryptoVersion: state.cryptoSnapshot,
  };
}
export function activeJob(job: StoredJob | null) { return Boolean(job && ["queued", "running"].includes(job.status)); }
export function expireJob(state: StoredState, now = Date.now()) {
  if (state.job && activeJob(state.job) && now - Date.parse(state.job.heartbeatAt) > JOB_STALE_MS) {
    state.job.status = "failed"; state.job.completedAt = new Date(now).toISOString();
    state.job.logs = [...state.job.logs, "任务心跳超时，已释放扫描锁；上次完成结果保留，可重新扫描。"].slice(-40);
  }
}
export interface SnapshotVersions { stockVersion?: string | null; cryptoVersion?: string | null }
export async function readState(userId: string, includeSnapshots: boolean | SnapshotVersions = false): Promise<StoredState> {
  const row = await prisma.systemSetting.findUnique({ where: { key: keyForUser(userId) } });
  const state = row ? row.value as unknown as StoredState : initialState();
  const includeStocks = includeSnapshots === true || typeof includeSnapshots === "object" && includeSnapshots.stockVersion !== state.stockSnapshot;
  const includeCrypto = includeSnapshots === true || typeof includeSnapshots === "object" && includeSnapshots.cryptoVersion !== state.cryptoSnapshot;
  if (includeStocks || includeCrypto) {
    const [stocks, crypto] = await Promise.all([
      includeStocks ? readSnapshot(userId, state.stockSnapshot) : null,
      includeCrypto ? readSnapshot(userId, state.cryptoSnapshot) : null
    ]);
    if (stocks) state.stocks = stocks;
    if (crypto) state.crypto = crypto;
  }
  return state;
}

/** Optimistic CAS prevents lost updates across concurrent Vercel instances. Callbacks must be side-effect free. */
export async function mutateState(userId: string, modify: (state: StoredState) => void): Promise<StoredState> {
  const key = keyForUser(userId);
  for (let attempt = 0; attempt < 12; attempt++) {
    const row = await prisma.systemSetting.findUnique({ where: { key } });
    const state = row ? structuredClone(row.value) as unknown as StoredState : initialState();
    const revision = state.revision;
    expireJob(state);
    modify(state); state.revision = revision + 1;
    if (!row) {
      try { await prisma.systemSetting.create({ data: { key, value: asJson(state), description: "箱体突破看板：每用户隔离的配置、进度与最近扫描", updatedBy: userId } }); return state; }
      catch (error) { if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error; }
    } else {
      const result = await prisma.systemSetting.updateMany({ where: { key, value: { path: ["revision"], equals: revision } }, data: { value: asJson(state), updatedBy: userId } });
      if (result.count === 1) return state;
    }
  }
  throw new BoxError("操作正在处理中，请稍后重试", 409);
}
const chunkPrefix = (userId: string, jobId: string) => `${keyForUser(userId)}:chunk:${jobId}:`;
export async function writeChunk(userId: string, jobId: string, offset: number, chunk: Chunk) {
  const key = `${chunkPrefix(userId, jobId)}${String(offset).padStart(6, "0")}`;
  const row = await prisma.systemSetting.upsert({ where: { key }, create: { key, value: asJson(chunk), updatedBy: userId }, update: {} });
  return row.value as unknown as Chunk;
}
export async function readChunks(userId: string, jobId: string): Promise<Chunk[]> {
  const rows = await prisma.systemSetting.findMany({ where: { key: { startsWith: chunkPrefix(userId, jobId) } }, orderBy: { key: "asc" } });
  return rows.map(row => row.value as unknown as Chunk);
}
export async function cleanChunks(userId: string, jobId: string) {
  await prisma.systemSetting.deleteMany({ where: { key: { startsWith: chunkPrefix(userId, jobId) } } });
}
export async function cleanOldChunks(userId: string) {
  await prisma.systemSetting.deleteMany({ where: { key: { startsWith: `${keyForUser(userId)}:chunk:` }, updatedAt: { lt: new Date(Date.now() - 86_400_000) } } });
}

const snapshotKey = (userId: string, jobId: string) => `${keyForUser(userId)}:snapshot:${jobId}`;
const cachedSnapshot = createSnapshotCache<Candidate[]>();
async function readSnapshot(userId: string, jobId: string | null) {
  if (!jobId) return null;
  const key = snapshotKey(userId, jobId);
  return cachedSnapshot(key, async () => {
    const row = await prisma.systemSetting.findUnique({ where: { key }, select: { value: true } });
    return row ? row.value as unknown as Candidate[] : null;
  });
}
export async function writeSnapshot(userId: string, jobId: string, results: Candidate[]) {
  const key = snapshotKey(userId, jobId);
  await prisma.systemSetting.upsert({ where: { key }, create: { key, value: asJson(results), updatedBy: userId }, update: {}, select: { key: true } });
}
export async function cleanOldSnapshots(userId: string) {
  const state = await readState(userId);
  const protectedKeys = [state.stockSnapshot, state.cryptoSnapshot].filter((value): value is string => Boolean(value)).map(jobId => snapshotKey(userId, jobId));
  await prisma.systemSetting.deleteMany({ where: { key: { startsWith: `${keyForUser(userId)}:snapshot:`, notIn: protectedKeys }, updatedAt: { lt: new Date(Date.now() - 7 * 86_400_000) } } });
}
