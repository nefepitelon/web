import { z } from "zod";
import { AlphaExecutionMode, Prisma } from "@prisma/client";
import { tideSightExecutionErrorResponse, requireTideSightOperator } from "@/lib/tidesight/execution/access";
import { apiKeyHint, encryptTradingSecret, normalizeTradingProxy } from "@/lib/tidesight/execution/credentials";
import { tideSightCredentialSummary, marketFrom, modeFrom, writeTideSightAudit } from "@/lib/tidesight/execution/data";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";
import { withExecutionLease } from "@/lib/tidesight/execution/lease";
import { getOrCreateTideSightExecutionConfig } from "@/lib/tidesight/execution/data";

const schema = z.object({
  environment: z.enum(["live"]),
  acknowledgeDedicatedAccount: z.literal(true),
  market: z.enum(["futures"]),
  apiKey: z.string().trim().min(8).max(240),
  apiSecret: z.string().trim().min(8).max(512),
  proxy: z.string().trim().max(500).optional().default("")
});

export async function GET() {
  try {
    const viewer = await requireTideSightOperator();
    return Response.json({ ok: true, credentials: await tideSightCredentialSummary(viewer.id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) {
    return tideSightExecutionErrorResponse(caught);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireTideSightOperator();
    const input = schema.parse(await request.json());
    const environment = modeFrom(input.environment);
    if (environment === AlphaExecutionMode.LIVE) await requireTideSightOperator({ live: true });
    const market = marketFrom(input.market);
    const proxy = normalizeTradingProxy(input.proxy);
    const credential = await withExecutionLease(viewer.id, async () => {
    await assertNoActiveExposure(viewer.id);
    const saved = await prisma.tideSightTradingCredential.upsert({
      where: { userId_environment_market: { userId: viewer.id, environment, market } },
      update: {
        apiKeyEncrypted: encryptTradingSecret(input.apiKey),
        apiSecretEncrypted: encryptTradingSecret(input.apiSecret),
        proxyEncrypted: proxy ? encryptTradingSecret(proxy) : null,
        apiKeyHint: apiKeyHint(input.apiKey),
        verifiedAt: null,
        permissionSummary: Prisma.DbNull,
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
    await revokeLive(viewer.id);
    return saved;
    });
    await writeTideSightAudit({ userId: viewer.id, state: "CREATED", status: "PENDING", message: `${environment}/${market} Binance 凭据已加密保存，等待连接与权限校验。`, metadata: { credentialId: credential.id, proxyConfigured: Boolean(proxy) } });
    return Response.json({ ok: true, credentials: await tideSightCredentialSummary(viewer.id) }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) {
    return tideSightExecutionErrorResponse(caught);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireTideSightOperator();
    const url = new URL(request.url);
    const environment = modeFrom(url.searchParams.get("environment") ?? "");
    const market = marketFrom(url.searchParams.get("market") ?? "");
    if (environment !== AlphaExecutionMode.LIVE) throw new Error("无效的凭据环境");
    if (environment === AlphaExecutionMode.LIVE) await requireTideSightOperator({ live: true });
    await withExecutionLease(viewer.id, async () => {
      await assertNoActiveExposure(viewer.id);
      await prisma.tideSightTradingCredential.deleteMany({ where: { userId: viewer.id, environment, market } });
      await revokeLive(viewer.id);
    });
    await writeTideSightAudit({ userId: viewer.id, state: "CANCELED", status: "FINAL", message: `${environment}/${market} Binance 凭据已删除并撤销对应执行权限。` });
    return Response.json({ ok: true, credentials: await tideSightCredentialSummary(viewer.id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) {
    return tideSightExecutionErrorResponse(caught);
  }
}

async function assertNoActiveExposure(userId: string) {
  const [positions, orders] = await Promise.all([
    prisma.tideSightTradingPosition.count({ where: { userId, environment: "LIVE", closedAt: null } }),
    prisma.tideSightTradingOrder.count({ where: { userId, environment: "LIVE", status: { notIn: ["FILLED", "CANCELED", "REJECTED", "EXPIRED"] } } }),
  ]);
  if (positions || orders) throw new Error("存在未结持仓或订单，不能替换/删除凭据；请先完成平仓和健康对账");
}
async function revokeLive(userId: string) {
  await getOrCreateTideSightExecutionConfig(userId);
  await prisma.tideSightExecutionConfig.update({ where: { userId }, data: { liveEnabled: false, liveUnlockedAt: null, activeMode: "PAPER", autoExecuteEnabled: false, autoGeneration: null, reconciliationHealthy: false, lastReconciledAt: null } });
}
