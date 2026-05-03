-- ============================================================================
-- Grafana panel SQL cookbook for Pulse
-- ============================================================================
--
-- Reference queries you can copy into Grafana panels. All assume the Pulse
-- Postgres connected as `pulse_grafana_ro`.
--
-- Conventions:
--   - All `*_ts` and `*_at_ms` columns are MILLISECONDS since epoch.
--   - For Grafana time-series panels, alias the time column as `time` and
--     wrap with `to_timestamp(<col>/1000.0)`.
--   - Use `$__timeFrom()` / `$__timeTo()` Grafana macros for the panel's
--     time range. They expand to `to_timestamp(<unix-seconds>)`.
--   - Use `$market`, `$product`, `$service`, `$environment` template
--     variables wherever possible — gives you ONE dashboard that scales
--     across all 13 markets.

-- ---------------------------------------------------------------------------
-- TEMPLATE VARIABLES — paste these into Dashboard settings -> Variables
-- ---------------------------------------------------------------------------

-- $market (multi-select):
--   SELECT DISTINCT market FROM trace_spans
--   WHERE market <> 'unknown' AND market <> ''
--   ORDER BY market;

-- $product (multi-select):
--   SELECT DISTINCT product FROM trace_spans
--   WHERE product <> 'unknown' AND product <> ''
--   ORDER BY product;

-- $service (multi-select, depends on $market and $product):
--   SELECT DISTINCT service FROM trace_spans
--   WHERE market IN ($market) AND product IN ($product)
--   ORDER BY service;

-- $environment (single-select, default 'prod'):
--   SELECT DISTINCT environment FROM trace_spans ORDER BY environment;

-- ---------------------------------------------------------------------------
-- 1. RED metrics (Requests / Errors / Duration) per service over time
--    Visualization: Time series, with `service` as the series legend.
-- ---------------------------------------------------------------------------
SELECT
  to_timestamp(date_bin('1 minute',
    to_timestamp(start_ts/1000.0), TIMESTAMP 'epoch')::timestamptz)::timestamptz AS time,
  service,
  count(*) AS requests,
  count(*) FILTER (WHERE status = 'error') AS errors,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95_ms
FROM trace_spans
WHERE start_ts >= extract(epoch FROM $__timeFrom()) * 1000
  AND start_ts <  extract(epoch FROM $__timeTo())   * 1000
  AND environment = '$environment'
  AND market   IN ($market)
  AND product  IN ($product)
  AND service  IN ($service)
  AND parent_span_id IS NULL          -- root spans only (one per request)
GROUP BY time, service
ORDER BY time;

-- ---------------------------------------------------------------------------
-- 2. Error rate top-N (this week)
--    Visualization: Bar gauge or table. Sort by err_rate DESC.
-- ---------------------------------------------------------------------------
SELECT
  service || ' · ' || market AS slice,
  count(*) AS requests,
  count(*) FILTER (WHERE status = 'error') AS errors,
  ROUND(
    100.0 * count(*) FILTER (WHERE status = 'error') / NULLIF(count(*), 0),
    2
  ) AS err_rate_pct
FROM trace_spans
WHERE start_ts >= extract(epoch FROM $__timeFrom()) * 1000
  AND environment = '$environment'
  AND parent_span_id IS NULL
GROUP BY service, market
HAVING count(*) >= 10              -- ignore tiny denominators
ORDER BY err_rate_pct DESC NULLS LAST
LIMIT 20;

-- ---------------------------------------------------------------------------
-- 3. Latency heatmap (distribution per bucket)
--    Visualization: Heatmap (X = time, Y = duration buckets, color = count).
-- ---------------------------------------------------------------------------
SELECT
  to_timestamp(date_bin('1 minute',
    to_timestamp(start_ts/1000.0), TIMESTAMP 'epoch')::timestamptz)::timestamptz AS time,
  width_bucket(duration_ms, 0, 5000, 50) * 100 AS bucket_ms_high,
  count(*) AS hits
FROM trace_spans
WHERE start_ts >= extract(epoch FROM $__timeFrom()) * 1000
  AND environment = '$environment'
  AND service IN ($service)
  AND parent_span_id IS NULL
GROUP BY time, bucket_ms_high
ORDER BY time, bucket_ms_high;

-- ---------------------------------------------------------------------------
-- 4. Multi-market service health table
--    Visualization: Table. Each row = one (service, market) cell.
-- ---------------------------------------------------------------------------
SELECT
  service,
  market,
  count(*)                                                       AS requests,
  count(*) FILTER (WHERE status = 'error')                       AS errors,
  ROUND(100.0 * count(*) FILTER (WHERE status = 'error')
        / NULLIF(count(*), 0), 2)                                AS err_rate_pct,
  percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms)      AS p50_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)      AS p95_ms,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms)      AS p99_ms
FROM trace_spans
WHERE start_ts >= extract(epoch FROM $__timeFrom()) * 1000
  AND environment = '$environment'
  AND parent_span_id IS NULL
  AND market IN ($market)
  AND product IN ($product)
GROUP BY service, market
ORDER BY service, market;

-- ---------------------------------------------------------------------------
-- 5. Alert firing timeline (gantt-style)
--    Visualization: State timeline. One row per rule.
-- ---------------------------------------------------------------------------
SELECT
  to_timestamp(h.evaluated_at_ms/1000.0) AS time,
  r.name AS rule,
  CASE
    WHEN h.silenced = 1 THEN 'silenced'
    WHEN h.firing = 1   THEN r.severity
    ELSE 'ok'
  END AS state,
  h.observed_avg
FROM alert_eval_history h
JOIN alert_rules r ON r.id = h.rule_id
WHERE h.evaluated_at_ms >= extract(epoch FROM $__timeFrom()) * 1000
  AND r.environment = '$environment'
ORDER BY r.name, time;

-- ---------------------------------------------------------------------------
-- 6. Service inventory from the catalog (for a docs panel or dropdown)
-- ---------------------------------------------------------------------------
SELECT
  service_name,
  product,
  scope,
  array_to_string(markets_active, ', ') AS markets,
  owner_team,
  tier
FROM service_catalog
WHERE enabled = TRUE
ORDER BY tier, product, service_name;

-- ---------------------------------------------------------------------------
-- 7. Logs by level over time (stacked bar)
--    Visualization: Time series with bar mode + stacking.
-- ---------------------------------------------------------------------------
SELECT
  to_timestamp(date_bin('1 minute',
    to_timestamp(ts/1000.0), TIMESTAMP 'epoch')::timestamptz)::timestamptz AS time,
  level,
  count(*) AS lines
FROM log_entries
WHERE ts >= extract(epoch FROM $__timeFrom()) * 1000
  AND environment = '$environment'
  AND service IN ($service)
  AND market IN ($market)
GROUP BY time, level
ORDER BY time;

-- ---------------------------------------------------------------------------
-- 8. Error log feed (table, drill-down)
--    Visualization: Table. Pair with row click → trace explorer link.
-- ---------------------------------------------------------------------------
SELECT
  to_timestamp(ts/1000.0) AS time,
  service,
  market,
  level,
  message,
  attributes_json::jsonb ->> 'trace_id' AS trace_id
FROM log_entries
WHERE ts >= extract(epoch FROM $__timeFrom()) * 1000
  AND ts <  extract(epoch FROM $__timeTo())   * 1000
  AND environment = '$environment'
  AND level IN ('error', 'warn')
  AND service IN ($service)
  AND market  IN ($market)
ORDER BY ts DESC
LIMIT 200;

-- ---------------------------------------------------------------------------
-- 9. Top error messages (the "what's broken" overview)
-- ---------------------------------------------------------------------------
SELECT
  message,
  count(*) AS occurrences,
  count(DISTINCT service) AS services_affected,
  count(DISTINCT market)  AS markets_affected,
  max(to_timestamp(ts/1000.0)) AS last_seen
FROM log_entries
WHERE ts >= extract(epoch FROM $__timeFrom()) * 1000
  AND environment = '$environment'
  AND level = 'error'
GROUP BY message
ORDER BY occurrences DESC
LIMIT 25;

-- ---------------------------------------------------------------------------
-- 10. Service map edges (for a Node Graph panel)
--     Visualization: Node Graph. Two queries: nodes + edges.
-- ---------------------------------------------------------------------------

-- Nodes:
SELECT DISTINCT service AS id, service AS title
FROM trace_spans
WHERE start_ts >= extract(epoch FROM $__timeFrom()) * 1000
  AND environment = '$environment'

UNION

SELECT DISTINCT peer_service AS id, peer_service AS title
FROM trace_spans
WHERE start_ts >= extract(epoch FROM $__timeFrom()) * 1000
  AND environment = '$environment'
  AND peer_service IS NOT NULL
  AND peer_service <> '';

-- Edges:
SELECT
  service       AS source,
  peer_service  AS target,
  count(*)      AS mainstat
FROM trace_spans
WHERE start_ts >= extract(epoch FROM $__timeFrom()) * 1000
  AND environment = '$environment'
  AND peer_service IS NOT NULL
  AND peer_service <> ''
GROUP BY service, peer_service;

-- ---------------------------------------------------------------------------
-- Performance notes
-- ---------------------------------------------------------------------------
--
-- These queries are designed for the indexes Pulse already has on
-- trace_spans, log_entries, metric_points (composite (market, product,
-- service, ts) indexes from migration 0006).
--
-- For wide windows (>7 days) against tens of millions of rows, add the
-- TimescaleDB extension to your Pulse Postgres and convert these tables to
-- hypertables with continuous aggregates at 1m and 1h. Then point each
-- panel at the rollup table for its time range. This is on the Pulse
-- roadmap; not required for v1.
