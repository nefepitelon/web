import { sleep } from "workflow";

export async function bstockAutoWorkflow(ownerKey: string, generation: string) {
  "use workflow";
  while (true) {
    const result = await tick(ownerKey, generation);
    if (result.stop) return;
    await sleep(result.waitMs);
  }
}
async function tick(ownerKey: string, generation: string) {
  "use step";
  const { runAutoCycle } = await import("./bstock-auto-runtime");
  return runAutoCycle(ownerKey, generation);
}
// Durable retries re-enter through the lease and persisted order claim, so they
// reconcile an interrupted submission instead of broadcasting it again.
tick.maxRetries = 2;
