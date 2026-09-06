import { z } from "zod";
import { AlphaExecutionMode } from "@prisma/client";
import { alphaExecutionErrorResponse, requireAlphaOperator } from "@/lib/alpha-execution/access";
import { decryptTradingSecret } from "@/lib/alpha-execution/credentials";
import { marketFrom, modeFrom } from "@/lib/alpha-execution/data";
import { AlphaBinanceClient } from "@/lib/alpha-execution/binance";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";

const schema = z.object({ environment: z.enum(["testnet", "live"]), market: z.enum(["spot", "futures"]) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = schema.parse(await request.json());
    const environment = modeFrom(input.environment);
    const viewer = await requireAlphaOperator({ live: environment === AlphaExecutionMode.LIVE });
    const market = marketFrom(input.market);
    const credential = await prisma.alphaTradingCredential.findUnique({ where: { userId_environment_market: { userId: viewer.id, environment, market } } });
    if (!credential?.verifiedAt) throw new Error("当前 Binance 凭据尚未通过校验");
    const client = new AlphaBinanceClient({
      environment: environment === AlphaExecutionMode.LIVE ? "live" : "testnet",
      market: market === "SPOT" ? "spot" : "futures",
      apiKey: decryptTradingSecret(credential.apiKeyEncrypted),
      apiSecret: decryptTradingSecret(credential.apiSecretEncrypted),
      proxy: credential.proxyEncrypted ? decryptTradingSecret(credential.proxyEncrypted) : null
    });
    try {
      return Response.json({ ok: true, ...(await client.startUserStream()), expiresInSeconds: 3600 }, { headers: { "Cache-Control": "private, no-store" } });
    } finally {
      await client.close();
    }
  } catch (caught) {
    return alphaExecutionErrorResponse(caught);
  }
}
