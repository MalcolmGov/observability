-- Reference only — run manually during a planned maintenance window.
-- Pulse stores OTLP spans in `trace_spans`. At high sustained ingest (10k+ spans/s),
-- partition by time so retention and queries prune physical ranges instead of one huge heap.
--
-- Greenfield pattern (Postgres 14+): parent partitioned table + monthly partitions.
-- Migrating an existing live table requires rename-swap or pg_dump/pg_restore — not automatic.

-- Example shape (DO NOT run verbatim against production without a migration plan):

-- CREATE TABLE trace_spans_p (
--   LIKE trace_spans INCLUDING DEFAULTS INCLUDING CONSTRAINTS
-- ) PARTITION BY RANGE (start_ts);
--
-- CREATE TABLE trace_spans_y2026m01 PARTITION OF trace_spans_p
--   FOR VALUES FROM ('1735689600000') TO ('1738368000000'); -- ms epoch bounds
--
-- Then move constraints/indexes, swap names, and rebuild FKs if any.
