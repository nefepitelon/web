# Authentication security controls

Updated 2026-11-19 (Asia/Shanghai).

## Application controls

- Password and registration requests use persistent, independent IP and identity rate-limit buckets. Rotating an email no longer resets the source IP budget, and rotating an IP no longer resets the target account budget. Keys contain truncated SHA-256 digests, not raw emails or addresses.
- All authentication starts share a 40-request / 10-minute source IP budget. Email delivery is limited to 8 / hour / IP, registration to 5 / hour / IP, and password attempts to 12 / 10 minutes / normalized email. Magic links and signup share an email-delivery identity budget of 5 / 10 minutes.
- A database/limiter outage returns 503 before contacting Supabase. Auth JSON requests are capped at 16 KiB before JSON parsing.
- Magic links are for existing accounts (`shouldCreateUser: false`). New accounts use the explicit registration or Google flow.
- Cookie mutation endpoints require a matching Origin, matching Referer, or browser `Sec-Fetch-Site: same-origin`. Cross-site and sibling-site requests are rejected. Logout is POST only.
- Vercel forwarding headers are accepted only on Vercel. Other installations must opt into `TRUST_PROXY_HEADERS=true` only behind an edge that overwrites those headers.
- MFA recovery cookies are signed for a specific verified Supabase `session_id`, user, current factor ID and activation timestamp, with issuer, audience, algorithm and age checks. Prior unbound cookies no longer grant MFA access; users complete a current TOTP or unused backup code. Factor changes revoke recovery proofs. Backup codes remain one-time atomic claims. Disabling MFA additionally requires verified Supabase AAL2 rather than a recovery cookie alone.
- The login and second-factor redirect targets use the same origin-preserving destination validator.

## Legacy AI and publishing boundary

The eight paid or mutating AI handlers now live in `lib/legacy-handlers`, with no independently deployed `api/*.js` copy. The Next adapter authenticates each mutation against the server-verified current viewer, active database status, MFA state and configured entitlement before loading a handler. Public asset-report GET remains public; its AI POST requires `ai.low`, while content/research helpers require `ai.standard`. Publishing requires administrator membership with enabled and completed MFA, in addition to the existing explicit human confirmation.

AI starts are limited across endpoints by source IP, user, endpoint and a shared persistent calendar-month budget from `quotaFor`. Requests are JSON-only, capped at 64 KiB, audited without their prompt/body, and fail closed on security storage failure. No user-supplied identity header is trusted. Provider continuation IDs carry a signed, user-bound two-hour proof to prevent cross-user research continuation. Raw upstream error messages are not returned to clients.

## Supabase Auth controls required at the provider boundary

The publishable/anon key is intentionally public. Attackers can contact Supabase `/auth/v1/signup` directly, so application routes alone cannot prevent provider-side account spam.

1. Enable email confirmation and retain Supabase's signup, OTP and token rate limits. Review Auth audit logs for the incident window before deleting or banning anything.
2. Enable CAPTCHA protection in Supabase Auth, select Cloudflare Turnstile and configure its secret there. Configure the matching **public** site key as `NEXT_PUBLIC_AUTH_CAPTCHA_SITE_KEY` for this app, then rebuild. Add the production hostname to the Turnstile site's allowed hostnames. Do not place the CAPTCHA secret in any `NEXT_PUBLIC_*` variable.
3. Test the legitimate signup/login/CAPTCHA flow and separately verify that a direct signup without a CAPTCHA token is rejected. The application passes opaque tokens to Supabase; it does not treat token presence as verification.
4. Review allowed redirect URLs and remove broad production wildcards or unknown domains. Retain the exact `/auth/callback` URL and deliberately approved local/preview URLs.
5. Review administrators, sessions, MFA enrollments and Auth audit events. If a session or privileged identity is confirmed compromised, revoke it at Supabase; copying or rotating a cookie locally does not revoke an upstream refresh session.

Official provider reference: [Enable CAPTCHA protection](https://supabase.com/docs/guides/auth/auth-captcha). Trusted Vercel header behavior: [Request headers](https://vercel.com/docs/headers/request-headers).

## Regression coverage

`node --test tests/security_auth_hardening.test.js tests/auth_flows.test.js tests/access_codes.test.js`

`node --test tests/legacy_ai_security.test.js tests/ai_ops.test.js tests/asset_daily_report.test.js tests/alpha_automation_recommendation.test.js`

These tests exercise cross-origin rejection, spoofed forwarding headers, rotating-identity and rotating-source throttles, limiter failure behavior, body limits, actual MFA JWT signing/binding checks, CAPTCHA forwarding, magic-link signup prevention and unsafe redirect destinations. They use isolated mocks for provider/database calls and never create or alter production users.
