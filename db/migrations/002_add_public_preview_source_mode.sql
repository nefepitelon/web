alter table if exists public.telegram_signals
  drop constraint if exists telegram_signals_source_mode_check;

alter table if exists public.telegram_signals
  add constraint telegram_signals_source_mode_check
  check (source_mode in ('webhook', 'mock', 'public_preview'));
