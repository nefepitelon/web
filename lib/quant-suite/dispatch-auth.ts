import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { QUANT_ENGINE_IDS, type QuantEngineId } from "./catalog";
import { QuantError } from "./gateway";

const bindingSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]{2,63}$/),
  token: z.string().min(32).max(512),
  userIds: z.array(z.string().uuid()).min(1).max(100),
  engines: z.array(z.enum(QUANT_ENGINE_IDS)).min(1).max(6),
}).strict();
type EnvironmentBinding = z.infer<typeof bindingSchema>;
export type WorkerBinding = {id: string; userIds: string[]; engines: QuantEngineId[]; source?: "device" | "environment"};
export const secretHash = (value: string) => createHash("sha256").update(value).digest("hex");
export function sameSecret(left: string, right: string) { return timingSafeEqual(createHash("sha256").update(left).digest(), createHash("sha256").update(right).digest()); }
export function workerBindings(): EnvironmentBinding[] {
  const raw = process.env.QUANT_WORKER_TOKENS_JSON;
  if (!raw?.trim()) return [];
  let entries: EnvironmentBinding[];
  try { entries = z.array(bindingSchema).max(50).parse(JSON.parse(raw)); }
  catch { throw new QuantError("执行器账户绑定配置无效；请管理员检查服务器设置。", 503); }
  const ids = new Set<string>();
  const scopes = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new QuantError("执行器标识重复。", 503);
    ids.add(entry.id);
    for (const userId of entry.userIds) for (const engine of entry.engines) {
      const scope = `${userId}:${engine}`;
      if (scopes.has(scope)) throw new QuantError("同一账户与引擎只能绑定一个执行器。", 503);
      scopes.add(scope);
    }
  }
  return entries;
}
export async function assignedWorker(userId: string, engine: QuantEngineId, db: Pick<Prisma.TransactionClient, "quantSuiteDevice"> = prisma): Promise<WorkerBinding | undefined> {
  const environment = workerBindings().find(binding => binding.userIds.includes(userId) && binding.engines.includes(engine));
  const devices = await db.quantSuiteDevice.findMany({where: {userId, revokedAt: null, engines: {has: engine}}, take: 2});
  if (devices.length > 1 || (environment && devices.length)) throw new QuantError("账户与引擎存在重复执行器绑定，请先撤销多余设备。", 503);
  if (environment) return {id: environment.id, userIds: environment.userIds, engines: environment.engines, source: "environment"};
  if (devices[0]) return {id: devices[0].id, userIds: [userId], engines: z.array(z.enum(QUANT_ENGINE_IDS)).parse(devices[0].engines), source: "device"};
}
export async function authorizeWorker(request: Request): Promise<WorkerBinding> {
  const id = request.headers.get("x-quant-worker-id");
  const auth = request.headers.get("authorization") ?? "";
  if (!id || !/^[a-z0-9][a-z0-9_-]{2,63}$/.test(id) || auth.length > 520) throw new QuantError("执行器认证失败。", 401);
  const binding = workerBindings().find(entry => entry.id === id);
  if (binding && sameSecret(auth, `Bearer ${binding.token}`)) return {id: binding.id, userIds: binding.userIds, engines: binding.engines, source: "environment"};
  const device = await prisma.quantSuiteDevice.findUnique({where: {id}, include: {user: {select: {status: true}}}});
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const valid = sameSecret(secretHash(token), device?.tokenHash ?? "0".repeat(64));
  if (!device || device.revokedAt || device.user.status !== "ACTIVE" || token.length < 32 || !valid) throw new QuantError("执行器认证失败或设备已撤销。", 401);
  return {id: device.id, userIds: [device.userId], engines: z.array(z.enum(QUANT_ENGINE_IDS)).parse(device.engines), source: "device"};
}
// Lock the device row in the same transaction as begin/claim so revocation cannot race past permission checks.
export async function assertBindingActive(tx: Prisma.TransactionClient, binding: WorkerBinding) {
  if (binding.source !== "device") return;
  const active = await tx.quantSuiteDevice.updateMany({where: {id: binding.id, userId: binding.userIds[0], revokedAt: null}, data: {updatedAt: new Date()}});
  if (!active.count) throw new QuantError("设备已经撤销，禁止执行或更新任务。", 401);
}
export function permits(binding: WorkerBinding, userId: string, engine: string) {
  return binding.userIds.includes(userId) && binding.engines.includes(engine as QuantEngineId);
}
