import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const [roles, plans, gates, settings, rls] = await Promise.all([
    prisma.role.count(),
    prisma.plan.count(),
    prisma.contentGate.count(),
    prisma.systemSetting.count(),
    prisma.$queryRawUnsafe(`
      SELECT count(*)::int AS count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relrowsecurity
        AND c.relname IN ('users', 'profiles', 'subscriptions', 'audit_logs')
    `),
  ]);

  console.log(
    JSON.stringify({
      roles,
      plans,
      gates,
      settings,
      rlsProtectedSampleTables: Number(rls[0]?.count ?? 0),
    }),
  );
} finally {
  await prisma.$disconnect();
}
