import { sleep } from "workflow";

export async function alphaAutomationWorkflow(userId: string, generation: string) {
  "use workflow";
  while (true) {
    const result = await tick(userId, generation);
    if (result.stop) return;
    await sleep(result.waitMs);
  }
}
async function tick(userId: string, generation: string) {
  "use step";
  const { runAlphaAutoCycle } = await import("./automation-runtime");
  return runAlphaAutoCycle(userId, generation);
}
tick.maxRetries = 2;
