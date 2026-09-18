# Supabase Egress follow-up — 2026-09-18

## Observed cause

The September 8 spike was historical; the current increase was reproduced from the production request stream and database statistics. The box-breakout dashboard generated public quote requests every three seconds and chart requests for every visible card. Both public endpoints passed through Supabase session validation and each request also persisted a database rate-limit bucket.

The rate-limit audit recorded more than 3,000 quote/chart bucket updates on September 18 before this fix. A live database delta independently showed the rate-limit upsert as the only repeating application write during the sample window.

## Remediation

- Public quote and chart endpoints bypass Supabase session middleware.
- Public market-data limits use bounded in-memory buckets instead of a Supabase write per request.
- Quote responses use a 10-second CDN cache and chart responses use a 15-minute CDN cache with stale serving.
- Quote polling is 15 seconds for crypto and 30 seconds for A shares.
- Signed-in dashboard state polls every 10 seconds only while a scan is active, and every five minutes while idle.
- Browser chart data is reused for 15 minutes.
- Persistent rate limits that remain security-sensitive select only the counter column from Supabase.

These changes keep authentication and persistent limits on state-changing and private endpoints while removing Supabase from the high-frequency public-data path.
