import { sleep } from "workflow";
import { tickHostedHedge, continueHostedHedge } from "./steps";

export async function hostedHedgeWorkflow(id: string, generation: string) {
  "use workflow";
  for (let cycle = 0; cycle < 300; cycle++) {
    const result = await tickHostedHedge(id, generation);
    if (result.stop) return;
    await sleep(result.delay);
  }
  await continueHostedHedge(id, generation);
}
