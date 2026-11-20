CREATE TABLE "stm_hunt_records" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "stm_hunt_records_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "stm_hunt_records_userId_kind_key_key" ON "stm_hunt_records"("userId", "kind", "key");
CREATE INDEX "stm_hunt_records_userId_kind_createdAt_idx" ON "stm_hunt_records"("userId", "kind", "createdAt");
ALTER TABLE "stm_hunt_records" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "stm_hunt_records" FROM PUBLIC;
DO $$ DECLARE api_role TEXT; BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.stm_hunt_records FROM %I', api_role);
    END IF;
  END LOOP;
END $$;
