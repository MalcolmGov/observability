import "server-only";

import { queryAll } from "@/db/client";
import {
  appendLogAttributeExistsClause,
  LOG_ATTR_KEY_RE,
} from "@/lib/log-attr-filter";
import { appendScopeSql, type ScopeFilters } from "@/lib/scope-filters";
import { isPostgres } from "@/lib/sql-dialect";

export type LogQueryRow = {
  ts: number;
  level: string;
  message: string;
  attributes: Record<string, unknown>;
};

export type LogsQueryParams = {
  tenantId: string;
  service: string;
  /** When set, restricts `log_entries` rows by deployment scope columns. */
  scope?: ScopeFilters;
  limit: number;
  q: string;
  levelFilter: string;
  traceId?: string;
  startMs?: number;
  endMs?: number;
  attrKey?: string;
  attrValue?: string;
  /** Exclusive lower bound on `ts` (for live tail cursors). */
  cursorTsExclusive?: number;
  /** Default newest-first (`desc`). Use `asc` for chronological batches after cursor. */
  sort?: "asc" | "desc";
};

export async function executeLogsQuery(
  params: LogsQueryParams,
): Promise<LogQueryRow[]> {
  const {
    tenantId,
    service,
    limit,
    q,
    levelFilter,
    traceId,
    startMs,
    endMs,
    attrKey,
    attrValue,
    cursorTsExclusive,
    sort = "desc",
    scope,
  } = params;

  const dialect = isPostgres() ? "postgres" : "sqlite";

  const { sql: scopeSql, params: scopeParams } = appendScopeSql(scope ?? {});

  const parts = [
    `SELECT ts, level, message, attributes_json AS attributesJson`,
    `FROM log_entries`,
    `WHERE tenant_id = ? AND service = ?${scopeSql}`,
  ];
  const sqlParams: unknown[] = [tenantId, service, ...scopeParams];

  if (levelFilter && levelFilter !== "all") {
    parts.push(`AND level = ?`);
    sqlParams.push(levelFilter);
  }

  if (q) {
    parts.push(
      `AND (message LIKE '%' || ? || '%' COLLATE NOCASE OR attributes_json LIKE '%' || ? || '%' COLLATE NOCASE)`,
    );
    sqlParams.push(q, q);
  }

  if (traceId) {
    parts.push(
      `AND (json_extract(attributes_json, '$.trace_id') = ? OR json_extract(attributes_json, '$.traceId') = ?)`,
    );
    sqlParams.push(traceId, traceId);
  }

  if (startMs !== undefined && Number.isFinite(startMs)) {
    parts.push(`AND ts >= ?`);
    sqlParams.push(startMs);
  }
  if (endMs !== undefined && Number.isFinite(endMs)) {
    parts.push(`AND ts <= ?`);
    sqlParams.push(endMs);
  }

  if (
    cursorTsExclusive !== undefined &&
    Number.isFinite(cursorTsExclusive)
  ) {
    parts.push(`AND ts > ?`);
    sqlParams.push(cursorTsExclusive);
  }

  const attrKeyRaw = attrKey?.trim() ?? "";
  const attrValueRaw = attrValue?.trim() ?? "";
  if (attrKeyRaw) {
    if (!LOG_ATTR_KEY_RE.test(attrKeyRaw)) {
      throw new Error("INVALID_ATTR_KEY");
    }
    appendLogAttributeExistsClause(
      parts,
      sqlParams,
      attrKeyRaw,
      attrValueRaw,
      dialect,
    );
  }

  parts.push(sort === "asc" ? `ORDER BY ts ASC` : `ORDER BY ts DESC`);
  parts.push(`LIMIT ?`);
  sqlParams.push(limit);

  const rows = await queryAll<{
    ts: number;
    level: string;
    message: string;
    attributesJson: string;
  }>(parts.join("\n"), sqlParams);

  return rows.map((r) => ({
    ts: Number(r.ts),
    level: r.level,
    message: r.message,
    attributes: JSON.parse(r.attributesJson || "{}") as Record<
      string,
      unknown
    >,
  }));
}
