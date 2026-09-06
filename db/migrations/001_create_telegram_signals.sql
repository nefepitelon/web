create table if not exists public.telegram_signals (
  dedupe_hash text primary key,
  telegram_chat_id text,
  telegram_message_id text,
  channel_username text not null,
  symbol text,
  pair text,
  direction text not null default 'unknown' check (direction in ('long', 'short', 'unknown')),
  price numeric,
  price_change_pct numeric,
  oi_change_pct numeric,
  trigger_type text not null default 'unknown',
  signal_time timestamptz not null,
  confidence numeric(4, 2) not null check (confidence >= 0 and confidence <= 1),
  parse_status text not null check (parse_status in ('parsed', 'partial', 'unparsed')),
  raw_text text not null,
  source_mode text not null check (source_mode in ('webhook', 'mock', 'public_preview')),
  source_message_url text,
  received_at timestamptz not null default now()
);

create unique index if not exists telegram_signals_message_identity_idx
  on public.telegram_signals (telegram_chat_id, telegram_message_id)
  where telegram_chat_id is not null and telegram_message_id is not null;

create index if not exists telegram_signals_signal_time_idx
  on public.telegram_signals (signal_time desc);

create index if not exists telegram_signals_symbol_time_idx
  on public.telegram_signals (symbol, signal_time desc);
