ALTER TABLE "AlphaAutomationConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AlphaAutomationOrder" ENABLE ROW LEVEL SECURITY;

-- These tables are only accessed by the authenticated server through Prisma.
-- Never expose grants or order reservations through Supabase's browser roles.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "AlphaAutomationConfig", "AlphaAutomationOrder" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "AlphaAutomationConfig", "AlphaAutomationOrder" FROM authenticated;
  END IF;
END $$;
