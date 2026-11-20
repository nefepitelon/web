-- Business records are read and mutated through the authenticated application
-- server (Prisma), never directly through Supabase's public Data API.
-- Preserve all records, grants for trusted service roles, and table ownership.
-- Owners retain normal Prisma access: deliberately do not FORCE RLS.
DO $$
DECLARE
  table_name TEXT;
  api_role TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    '_prisma_migrations', 'telegram_signals',
    'users', 'classic_grid_bots', 'hedge_ops_runtimes',
    'hosted_grid_ops_bots', 'hosted_grid_ops_commands',
    'AlphaAutomationConfig', 'AlphaAutomationOrder',
    'alpha_trading_credentials', 'alpha_execution_configs', 'alpha_trade_intents',
    'alpha_execution_plans', 'alpha_trading_orders', 'alpha_trading_positions', 'alpha_trading_audits',
    'tidesight_trading_credentials', 'tidesight_execution_configs', 'tidesight_trade_intents',
    'tidesight_execution_plans', 'tidesight_trading_orders', 'tidesight_trading_positions',
    'tidesight_trading_audits', 'tidesight_auto_events',
    'toolbox_categories', 'toolbox_items', 'toolbox_columns', 'toolbox_cell_values', 'toolbox_favorites',
    'auth_accounts', 'profiles', 'roles', 'user_roles', 'plans', 'subscriptions', 'crypto_payments',
    'social_accounts', 'wallets', 'wallet_challenges', 'two_factor_settings', 'backup_codes',
    'referral_codes', 'referrals', 'commission_ledger',
    'wlb_accounts', 'wlb_transactions', 'wlb_ledger_entries', 'chain_transaction_claims',
    'user_onboarding_tasks', 'analytics_events', 'content_gates', 'api_keys', 'audit_logs',
    'research_articles', 'research_bookmarks', 'research_comments',
    'access_codes', 'access_code_redemptions', 'webhook_events', 'system_settings', 'rate_limit_buckets',
    'bstock_research_jobs', 'bstock_research_translations', 'bstock_research_shares',
    'bstock_trade_records', 'bstock_auto_configs', 'bstock_auto_orders',
    'bstock_auto_positions', 'bstock_auto_events',
    'quant_suite_instances', 'quant_suite_commands', 'quant_suite_dispatches', 'quant_suite_workers', 'quant_suite_devices'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NULL THEN
      RAISE EXCEPTION 'Expected business table public.% is missing', table_name;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC', table_name);
    FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', table_name, api_role);
      END IF;
    END LOOP;
  END LOOP;

  -- This trigger only raises on ledger mutation. Pin its resolution context
  -- and remove the inherited public RPC execution grant.
  ALTER FUNCTION public.prevent_wlb_ledger_mutation() SET search_path = pg_catalog;
  REVOKE EXECUTE ON FUNCTION public.prevent_wlb_ledger_mutation() FROM PUBLIC;
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.prevent_wlb_ledger_mutation() FROM %I', api_role);
    END IF;
  END LOOP;

  -- Future objects created by this migration role must not inherit public API
  -- grants before a later migration has a chance to configure their RLS.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM %I', api_role);
    END IF;
  END LOOP;
END $$;
