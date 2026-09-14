import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Viewer } from "@/lib/membership";
import { QUANT_ENGINE_IDS } from "./catalog";
import { hasQuantAccess } from "./validation";
import { QuantError } from "./gateway";
import { secretHash, workerBindings } from "./dispatch-auth";
import { DISPATCH_PROTOCOL, HEARTBEAT_TTL_MS, dispatchEnabled } from "./dispatch";

export const pairDeviceSchema = z.object({name: z.string().trim().min(1).max(80), engines: z.array(z.enum(QUANT_ENGINE_IDS)).min(1).max(6).refine(values => new Set(values).size === values.length)}).strict();
export const revokeDeviceSchema = z.object({deviceId: z.string().regex(/^device-[a-f0-9-]{36}$/)}).strict();
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
function access(viewer: Viewer | null): asserts viewer is Viewer {
  if (!viewer) throw new QuantError("请先登录。", 401);
  if (!hasQuantAccess(viewer)) throw new QuantError("设备管理需要已登录且通过验证的 Max 或管理员账户。", 403);
}
export function pairingBaseUrl() {
  let url: URL;
  try { url = new URL(process.env.NEXT_PUBLIC_APP_URL ?? ""); }
  catch { throw new QuantError("服务器尚未设置可信的应用地址，不能生成设备配对凭证。", 503); }
  const local = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if ((!local && url.protocol !== "https:") || url.username || url.password) throw new QuantError("设备配对需要可信的 HTTPS 应用地址。", 503);
  return url.origin;
}
const publicSelect = {id: true, name: true, engines: true, createdAt: true, revokedAt: true} as const;
export async function listDevices(viewer: Viewer | null) {
  access(viewer);
  const devices = await prisma.quantSuiteDevice.findMany({where: {userId: viewer.id}, select: publicSelect, orderBy: {createdAt: "desc"}, take: 100});
  const workers = await prisma.quantSuiteWorker.findMany({where: {id: {in: devices.map(device => device.id)}}});
  return {ok: true, devices: devices.map(device => {
    const worker = workers.find(item => item.id === device.id);
    return {...device, lastSeenAt: worker?.lastSeenAt ?? null, online: !device.revokedAt && Boolean(worker && worker.protocolVersion === DISPATCH_PROTOCOL && worker.lastSeenAt.getTime() >= Date.now() - HEARTBEAT_TTL_MS)};
  })};
}
export async function pairDevice(viewer: Viewer | null, input: z.infer<typeof pairDeviceSchema>) {
  access(viewer);
  if (!dispatchEnabled()) throw new QuantError("Supabase 执行器调度未开启。", 503);
  const baseUrl = pairingBaseUrl();
  const token = randomBytes(32).toString("base64url");
  const id = `device-${randomUUID()}`;
  const device = await prisma.$transaction(async tx => {
    // Serialize enrolments for this user: two concurrent requests cannot claim overlapping engine scopes.
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${viewer.id}::uuid FOR UPDATE`;
    if (workerBindings().some(binding => binding.userIds.includes(viewer.id) && binding.engines.some(engine => input.engines.includes(engine)))) throw new QuantError("部分引擎已由管理员分配给服务器执行器，请先解除原绑定。", 409);
    const overlap = await tx.quantSuiteDevice.findFirst({where: {userId: viewer.id, revokedAt: null, engines: {hasSome: input.engines}}});
    if (overlap) throw new QuantError("部分引擎已经绑定设备，请先停止相关引擎并撤销原设备。", 409);
    const instances = await tx.quantSuiteInstance.findMany({where: {userId: viewer.id, engine: {in: input.engines}}});
    const unassigned = await tx.quantSuiteDispatch.findMany({where: {userId: viewer.id, engine: {in: input.engines}, status: "QUEUED", workerId: null}, select: {commandId: true}});
    if (instances.some(instance => (instance.activeCommandId && !unassigned.some(job => job.commandId === instance.activeCommandId)) || (instance.cachedRuntime && typeof instance.cachedRuntime === "object" && !Array.isArray(instance.cachedRuntime) && instance.cachedRuntime.state === "running"))) throw new QuantError("部分引擎仍在运行或存在未确认指令，请先核对并停止原执行器后再重新配对。", 409);
    return tx.quantSuiteDevice.create({data: {id, userId: viewer.id, name: input.name, engines: input.engines, tokenHash: secretHash(token)}, select: publicSelect});
  });
  return {ok: true, device: {...device, lastSeenAt: null, online: false}, pairing: {schemaVersion: 1, baseUrl, workerId: id, userId: viewer.id, token}};
}
export async function revokeDevice(viewer: Viewer | null, deviceId: string) {
  access(viewer);
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${viewer.id}::uuid FOR UPDATE`;
    const device = await tx.quantSuiteDevice.findFirst({where: {id: deviceId, userId: viewer.id}});
    if (!device) throw new QuantError("设备不存在。", 404);
    if (device.revokedAt) return;
    await tx.quantSuiteDevice.update({where: {id: device.id}, data: {revokedAt: new Date()}});
    const pending = await tx.quantSuiteDispatch.findMany({where: {workerId: device.id, status: {in: ["QUEUED", "CLAIMED", "EXECUTING"]}}});
    for (const job of pending) {
      const uncertain = job.status === "EXECUTING" || job.action === "stop";
      const status = uncertain ? "UNKNOWN" : "CANCELLED";
      const result = {ok: false, message: uncertain ? "设备已撤销；原生进程状态尚未确认，请在原设备核对并停止。" : "设备已撤销，未开始的指令已取消。"};
      const changed = await tx.quantSuiteDispatch.updateMany({where: {id: job.id, status: job.status}, data: {status, result: json(result), ...(uncertain ? {} : {completedAt: new Date()})}});
      if (!changed.count) continue;
      await tx.quantSuiteCommand.update({where: {id: job.commandId}, data: {status, result: json(result)}});
      if (!uncertain) await tx.quantSuiteInstance.updateMany({where: {userId: viewer.id, engine: job.engine, activeCommandId: job.commandId}, data: {activeCommandId: null}});
    }
    await tx.quantSuiteInstance.updateMany({where: {userId: viewer.id, engine: {in: device.engines}}, data: {controlSequence: {increment: 1}, runtimeObservedAt: null}});
  });
  return {ok: true, message: "设备令牌已撤销。此操作不代表原设备上的交易进程已经停止，请在原设备核对。"};
}
