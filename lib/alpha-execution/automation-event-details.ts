import "server-only";
import { prisma } from "@/lib/prisma";
import { summarizeAutomationSelection } from "./automation-summary";

// Audit metadata is immutable and can be large. Read one owned event only after
// the operator asks for its diagnostics; never include it in status polling.
export async function automationEventDetails(userId: string, id: string) {
  const event = await prisma.alphaTradingAudit.findFirst({
    where: { id, userId, status: "AUTO_SCAN" }, select: { metadata: true },
  });
  return event ? { id, summary: summarizeAutomationSelection(event.metadata) } : null;
}
