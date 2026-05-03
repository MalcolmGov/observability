/** True when telemetry should use Postgres (`DATABASE_URL`) instead of SQLite. */
export function isPostgres(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/**
 * Adapt SQLite-oriented SQL (?) placeholders + a few builtins) for PostgreSQL ($n).
 * Keep queries SQLite-first; call this only when `isPostgres()`.
 */
export function toPostgresSql(sqliteSql: string): string {
  let s = sqliteSql;

  s = s.replace(
    /json_extract\(attributes_json, '\$\.http\.route'\)/g,
    "attributes_json::jsonb->>'http.route'",
  );
  s = s.replace(
    /json_extract\(attributes_json, '\$\.trace_id'\)/g,
    "attributes_json::jsonb->>'trace_id'",
  );
  s = s.replace(
    /json_extract\(attributes_json, '\$\.traceId'\)/g,
    "attributes_json::jsonb->>'traceId'",
  );

  s = s.replace(
    /LIKE '%' \|\| \? \|\| '%' COLLATE NOCASE/g,
    "ILIKE '%' || ? || '%'",
  );

  s = s.replace(
    /\bsubstr\(message,\s*1\s*,\s*72\)/gi,
    "SUBSTRING(message FROM 1 FOR 72)",
  );
  s = s.replace(
    /\bsubstr\(message,\s*1\s*,\s*120\)/gi,
    "SUBSTRING(message FROM 1 FOR 120)",
  );

  let i = 0;
  s = s.replace(/\bexcluded\./gi, "EXCLUDED.");
  return s.replace(/\?/g, () => `$${++i}`);
}
