import { sleep } from "workflow";
import { runHostedGridOpsSession } from "@/lib/grid-ops-hosted/runtime";

export async function hostedGridOpsWorkflow(botId: string) {
  "use workflow";

  while (true) {
    const result = await runHostedGridOpsSession(botId);
    if (result.stop) return { status: "stopped" as const };
    await sleep(result.delayMs);
  }
}
