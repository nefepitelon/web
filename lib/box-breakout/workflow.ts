import { FatalError, getStepMetadata, sleep } from "workflow";
import type { PreparedScan } from "./service";
import type { Topic } from "./types";

export async function boxScanWorkflow(userId: string, jobId: string) {
  "use workflow";
  try {
    const prepared = await prepare(userId, jobId);
    if (!prepared) { await cleanup(userId, jobId); return; }
    for (let offset = 0; offset < prepared.universe.length; offset += 8) {
      const chunk = { ...prepared, universe: prepared.universe.slice(offset, offset + 8) };
      if (!(await scanChunk(userId, jobId, chunk, offset))) { await cleanup(userId, jobId); return; }
    }
    await finish(userId, jobId, prepared.topics);
    await notify(userId, jobId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "后台扫描步骤异常，请稍后重试";
    await failed(userId, jobId, message);
    // Persist the dashboard failure first, then preserve the failed run in Workflow observability.
    throw error;
  }
}
async function prepare(userId: string, jobId: string) {
  "use step";
  const { prepareScan } = await import("./service");
  return prepareScan(userId, jobId, getStepMetadata().attempt);
}
async function scanChunk(userId: string, jobId: string, prepared: PreparedScan, offset: number) {
  "use step";
  const { processScanChunk } = await import("./service");
  return processScanChunk(userId, jobId, prepared, offset);
}
async function finish(userId: string, jobId: string, topics: Topic[]) {
  "use step";
  const { finishScan } = await import("./service");
  try { await finishScan(userId, jobId, topics); }
  catch (error) {
    if (error instanceof Error && error.message.startsWith("所有标的获取失败")) throw new FatalError(error.message);
    throw error;
  }
}
async function notify(userId: string, jobId: string) {
  "use step";
  const { notifyScan } = await import("./service");
  await notifyScan(userId, jobId);
}
notify.maxRetries = 0;
async function failed(userId: string, jobId: string, message: string) {
  "use step";
  const { failScan } = await import("./service");
  await failScan(userId, jobId, message);
}
async function cleanup(userId: string, jobId: string) {
  "use step";
  const { cleanChunks } = await import("./store");
  await cleanChunks(userId, jobId);
}

export async function boxScheduleWorkflow(userId: string, generation: string) {
  "use workflow";
  try {
    while (true) {
      const slot = await nextSlot(userId, generation);
      if (!slot) return;
      await sleep(new Date(slot));
      await dispatch(userId, generation, slot);
    }
  } catch { await scheduleFailed(userId, generation); }
}
async function nextSlot(userId: string, generation: string) {
  "use step";
  const { nextScheduledScan } = await import("./service");
  return nextScheduledScan(userId, generation);
}
async function dispatch(userId: string, generation: string, slot: string) {
  "use step";
  const { dispatchScheduledScan } = await import("./service");
  await dispatchScheduledScan(userId, generation, slot);
}
dispatch.maxRetries = 0;
async function scheduleFailed(userId: string, generation: string) {
  "use step";
  const { failSchedule } = await import("./service");
  await failSchedule(userId, generation);
}
