// Keep Node/database imports inside step bodies, outside the workflow VM.
export async function tickHostedHedge(id: string, generation: string) {
  "use step";
  const { hostedHedgeTick } = await import("./hosted");
  return hostedHedgeTick(id, generation);
}
tickHostedHedge.maxRetries = 0;

export async function continueHostedHedge(id: string, generation: string) {
  "use step";
  const { rotateHostedHedgeRun } = await import("./hosted");
  return rotateHostedHedgeRun(id, generation);
}
continueHostedHedge.maxRetries = 0;
