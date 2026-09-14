CREATE TABLE "quant_suite_instances" (
  "id" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "engine" TEXT NOT NULL,
  "config" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "controlSequence" INTEGER NOT NULL DEFAULT 0,
  "activeCommandId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quant_suite_instances_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "quant_suite_instances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "quant_suite_instances_userId_engine_key" ON "quant_suite_instances"("userId", "engine");
CREATE TABLE "quant_suite_commands" (
  "id" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "engine" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "result" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quant_suite_commands_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "quant_suite_commands_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "quant_suite_commands_userId_requestId_key" ON "quant_suite_commands"("userId", "requestId");
CREATE INDEX "quant_suite_commands_userId_createdAt_idx" ON "quant_suite_commands"("userId", "createdAt");

-- The Supabase Data API must not bypass server-side tenant and trading authorization.
ALTER TABLE "quant_suite_instances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quant_suite_commands" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "quant_suite_instances" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE "quant_suite_commands" FROM anon, authenticated;
