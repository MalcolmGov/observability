-- Normalize legacy sentinel values to NULL (all markets). Canonical multi-market CSV is enforced at API write-time (`normalizeMarketScope`).
UPDATE alert_rules
SET market_scope = NULL
WHERE market_scope IS NOT NULL
  AND (
    TRIM(market_scope) = ''
    OR UPPER(TRIM(market_scope)) IN ('ALL', '*')
  );
