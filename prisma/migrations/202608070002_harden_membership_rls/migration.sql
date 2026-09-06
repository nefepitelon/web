-- welinkBTC business data is served through authenticated Vercel routes.
-- Keep the Supabase Data API from exposing Prisma-managed membership tables.
DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users',
    'auth_accounts',
    'profiles',
    'roles',
    'user_roles',
    'plans',
    'subscriptions',
    'social_accounts',
    'wallets',
    'wallet_challenges',
    'two_factor_settings',
    'backup_codes',
    'referral_codes',
    'referrals',
    'commission_ledger',
    'content_gates',
    'api_keys',
    'audit_logs',
    'webhook_events',
    'system_settings',
    'rate_limit_buckets'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated',
      table_name
    );
  END LOOP;
END $$;
