# α-RadarTP signal stream

The signal stream now reads the public **EQN OI/Price Monitor** channel at
<https://t.me/EQN_OI_Price_monitor>. It uses Telegram's public HTML preview first,
then a fresh read-only reader and Telegram's alternate preview hostname.

`TELEGRAM_TARGET_CHANNEL` defaults to `EQN_OI_Price_monitor`. An existing deployment
override must be updated to this username or removed to use the default. The
example configuration has the new value. `TELEGRAM_TARGET_CHAT_ID` is optional;
an explicitly different channel username is rejected even if an old chat ID
remains configured. Existing webhook credentials and storage credentials retain
their original roles; none are exposed to the browser.

The current EQN format includes bare pairs such as `PIPPINUSDT`, bilingual
`Longs building` / `Longs unwinding` reports, and Unicode names such as
`龙虾USDT`. Numeric notices and posts without identifiable price/OI data are
excluded from the public market stream. Unicode names remain accurately labelled
in the feed; execution separately requires a valid, supported exchange market.

Telegram message IDs and publication timestamps remain unchanged. HTML uses the
publication `datetime`; reader messages can use the channel's explicit
`(UTC+8)` timestamp as `message_text`. If neither exists, publication time is
null. Receipt time is stored separately and never becomes an execution event
time. The stream keeps up to 20 genuine messages, so fewer may be returned when
the public preview contains notices or media-only posts.

Every memory/Blob/Supabase read scopes the channel before applying its limit.
Blob now uses `telegram_signals/<channel>/` and
`telegram_signal_feed/<channel>/latest.json`; Supabase filters
`channel_username=eq.eqn_oi_price_monitor` before limiting. Old-channel rows are
left intact in storage and cannot join the new feed or automated signal pool.

`GET /api/telegram-signal-collector?public=1` uses a matching persistent cache or
collects the source immediately on a cache miss. `&refresh=1` forces collection.
A source failure can return the captured EQN build snapshot, explicitly labelled
`stale: true` and `fallback: build_snapshot`; it is never represented as fresh
execution evidence. `&debug=1` exposes source attempt status without credentials.
Public-source attempts have 8/12/6-second timeouts, and each storage network
request has a three-second abort deadline.

Production persistence is provisioned by Prisma migration
`20261118130000_add_telegram_signal_storage`, promoting the collector's original
`db/migrations/001_create_telegram_signals.sql` into the automatic production
deployment path. It creates the table and channel/time index, enables RLS,
revokes access from PUBLIC/anon/authenticated, and grants only SELECT, INSERT and
UPDATE to Supabase's existing BYPASSRLS `service_role`. The browser reads the
sanitized application API; it has no direct table access. The migration also
notifies PostgREST to reload its schema. It preserves existing rows and does not
invent timestamps for untimed messages.

The public fixture in `tests/fixtures/eqn-oi-public-preview.json` records the
actual source URL, capture time, original IDs, text and publication timestamps
observed on 2026-11-18. The fallback snapshot is derived from those captures.
