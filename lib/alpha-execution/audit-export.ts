import "server-only";
import { AlphaExecutionMode, AlphaMarketType, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const auditQuerySchema = z.object({
  mode: z.enum(["live", "paper", "all"]).default("live"),
  market: z.enum(["spot", "futures", "all"]).default("all"),
  format: z.enum(["json", "csv"]).default("json"),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
  cursor: z.string().max(1500).optional(),
  asOf: z.string().datetime().optional(),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;
const cursorSchema = z.object({ id: z.string().min(1).max(120), createdAt: z.string().datetime(), asOf: z.string().datetime() });
const linkedSelect = { environment: true, market: true, symbol: true } as const;
export const auditSelect = {
  id: true, state: true, status: true, message: true, metadata: true, createdAt: true,
  intentId: true, planId: true, orderId: true,
  intent: { select: linkedSelect }, order: { select: linkedSelect },
  plan: { select: { environment: true, market: true, intent: { select: { symbol: true } } } },
} as const;
type AuditRow = Prisma.AlphaTradingAuditGetPayload<{ select: typeof auditSelect }>;

export function auditScope(userId: string, query: AuditQuery, now = new Date()) {
  const cursor = query.cursor ? cursorSchema.parse(JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8"))) : null;
  const asOf = new Date(cursor?.asOf || query.asOf || now.toISOString());
  if (asOf.getTime() > now.getTime() || (cursor && new Date(cursor.createdAt).getTime() > asOf.getTime())) throw new Error("审计导出截止时间或游标无效");
  const environment = query.mode === "all" ? undefined : query.mode === "live" ? AlphaExecutionMode.LIVE : AlphaExecutionMode.PAPER;
  const market = query.market === "all" ? undefined : query.market === "spot" ? AlphaMarketType.SPOT : AlphaMarketType.FUTURES;
  const scope: Prisma.AlphaTradingAuditWhereInput[] = [];
  if (environment || market) {
    const relation = { ...(environment ? { environment } : {}), ...(market ? { market } : {}) };
    const metadata: Prisma.AlphaTradingAuditWhereInput[] = [];
    if (environment) metadata.push({ OR: ["environment", "mode"].flatMap((field) => [environment, environment.toLowerCase()].map((value) => ({ metadata: { path: [field], equals: value } }))) });
    if (market) metadata.push({ OR: [market, market.toLowerCase()].map((value) => ({ metadata: { path: ["market"], equals: value } })) });
    scope.push({ OR: [{ intent: { is: relation } }, { plan: { is: relation } }, { order: { is: relation } }, {
      intentId: null, planId: null, orderId: null, AND: metadata,
    }] });
  }
  if (cursor) scope.push({ OR: [
    { createdAt: { lt: new Date(cursor.createdAt) } },
    { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
  ] });
  const where: Prisma.AlphaTradingAuditWhereInput = { userId, createdAt: { lte: asOf }, ...(scope.length ? { AND: scope } : {}) };
  return { where, asOf: asOf.toISOString() };
}

export function publicAuditRow(row: AuditRow) {
  const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {};
  return {
    id: row.id, createdAt: row.createdAt.toISOString(), state: row.state, status: row.status, message: row.message,
    environment: row.order?.environment || row.plan?.environment || row.intent?.environment || metadata.environment || metadata.mode || null,
    market: row.order?.market || row.plan?.market || row.intent?.market || metadata.market || null,
    symbol: row.order?.symbol || row.plan?.intent?.symbol || row.intent?.symbol || null,
    intentId: row.intentId, planId: row.planId, orderId: row.orderId, metadata: row.metadata,
  };
}

export async function readAuditPage(userId: string, query: AuditQuery) {
  const { where, asOf } = auditScope(userId, query);
  const rows = await prisma.alphaTradingAudit.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: query.limit + 1, select: auditSelect });
  const hasMore = rows.length > query.limit;
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    items: page.map(publicAuditRow), hasMore, asOf,
    nextCursor: hasMore && last ? Buffer.from(JSON.stringify({ id: last.id, createdAt: last.createdAt.toISOString(), asOf })).toString("base64url") : null,
    scope: "ACCOUNT_SERVER_AUDITS", mode: query.mode, market: query.market,
    scopeNote: query.mode === "all" && query.market === "all" ? "当前账户全部服务端审计记录" : "已明确关联所选环境和市场的服务端审计；无法归属环境的账户事件不混入",
  };
}

const columns = ["id", "createdAt", "environment", "market", "symbol", "state", "status", "message", "intentId", "planId", "orderId", "metadata"] as const;
export function auditCsvLine(row: ReturnType<typeof publicAuditRow>) {
  return columns.map((column) => {
    const value = row[column];
    let text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
    if (/^[\s]*[=+@-]|^[\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  }).join(",") + "\r\n";
}

export async function auditCsvResponse(userId: string, query: AuditQuery) {
  if (query.cursor) throw new Error("CSV 导出从完整期间首条记录开始，不接受分页游标");
  const { where, asOf } = auditScope(userId, query);
  const count = await prisma.alphaTradingAudit.count({ where });
  if (count > 100_000) throw new Error("审计记录超过单次 CSV 的 100,000 条上限，请使用 JSON 游标分页导出；未生成截断文件");
  let cursor: string | undefined;
  let first = true;
  let done = false;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (done) { controller.close(); return; }
      try {
        const page = await readAuditPage(userId, { ...query, format: "json", limit: 1000, asOf, cursor });
        controller.enqueue(encoder.encode((first ? `\uFEFF${columns.join(",")}\r\n` : "") + page.items.map(auditCsvLine).join("")));
        first = false;
        cursor = page.nextCursor || undefined;
        if (!page.hasMore) { done = true; controller.close(); }
      } catch (error) { done = true; controller.error(error); }
    },
    cancel() { done = true; },
  });
  return new Response(stream, { headers: {
    "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "private, no-store",
    "Content-Disposition": `attachment; filename="alpha-audits-${query.mode}-${query.market}-${asOf.slice(0, 10)}.csv"`,
    "X-Export-Row-Count": String(count), "X-Export-As-Of": asOf,
    "X-Export-Scope": "account-server-audits-filtered-by-environment-and-market",
  } });
}
