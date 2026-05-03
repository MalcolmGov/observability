-- Legacy spans used market='unknown'; catalog auto-discovery merged it into markets_active.
-- Drop that sentinel from arrays and fix scope when cardinality changes (e.g. ["unknown","ZA"] → ["ZA"] → market_local).
UPDATE service_catalog
SET
  markets_active = array_remove(markets_active, 'unknown'),
  updated_at = (FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000))::bigint,
  scope = CASE
    WHEN cardinality(array_remove(markets_active, 'unknown')) >= 2 THEN 'shared'
    ELSE 'market_local'
  END
WHERE 'unknown' = ANY (markets_active);
