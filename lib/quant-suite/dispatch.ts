import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma, type QuantSuiteInstance } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { QUANT_ENGINE_IDS, type QuantEngineId } from "./catalog";
import { quantConfigSchema, type QuantConfig } from "./validation";
import { QuantError, runtimeSchema, replySchema, type QuantRuntime } from "./gateway";
import { assignedWorker, assertBindingActive, permits, sameSecret, secretHash, workerBindings, type WorkerBinding } from "./dispatch-auth";

export const DISPATCH_PROTOCOL = 1;
export const HEARTBEAT_TTL_MS = 45000;
const LEASE_MS = 120000;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export function dispatchEnabled() { return process.env.QUANT_DISPATCH_MODE === "supabase"; }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
export function dispatchConfigHash(config: QuantConfig) {
  const {name, startDate, endDate, ...execution} = quantConfigSchema.parse(config);
  return createHash("sha256").update(canonical(execution)).digest("hex");
}
const EXPECTED_VERSIONS: Record<QuantEngineId, string> = {freqtrade: "2026.8", nautilus: "1.231.0", hummingbot: "2.16.0", lean: "18057", jesse: "3.1.1", octobot: "2.1.1"};
export const expectedVersion = (engine: QuantEngineId) => EXPECTED_VERSIONS[engine];
export function matchesRuntimeVersion(engine: QuantEngineId, version: string | undefined) {
  return version === EXPECTED_VERSIONS[engine] || (engine === "hummingbot" && version === "2.16.0 / API 1.0.1") || (engine === "lean" && version === "镜像 build 18057");
}
function offline(message: string): QuantRuntime { return {state: "offline", capabilities: [], message}; }
export async function dispatchWorkerOnline(userId: string) {
  const devices = await prisma.quantSuiteDevice.findMany({where: {userId, revokedAt: null}, select: {id: true}});
  const ids = [...devices.map(device => device.id), ...workerBindings().filter(binding => binding.userIds.includes(userId)).map(binding => binding.id)];
  if (!ids.length) return false;
  return Boolean(await prisma.quantSuiteWorker.findFirst({where: {id: {in: ids}, protocolVersion: DISPATCH_PROTOCOL, lastSeenAt: {gt: new Date(Date.now() - HEARTBEAT_TTL_MS)}}}));
}
export async function dispatchRuntime(userId: string, engine: QuantEngineId, record?: QuantSuiteInstance | null): Promise<QuantRuntime> {
  const binding = await assignedWorker(userId, engine);
  if (!binding) return offline("Supabase 调度已连接；该账户尚未绑定外部执行器，原生交易引擎离线。");
  const worker = await prisma.quantSuiteWorker.findUnique({where: {id: binding.id}});
  const cutoff = Date.now() - HEARTBEAT_TTL_MS;
  if (!worker || worker.protocolVersion !== DISPATCH_PROTOCOL || worker.lastSeenAt.getTime() < cutoff) return offline("Supabase 调度已连接；外部执行器心跳离线，无法启动交易。");
  if (!record?.runtimeObservedAt || record.runtimeWorkerId !== binding.id || record.runtimeObservedAt.getTime() < cutoff) return offline("外部执行器已连接，等待此账户原生引擎的最新状态。");
  const parsed = runtimeSchema.safeParse(record.cachedRuntime);
  if (!parsed.success) return offline("尚未收到可验证的原生引擎状态。");
  if (parsed.data.state !== "unconfigured" && !matchesRuntimeVersion(engine, parsed.data.version)) return offline("执行器的原生引擎版本与本系统锁定版本不一致。");
  return parsed.data;
}
export async function assertDispatchStartReady(userId: string, engine: QuantEngineId, record: QuantSuiteInstance | null, config: QuantConfig) {
  const runtime = await dispatchRuntime(userId, engine, record);
  if (runtime.state !== "ready" || !runtime.capabilities?.includes(config.mode)) throw new QuantError("外部执行器未绑定、离线或尚未就绪；启动请求不会排队等待将来自动触发。", 503);
}

type EnqueueInput = {id: string; userId: string; engine: QuantEngineId; action: string; requestId: string; controlSequence: number; revision: number; config: QuantConfig};
export async function enqueueDispatch(tx: Prisma.TransactionClient, input: EnqueueInput) {
  const binding = await assignedWorker(input.userId, input.engine, tx);
  const expiresAt = new Date(Date.now() + (input.action === "start" ? 30000 : 600000));
  const payload = {protocolVersion: DISPATCH_PROTOCOL, userId: input.userId, engine: input.engine, action: input.action, config: input.config, requestId: input.requestId, controlSequence: input.controlSequence, revision: input.revision, configHash: dispatchConfigHash(input.config), expectedVersion: expectedVersion(input.engine)};
  if (input.action === "stop") {
    const superseded = await tx.quantSuiteDispatch.findMany({where: {userId: input.userId, engine: input.engine, status: "QUEUED", controlSequence: {lt: input.controlSequence}}, select: {id: true, commandId: true}});
    for (const old of superseded) {
      const result = {ok: false, message: "未执行的旧指令已被后续停止指令取消。"};
      await tx.quantSuiteDispatch.update({where: {id: old.id}, data: {status: "CANCELLED", result: json(result), completedAt: new Date()}});
      await tx.quantSuiteCommand.update({where: {id: old.commandId}, data: {status: "CANCELLED", result: json(result)}});
    }
  }
  await tx.quantSuiteDispatch.create({data: {commandId: input.id, userId: input.userId, engine: input.engine, action: input.action, requestId: input.requestId, controlSequence: input.controlSequence, revision: input.revision, configHash: payload.configHash, expectedVersion: payload.expectedVersion, payload: json(payload), workerId: binding?.id ?? null, expiresAt}});
  const result = {ok: true, queued: true, commandId: input.id, status: "QUEUED", message: binding ? "指令已保存到 Supabase 调度队列，等待绑定执行器确认。" : "研究/停止指令已保存到 Supabase；外部执行器未绑定，当前尚未执行。"};
  await tx.quantSuiteCommand.update({where: {id: input.id}, data: {status: "QUEUED", result: json(result)}});
  return result;
}

export async function reconcileExpiredDispatches(userIds: string[]) {
  if (!userIds.length) return;
  const now = new Date();
  const expired = await prisma.quantSuiteDispatch.findMany({where: {userId: {in: userIds}, OR: [{status: "QUEUED", expiresAt: {lt: now}}, {status: {in: ["CLAIMED", "EXECUTING"]}, leaseExpiresAt: {lt: now}}]}, take: 100});
  for (const job of expired) await prisma.$transaction(async tx => {
    const uncertain = job.status === "EXECUTING" || job.action === "stop";
    const status = uncertain ? "UNKNOWN" : "REJECTED";
    const result = {ok: false, message: uncertain ? "执行器确认超时；执行状态未知，已保留操作锁，需核对原生引擎。" : "指令在执行前已过期，未自动重新派发。"};
    const changed = await tx.quantSuiteDispatch.updateMany({where: {id: job.id, status: job.status, ...(job.status === "QUEUED" ? {expiresAt: {lt: now}} : {leaseExpiresAt: {lt: now}})}, data: {status, result: json(result), ...(uncertain ? {} : {completedAt: now})}});
    if (!changed.count) return;
    await tx.quantSuiteCommand.update({where: {id: job.commandId}, data: {status, result: json(result)}});
    if (!uncertain) await tx.quantSuiteInstance.updateMany({where: {userId: job.userId, engine: job.engine, activeCommandId: job.commandId}, data: {activeCommandId: null}});
  });
}

const protocol = {protocolVersion: z.literal(DISPATCH_PROTOCOL)};
const lease = {dispatchId: z.string().min(1).max(100), leaseToken: z.string().uuid()};
export const claimSchema = z.object(protocol).strict();
export const beginSchema = z.object({...protocol, ...lease}).strict();
const observationSchema = z.object({userId: z.string().uuid(), engine: z.enum(QUANT_ENGINE_IDS), revision: z.number().int().positive(), configHash: z.string().regex(/^[a-f0-9]{64}$/), runtime: runtimeSchema}).strict();
export const heartbeatSchema = z.object({...protocol, observations: z.array(observationSchema).max(50).default([]), lease: z.object(lease).strict().optional()}).strict();
const safeResult = z.object({requestId: z.string().max(100).optional(), state: z.string().max(40).optional(), configHash: z.string().regex(/^[a-f0-9]{64}$/).optional(), metrics: z.record(z.string().max(60), z.number().finite()).optional()});
export const completeSchema = z.object({...protocol, ...lease, outcome: z.enum(["completed", "unknown"]), reply: replySchema.omit({result: true}).extend({result: safeResult.optional()})}).strict();
type CompleteInput = z.infer<typeof completeSchema>;
function authorizedLease(job: {workerId: string | null; userId: string; engine: string; leaseTokenHash: string | null} | null, binding: WorkerBinding, token: string) {
  if (!job || job.workerId !== binding.id || !permits(binding, job.userId, job.engine) || !job.leaseTokenHash || !sameSecret(job.leaseTokenHash, secretHash(token))) throw new QuantError("任务租约无效或不属于此执行器。", 403);
}
async function touchWorker(binding: WorkerBinding) {
  await prisma.quantSuiteWorker.upsert({where: {id: binding.id}, create: {id: binding.id, protocolVersion: DISPATCH_PROTOCOL}, update: {lastSeenAt: new Date(), protocolVersion: DISPATCH_PROTOCOL}});
}
async function assignments(binding: WorkerBinding) {
  const records = await prisma.quantSuiteInstance.findMany({where: {userId: {in: binding.userIds}, engine: {in: binding.engines}}, take: 50});
  return records.map(record => ({userId: record.userId, engine: record.engine, revision: record.revision, config: quantConfigSchema.parse(record.config), configHash: dispatchConfigHash(quantConfigSchema.parse(record.config))}));
}
export async function claimDispatch(binding: WorkerBinding) {
  await touchWorker(binding);
  await reconcileExpiredDispatches(binding.userIds);
  // An expired executing task is never reclaimed. One process may own one outstanding lease.
  const active = await prisma.quantSuiteDispatch.findFirst({where: {workerId: binding.id, status: {in: ["CLAIMED", "EXECUTING"]}}});
  if (active) return {ok: true, task: null, busy: true, assignments: await assignments(binding)};
  const candidates = await prisma.quantSuiteDispatch.findMany({where: {userId: {in: binding.userIds}, engine: {in: binding.engines}, status: "QUEUED", expiresAt: {gt: new Date()}, OR: [{workerId: binding.id}, {workerId: null}]}, orderBy: [{action: "desc"}, {createdAt: "asc"}], take: 10});
  for (const candidate of candidates) {
    const token = randomUUID();
    const selected = await prisma.$transaction(async tx => {
      await assertBindingActive(tx, binding);
      // A row update locks this worker until the transaction ends, preventing two pollers from claiming two tasks.
      await tx.quantSuiteWorker.update({where: {id: binding.id}, data: {lastSeenAt: new Date()}});
      const occupied = await tx.quantSuiteDispatch.findFirst({where: {workerId: binding.id, status: {in: ["CLAIMED", "EXECUTING"]}}});
      if (occupied) return null;
      const instance = await tx.quantSuiteInstance.findUnique({where: {userId_engine: {userId: candidate.userId, engine: candidate.engine}}});
      if (!instance || instance.activeCommandId !== candidate.commandId || instance.controlSequence !== candidate.controlSequence || instance.revision !== candidate.revision || dispatchConfigHash(quantConfigSchema.parse(instance.config)) !== candidate.configHash) {
        const result = {ok: false, message: "旧指令已被更新的配置或控制指令取代，未执行。"};
        const changed = await tx.quantSuiteDispatch.updateMany({where: {id: candidate.id, status: "QUEUED"}, data: {status: "CANCELLED", completedAt: new Date(), result: json(result)}});
        if (changed.count) {
          await tx.quantSuiteCommand.update({where: {id: candidate.commandId}, data: {status: "CANCELLED", result: json(result)}});
          await tx.quantSuiteInstance.updateMany({where: {userId: candidate.userId, engine: candidate.engine, activeCommandId: candidate.commandId}, data: {activeCommandId: null}});
        }
        return null;
      }
      const changed = await tx.quantSuiteDispatch.updateMany({where: {id: candidate.id, status: "QUEUED", expiresAt: {gt: new Date()}, OR: [{workerId: binding.id}, {workerId: null}]}, data: {status: "CLAIMED", workerId: binding.id, leaseTokenHash: secretHash(token), leaseExpiresAt: new Date(Date.now() + LEASE_MS)}});
      if (!changed.count) return null;
      await tx.quantSuiteCommand.update({where: {id: candidate.commandId}, data: {status: "CLAIMED", result: json({ok: true, message: "绑定执行器已领取指令，尚未确认执行。"})}});
      return {dispatchId: candidate.id, leaseToken: token, payload: candidate.payload, expiresAt: candidate.expiresAt.toISOString()};
    });
    if (selected) return {ok: true, task: selected, assignments: await assignments(binding)};
  }
  return {ok: true, task: null, assignments: await assignments(binding)};
}

export async function beginDispatch(binding: WorkerBinding, input: z.infer<typeof beginSchema>) {
  return prisma.$transaction(async tx => {
    await assertBindingActive(tx, binding);
    const job = await tx.quantSuiteDispatch.findUnique({where: {id: input.dispatchId}});
    authorizedLease(job, binding, input.leaseToken);
    if (!job || job.status !== "CLAIMED" || !job.leaseExpiresAt || job.leaseExpiresAt.getTime() <= Date.now() || job.expiresAt.getTime() <= Date.now()) throw new QuantError("任务已经过期或开始状态不允许；禁止执行。", 409);
    const locked = await tx.quantSuiteInstance.updateMany({where: {userId: job.userId, engine: job.engine, activeCommandId: job.commandId, controlSequence: job.controlSequence, revision: job.revision}, data: {activeCommandId: job.commandId}});
    if (!locked.count) throw new QuantError("开始执行前已收到更新的停止/配置指令，旧任务禁止执行。", 409);
    const changed = await tx.quantSuiteDispatch.updateMany({where: {id: job.id, status: "CLAIMED", leaseTokenHash: secretHash(input.leaseToken), leaseExpiresAt: {gt: new Date()}}, data: {status: "EXECUTING", dispatchedAt: new Date(), leaseExpiresAt: new Date(Date.now() + LEASE_MS)}});
    if (!changed.count) throw new QuantError("任务租约已改变，禁止执行。", 409);
    await tx.quantSuiteCommand.update({where: {id: job.commandId}, data: {status: "EXECUTING"}});
    return {ok: true, permitted: true};
  });
}

export async function heartbeatDispatch(binding: WorkerBinding, input: z.infer<typeof heartbeatSchema>) {
  for (const observation of input.observations) if (!permits(binding, observation.userId, observation.engine)) throw new QuantError("状态报告超出此执行器绑定范围。", 403);
  return prisma.$transaction(async tx => {
  await assertBindingActive(tx, binding);
  await tx.quantSuiteWorker.upsert({where: {id: binding.id}, create: {id: binding.id, protocolVersion: DISPATCH_PROTOCOL}, update: {lastSeenAt: new Date(), protocolVersion: DISPATCH_PROTOCOL}});
  if (input.lease) {
    const job = await tx.quantSuiteDispatch.findUnique({where: {id: input.lease.dispatchId}});
    authorizedLease(job, binding, input.lease.leaseToken);
    if (job && ["CLAIMED", "EXECUTING"].includes(job.status)) await tx.quantSuiteDispatch.updateMany({where: {id: job.id, status: job.status, leaseExpiresAt: {gt: new Date()}}, data: {leaseExpiresAt: new Date(Date.now() + LEASE_MS)}});
  }
  for (const observation of input.observations) {
    const instance = await tx.quantSuiteInstance.findUnique({where: {userId_engine: {userId: observation.userId, engine: observation.engine}}});
    if (!instance || instance.revision !== observation.revision || dispatchConfigHash(quantConfigSchema.parse(instance.config)) !== observation.configHash) continue;
    await tx.quantSuiteInstance.updateMany({where: {id: instance.id, revision: observation.revision}, data: {cachedRuntime: json(observation.runtime), runtimeObservedAt: new Date(), runtimeWorkerId: binding.id}});
  }
  return {ok: true};
  });
}

export async function completeDispatch(binding: WorkerBinding, input: CompleteInput) {
  return prisma.$transaction(async tx => {
    await assertBindingActive(tx, binding);
    const job = await tx.quantSuiteDispatch.findUnique({where: {id: input.dispatchId}});
    authorizedLease(job, binding, input.leaseToken);
    if (!job) throw new QuantError("任务不存在。", 404);
    if (["SUCCEEDED", "REJECTED", "CANCELLED"].includes(job.status)) return {ok: true, replayed: true};
    if (!["CLAIMED", "EXECUTING", "UNKNOWN"].includes(job.status)) throw new QuantError("此任务已经取消或不可确认。", 409);
    if (job.status === "CLAIMED" && input.reply.ok && job.action !== "preflight") throw new QuantError("任务未经执行许可，不能报告已执行成功。", 409);
    if (job.status === "CLAIMED" && job.leaseExpiresAt && job.leaseExpiresAt.getTime() <= Date.now()) throw new QuantError("未开始执行的租约已经过期。", 409);
    const uncertain = input.outcome === "unknown" || (job.action === "stop" && !input.reply.ok);
    const status = uncertain ? "UNKNOWN" : input.reply.ok ? "SUCCEEDED" : "REJECTED";
    const result = uncertain ? {ok: false, message: "执行器无法确认操作结果；已保留未知状态，禁止自动重试。"} : input.reply;
    const changed = await tx.quantSuiteDispatch.updateMany({where: {id: job.id, status: job.status}, data: {status, result: json(result), ...(status === "UNKNOWN" ? {} : {completedAt: new Date()})}});
    if (!changed.count) throw new QuantError("任务状态已更新，请仅重试结果确认，不要重执行交易动作。", 409);
    await tx.quantSuiteCommand.update({where: {id: job.commandId}, data: {status, result: json(result)}});
    if (status !== "UNKNOWN") await tx.quantSuiteInstance.updateMany({where: {userId: job.userId, engine: job.engine, activeCommandId: job.commandId}, data: {activeCommandId: null}});
    if (input.reply.runtime) await tx.quantSuiteInstance.updateMany({where: {userId: job.userId, engine: job.engine, revision: job.revision, controlSequence: job.controlSequence}, data: {cachedRuntime: json(input.reply.runtime), runtimeObservedAt: new Date(), runtimeWorkerId: binding.id}});
    return {ok: true};
  });
}
