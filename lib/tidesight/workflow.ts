import { sleep } from "workflow";
import type { MacdMonitor } from "./macd-data";

export async function tideSightAutomationWorkflow(userId: string, generation: string) {
  "use workflow";
  try {
    while (true) {
      const cycle = await scan(userId, generation);
      if (cycle.stop) return;
      for (const signal of cycle.signals) await executeSignal(userId, generation, signal);
      await sleep(30_000);
    }
  } catch (caught) { await failed(userId, generation, caught instanceof Error ? caught.message : "自动工作流中断"); }
}

async function scan(userId: string, generation: string) {
  "use step";
  const { scanAutomation } = await import("./automation-runtime");
  return scanAutomation(userId, generation);
}
async function executeSignal(userId: string, generation: string, signal: MacdMonitor) {
  "use step";
  const { executeAutomaticSignal } = await import("./automation-runtime");
  await executeAutomaticSignal(userId, generation, signal);
}
executeSignal.maxRetries = 0;
async function failed(userId: string, generation: string, message: string) {
  "use step";
  const { stopAutomationOnError } = await import("./automation-runtime");
  await stopAutomationOnError(userId, generation, new Error(message));
}

// Started before a manual order is sent so a terminated HTTP request cannot orphan monitoring.
export async function tideSightPositionWorkflow(userId: string, planId: string) {
  "use workflow";
  while (await monitorPosition(userId, planId)) await sleep(30_000);
}
async function monitorPosition(userId: string, planId: string) {
  "use step";
  const { prisma } = await import("@/lib/prisma");
  const { reconcileExecution } = await import("./execution/service");
  const plan = await prisma.tideSightExecutionPlan.findFirst({ where: { id: planId, userId }, include: { position: true } });
  if (!plan || plan.position?.closedAt || ["CANCELED", "FAILED", "CLOSED", "KILLED"].includes(plan.state)) return false;
  if (["AWAITING_CONFIRMATION", "PLANNED"].includes(plan.state)) return plan.expiresAt.getTime() > Date.now();
  try { await reconcileExecution(userId, { environment: "LIVE", market: "FUTURES" }); } catch { /* Next tick retries reads/reconciliation, never an entry. */ }
  return true;
}
