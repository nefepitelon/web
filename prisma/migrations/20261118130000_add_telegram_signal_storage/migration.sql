-- Promote the collector's original db/migrations/001 schema into the production
-- Prisma deployment path. This is additive and leaves existing channel history
-- untouched; the collector scopes reads by channel_username.
BEGIN;

CREATE TABLE IF NOT EXISTS public.telegram_signals (
  dedupe_hash text PRIMARY KEY,
  telegram_chat_id text,
  telegram_message_id text,
  channel_username text NOT NULL,
  symbol text,
  pair text,
  direction text NOT NULL DEFAULT 'unknown' CHECK (direction IN ('long', 'short', 'unknown')),
  price numeric,
  price_change_pct numeric,
  oi_change_pct numeric,
  trigger_type text NOT NULL DEFAULT 'unknown',
  signal_time timestamptz NOT NULL,
  confidence numeric(4, 2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  parse_status text NOT NULL CHECK (parse_status IN ('parsed', 'partial', 'unparsed')),
  raw_text text NOT NULL,
  source_mode text NOT NULL CHECK (source_mode IN ('webhook', 'mock', 'public_preview')),
  source_message_url text,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS telegram_signals_message_identity_idx
  ON public.telegram_signals (telegram_chat_id, telegram_message_id)
  WHERE telegram_chat_id IS NOT NULL AND telegram_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS telegram_signals_signal_time_idx
  ON public.telegram_signals (signal_time DESC);

CREATE INDEX IF NOT EXISTS telegram_signals_symbol_time_idx
  ON public.telegram_signals (symbol, signal_time DESC);

CREATE INDEX IF NOT EXISTS telegram_signals_channel_time_idx
  ON public.telegram_signals (channel_username, signal_time DESC);

-- Browser roles have no table privileges or RLS policy. Supabase service_role
-- has BYPASSRLS and receives only the operations used by this collector.
ALTER TABLE public.telegram_signals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.telegram_signals FROM PUBLIC;

DO $telegram_signal_privileges$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.telegram_signals FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.telegram_signals FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON TABLE public.telegram_signals FROM service_role;
    GRANT SELECT, INSERT, UPDATE ON TABLE public.telegram_signals TO service_role;
  END IF;
END
$telegram_signal_privileges$;

-- PostgREST otherwise retains its previous "table not found" schema cache.
NOTIFY pgrst, 'reload schema';

COMMIT;
