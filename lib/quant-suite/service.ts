import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Viewer } from "@/lib/membership";
import { QUANT_ENGINES } from "./catalog";
import { defaultQuantConfig, quantConfigSchema, hasQuantAccess, hasQuantLiveAccess, type QuantCommand } from "./validation";
import { gatewayCommand, gatewayConfigured, unavailableRuntime, QuantError, type GatewayReply } from "./gateway";
import { dispatchEnabled, dispatchRuntime, dispatchWorkerOnline, assertDispatchStartReady, enqueueDispatch, reconcileExpiredDispatches } from "./dispatch";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export async function getQuantSuite(viewer: Viewer | null) {
  const canOperate = hasQuantAccess(viewer);
  const queued = dispatchEnabled();
  const base = {ok: true, engines: QUANT_ENGINES, configured: queued || gatewayConfigured(), canOperate, canLive: hasQuantLiveAccess(viewer), dispatch: {mode: queued ? "supabase" : "gateway", queueEnabled: queued, workerOnline: false}};
  if (!viewer || !canOperate) return {...base, instances: [], audits: []};
  if (queued) await reconcileExpiredDispatches([viewer.id]);
  const [records, audits] = await Promise.all([
    prisma.quantSuiteInstance.findMany({where: {userId: viewer.id}}),
    prisma.quantSuiteCommand.findMany({where: {userId: viewer.id}, orderBy: {createdAt: "desc"}, take: 40, select: {id: true, action: true, engine: true, createdAt: true, status: true, result: true}}),
  ]);
  const instances = await Promise.all(QUANT_ENGINES.map(async engine => {
    const record = records.find(item => item.engine === engine.id);
    const config = record ? quantConfigSchema.parse(record.config) : defaultQuantConfig(engine.id);
    let runtime = unavailableRuntime();
    if (queued) {
      runtime = await dispatchRuntime(viewer.id, engine.id, record);
    } else if (gatewayConfigured()) {
      try { runtime = (await gatewayCommand({userId: viewer.id, engine: engine.id, action: "status", config, requestId: randomUUID()})).runtime ?? unavailableRuntime(); }
      catch { runtime = unavailableRuntime(true); }
    }
    return {engine: engine.id, config, updatedAt: record?.updatedAt ?? null, revision: record?.revision ?? 0, pendingCommand: record?.activeCommandId ?? null, runtime};
  }));
  return {...base, dispatch: {...base.dispatch, workerOnline: queued && await dispatchWorkerOnline(viewer.id)}, instances, audits: audits.map(({result, ...entry}) => ({...entry, message: result && typeof result === "object" && !Array.isArray(result) && typeof result.message === "string" ? result.message : undefined}))};
}

export async function executeQuantCommand(viewer: Viewer, input: QuantCommand) {
  if (!hasQuantAccess(viewer)) throw new QuantError("量化交易集操作需要已登录且通过验证的 Max 或管理员账户。", 403);
  if (input.action === "save-config" && !input.config) throw new QuantError("请提交完整配置。");
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const duplicate = await prisma.quantSuiteCommand.findUnique({where: {userId_requestId: {userId: viewer.id, requestId: input.requestId}}});
  if (duplicate) {
    if (duplicate.payloadHash !== hash) throw new QuantError("操作编号已用于不同请求，请刷新后重试。", 409);
    return duplicate.result ?? {ok: false, message: "该操作已提交，等待交易服务器确认；请查看运行记录。"};
  }
  const record = await prisma.quantSuiteInstance.findUnique({where: {userId_engine: {userId: viewer.id, engine: input.engine}}});
  const config = input.action === "save-config" ? input.config! : record ? quantConfigSchema.parse(record.config) : null;
  if (!config) throw new QuantError("请先保存该引擎的配置。");
  if (input.action !== "save-config" && input.config && JSON.stringify(input.config) !== JSON.stringify(config)) throw new QuantError("配置已发生变化，请先保存再执行。", 409);
  if (input.action === "start" && config.mode === "live") {
    if (!hasQuantLiveAccess(viewer)) throw new QuantError("实盘启动需要已通过双重验证的管理员。", 403);
    if (input.confirmation !== `LIVE ${input.engine}`) throw new QuantError(`请输入 LIVE ${input.engine} 确认实盘启动。`);
  }
  const queued = dispatchEnabled();
  if (input.action !== "save-config" && !queued && !gatewayConfigured()) throw new QuantError("尚未连接交易服务器；请先完成服务器接入。", 503);
  if (queued && input.action === "start") await assertDispatchStartReady(viewer.id, input.engine, record, config);
  const command = await prisma.$transaction(async tx => {
    const created = await tx.quantSuiteCommand.create({data: {userId: viewer.id, engine: input.engine, action: input.action, requestId: input.requestId, payloadHash: hash}});
    const instance = await tx.quantSuiteInstance.upsert({where: {userId_engine: {userId: viewer.id, engine: input.engine}}, create: {userId: viewer.id, engine: input.engine, config: json(config)}, update: {}});
    if (record && instance.revision !== record.revision) throw new QuantError("配置已被另一操作更新，请刷新后重试。", 409);
    // Stop remains available after a lost acknowledgement so users can halt the actual runtime.
    const locked = await tx.quantSuiteInstance.updateMany({where: {id: instance.id, ...(input.action === "stop" ? {} : {activeCommandId: null, revision: instance.revision})}, data: {activeCommandId: created.id, controlSequence: {increment: 1}}});
    if (!locked.count) throw new QuantError("该引擎有尚未确认的操作。请检查运行记录；必要时使用停止操作。", 409);
    const fenced = await tx.quantSuiteInstance.findUniqueOrThrow({where: {id: instance.id}});
    if (input.action === "save-config") {
      await tx.quantSuiteInstance.update({where: {id: instance.id}, data: {config: json(config), revision: {increment: 1}, activeCommandId: null}});
      const result = {ok: true, message: "配置已保存。执行时将核验服务器的策略与账户配置。", config};
      await tx.quantSuiteCommand.update({where: {id: created.id}, data: {status: "SUCCEEDED", result: json(result)}});
      return {...created, result, controlSequence: fenced.controlSequence};
    }
    if (queued) {
      const result = await enqueueDispatch(tx, {id: created.id, userId: viewer.id, engine: input.engine, action: input.action, requestId: input.requestId, controlSequence: fenced.controlSequence, revision: instance.revision, config});
      return {...created, result, controlSequence: fenced.controlSequence};
    }
    return {...created, controlSequence: fenced.controlSequence};
  });
  if (input.action === "save-config") return command.result;
  if (queued) return command.result;
  let result: GatewayReply;
  let dispatched = false;
  try {
    if (["start", "backtest", "optimize"].includes(input.action)) {
      const preflight = await gatewayCommand({userId: viewer.id, engine: input.engine, action: "preflight", targetAction: input.action, config, requestId: randomUUID()});
      const capability = input.action === "start" ? config.mode : input.action;
      if (!preflight.ok || !preflight.runtime?.capabilities?.includes(capability)) {
        result = {ok: false, message: preflight.message ?? "该引擎尚未满足执行条件。", blockers: preflight.blockers ?? ["当前运行环境未启用该功能。"], runtime: preflight.runtime};
      } else {
        const latest = await prisma.quantSuiteInstance.findUnique({where: {userId_engine: {userId: viewer.id, engine: input.engine}}});
        if (latest?.activeCommandId !== command.id) throw new QuantError("启动前收到另一项停止或控制操作，本次任务已取消。", 409);
        dispatched = true;
        result = await gatewayCommand({userId: viewer.id, engine: input.engine, action: input.action, config, requestId: input.requestId, controlSequence: command.controlSequence});
      }
    } else {
      dispatched = input.action === "stop";
      result = await gatewayCommand({userId: viewer.id, engine: input.engine, action: input.action, config, requestId: input.requestId, ...(input.action === "stop" ? {controlSequence: command.controlSequence} : {})});
    }
  } catch (error) {
    const message = error instanceof QuantError ? error.message : "交易服务器操作未确认，请检查运行记录。";
    const failed = {ok: false, message};
    // Persist ambiguity and retain the lock: a timeout must never automatically trigger a second live start.
    await prisma.$transaction(async tx => {
      await tx.quantSuiteCommand.update({where: {id: command.id}, data: {status: dispatched ? "UNKNOWN" : "REJECTED", result: json(failed)}});
      if (!dispatched) await tx.quantSuiteInstance.updateMany({where: {userId: viewer.id, engine: input.engine, activeCommandId: command.id}, data: {activeCommandId: null}});
    });
    throw new QuantError(message, 502);
  }
  await prisma.$transaction(async tx => {
    await tx.quantSuiteCommand.update({where: {id: command.id}, data: {status: result.ok ? "SUCCEEDED" : "REJECTED", result: json(result)}});
    await tx.quantSuiteInstance.updateMany({where: {userId: viewer.id, engine: input.engine, activeCommandId: command.id}, data: {activeCommandId: null}});
  });
  return result;
}
