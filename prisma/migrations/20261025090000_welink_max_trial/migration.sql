-- Create the permanent WELINK campaign. The code can be redeemed once per
-- account; maxRedemptions and expiresAt remain NULL so the campaign itself
-- has no global quota or expiry.
INSERT INTO "access_codes" (
  "id",
  "codeHash",
  "codeHint",
  "label",
  "active",
  "durationDays",
  "maxRedemptions",
  "redemptionCount",
  "startsAt",
  "expiresAt",
  "createdAt",
  "updatedAt"
)
VALUES (
  'welink-max-trial-20261025',
  'f306c19613b79ae7a3fcc122c98c86995fc3ce140caf6dda75c2e683332d5f6e',
  'WELINK',
  'WELINK · 三个月 MAX 体验',
  TRUE,
  90,
  NULL,
  0,
  TIMESTAMP '2026-10-25 00:00:00',
  NULL,
  TIMESTAMP '2026-10-25 00:00:00',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("codeHash") DO UPDATE SET
  "codeHint" = EXCLUDED."codeHint",
  "label" = EXCLUDED."label",
  "active" = TRUE,
  "durationDays" = 90,
  "maxRedemptions" = NULL,
  "startsAt" = EXCLUDED."startsAt",
  "expiresAt" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP;

-- Give every account that already exists on 2026-10-25 the same complete
-- three-month window. If an account had already used WELINK, reset that one
-- campaign redemption to the uniform grant window instead of adding a second
-- redemption.
INSERT INTO "access_code_redemptions" (
  "id",
  "accessCodeId",
  "userId",
  "source",
  "startsAt",
  "endsAt",
  "createdAt"
)
SELECT
  'welink-20261025-' || REPLACE(user_record."id"::TEXT, '-', ''),
  access_code."id",
  user_record."id",
  'campaign_20261025',
  TIMESTAMP '2026-10-25 00:00:00',
  TIMESTAMP '2027-01-25 00:00:00',
  CURRENT_TIMESTAMP
FROM "users" AS user_record
CROSS JOIN "access_codes" AS access_code
WHERE access_code."codeHash" = 'f306c19613b79ae7a3fcc122c98c86995fc3ce140caf6dda75c2e683332d5f6e'
ON CONFLICT ("accessCodeId", "userId") DO UPDATE SET
  "source" = EXCLUDED."source",
  "startsAt" = EXCLUDED."startsAt",
  "endsAt" = EXCLUDED."endsAt";

UPDATE "access_codes" AS access_code
SET
  "redemptionCount" = (
    SELECT COUNT(*)::INTEGER
    FROM "access_code_redemptions" AS redemption
    WHERE redemption."accessCodeId" = access_code."id"
  ),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE access_code."codeHash" = 'f306c19613b79ae7a3fcc122c98c86995fc3ce140caf6dda75c2e683332d5f6e';

