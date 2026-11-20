import { alphaExecutionErrorResponse, requireAlphaReadOperator } from "@/lib/alpha-execution/access";
import { assertSameOrigin } from "@/lib/request-security";
import { handleStmTradeAction, stmTradingStatus } from "@/lib/stm-hunt/trading";
import { redactSecretText } from "@/lib/secret-redaction";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };
function failure(error: unknown) {
  if (error instanceof Error) {
    // RPC clients can include their configured URL in diagnostic errors.
    // Preserve access-error status while removing provider credential URLs.
    error.message = redactSecretText(error.message, [process.env.BSC_RPC_URL ?? "", process.env.GOPLUS_ACCESS_TOKEN ?? ""]);
  }
  return alphaExecutionErrorResponse(error);
}
export async function GET() {
  try {
    const viewer = await requireAlphaReadOperator();
    return Response.json(await stmTradingStatus(viewer.id), { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 16_384) throw new Error("交易请求内容过大");
    const body = await request.text();
    if (Buffer.byteLength(body) > 16_384) throw new Error("交易请求内容过大");
    const raw = JSON.parse(body);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("交易请求格式无效");
    return Response.json(await handleStmTradeAction(raw), { headers });
  } catch (error) { return failure(error); }
}
