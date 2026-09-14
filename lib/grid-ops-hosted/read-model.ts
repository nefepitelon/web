import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Project JSON inside Postgres so private recovery data stays in the database. */
export async function readHostedGridOpsView(
  userId: string,
  botId: string,
  section: "views" | "hedge" | "markets",
  target?: string,
): Promise<Record<string, any>> {
  const projection = section === "markets"
    ? Prisma.sql`"marketCatalog" -> ${target ?? ""}`
    : section === "hedge"
      ? Prisma.sql`COALESCE(snapshot -> 'hedgeDashboard', snapshot -> 'hedge')`
      : target
        ? Prisma.sql`snapshot -> 'views' -> ${target}`
        : Prisma.sql`snapshot -> 'views'`;
  const rows = await prisma.$queryRaw<Array<{ value: Prisma.JsonValue | null }>>(Prisma.sql`
    SELECT ${projection} AS value FROM hosted_grid_ops_bots
    WHERE id = ${botId} AND "userId" = ${userId}::uuid LIMIT 1
  `);
  const value = rows[0]?.value;
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
