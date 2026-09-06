import { z } from "zod";
import { AlphaExecutionMode } from "@prisma/client";
import { alphaExecutionErrorResponse, requireAlphaOperator } from "@/lib/alpha-execution/access";
import { apiKeyHint, encryptTradingSecret, normalizeTradingProxy } from "@/lib/alpha-execution/credentials";
import { alphaCredentialSummary, marketFrom, modeFrom, writeAlphaAudit } from "@/lib/alpha-execution/data";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";

const schema = z.object({
  environment: z.enum(["testnet", "live"]),
  market: z.enum(["spot", "futures"]),
  apiKey: z.string().trim().min(8).max(240),
  apiSecret: z.string().trim().min(8).max(512),
  proxy: z.string().trim().max(500).optional().default("")
});

export async function GET() {
  try {
    const viewer = await requireAlphaOperator();
    return Response.json({ ok: true, credentials: await alphaCredentialSummary(viewer.id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) {
    return alphaExecutionErrorResponse(caught);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireAlphaOperator();
    const input = schema.parse(await request.json());
    const environment = modeFrom(input.environment);
    if (environment === AlphaExecutionMode.LIVE) await requireAlphaOperator({ live: true });
    const market = marketFrom(input.market);
    const proxy = normalizeTradingProxy(input.proxy);
    const credential = await prisma.alphaTradingCredential.upsert({
      where: { userId_environment_market: { userId: viewer.id, environment, market } },
      update: {
        apiKeyEncrypted: encryptTradingSecret(input.apiKey),
        apiSecretEncrypted: encryptTradingSecret(input.apiSecret),
        proxyEncrypted: proxy ? encryptTradingSecret(proxy) : null,
        apiKeyHint: apiKeyHint(input.apiKey),
        verifiedAt: null,
        permissionSummary: undefined,
        lastError: null,
        enabled: true
      },
      create: {
        userId: viewer.id,
        environment,
        market,
        apiKeyEncrypted: encryptTradingSecret(input.apiKey),
        apiSecretEncrypted: encryptTradingSecret(input.apiSecret),
        proxyEncrypted: proxy ? encryptTradingSecret(proxy) : null,
        apiKeyHint: apiKeyHint(input.apiKey)
      }
    });
    await writeAlphaAudit({ userId: viewer.id, state: "CREATED", status: "PENDING", message: `${environment}/${market} Binance 凭据已加密保存，等待连接与权限校验。`, metadata: { credentialId: credential.id, proxyConfigured: Boolean(proxy) } });
    return Response.json({ ok: true, credentials: await alphaCredentialSummary(viewer.id) }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) {
    return alphaExecutionErrorResponse(caught);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireAlphaOperator();
    const url = new URL(request.url);
    const environment = modeFrom(url.searchParams.get("environment") ?? "");
    const market = marketFrom(url.searchParams.get("market") ?? "");
    if (environment !== AlphaExecutionMode.TESTNET && environment !== AlphaExecutionMode.LIVE) throw new Error("无效的凭据环境");
    if (environment === AlphaExecutionMode.LIVE) await requireAlphaOperator({ live: true });
    await prisma.alphaTradingCredential.deleteMany({ where: { userId: viewer.id, environment, market } });
    if (environment === AlphaExecutionMode.LIVE) {
      await prisma.alphaExecutionConfig.updateMany({ where: { userId: viewer.id }, data: { liveEnabled: false, liveUnlockedAt: null, activeMode: AlphaExecutionMode.PAPER, autoExecuteEnabled: false } });
    }
    await writeAlphaAudit({ userId: viewer.id, state: "CANCELED", status: "FINAL", message: `${environment}/${market} Binance 凭据已删除并撤销对应执行权限。` });
    return Response.json({ ok: true, credentials: await alphaCredentialSummary(viewer.id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) {
    return alphaExecutionErrorResponse(caught);
  }
}
