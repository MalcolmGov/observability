import "server-only";
import { scheduleCatalogUpsertFromTraceRows } from "@/lib/catalog-sync-from-traces";
import type { TelemetryIdentityCols } from "@/lib/otlp/attributes";
import { metricPoints, logEntries, traceSpans } from "@/db/schema";
import { db } from "@/db/sqlite-instance";
import { getPgPool } from "@/db/pg-pool";
import { isPostgres } from "@/lib/sql-dialect";

/** Optional ingest dimensions; defaults match DB (`unknown` / null version). */
export type HybridDims = Partial<TelemetryIdentityCols>;

export type MetricRow = HybridDims & {
  tenantId: string;
  ts: number;
  name: string;
  value: number;
  service: string;
  labelsJson: string;
};

export type LogRow = HybridDims & {
  tenantId: string;
  ts: number;
  level: string;
  message: string;
  service: string;
  attributesJson: string;
};

export type TraceRow = HybridDims & {
  tenantId: string;
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  service: string;
  name: string;
  startTs: number;
  endTs: number;
  durationMs: number;
  kind: string;
  status: string;
  peerService: string | null;
  attributesJson: string;
  /** OTLP span events JSON array */
  eventsJson?: string;
  /** OTLP span links JSON array */
  linksJson?: string;
};

function placeholdersPg(count: number, cols: number): string {
  const rows: string[] = [];
  for (let r = 0; r < count; r++) {
    const ps: string[] = [];
    for (let c = 0; c < cols; c++) {
      ps.push(`$${r * cols + c + 1}`);
    }
    rows.push(`(${ps.join(",")})`);
  }
  return rows.join(",");
}

function pgDims(r: HybridDims): TelemetryIdentityCols {
  return {
    product: r.product ?? "unknown",
    market: r.market ?? "unknown",
    environment: r.environment ?? "unknown",
    version: r.version !== undefined ? r.version : null,
    instanceId: r.instanceId !== undefined ? r.instanceId : null,
  };
}

export async function insertMetricPoints(rows: MetricRow[]): Promise<void> {
  if (rows.length === 0) return;
  if (isPostgres()) {
    const pool = await getPgPool();
    const flat = rows.flatMap((r) => {
      const d = pgDims(r);
      return [
        r.tenantId,
        r.ts,
        r.name,
        r.value,
        r.service,
        r.labelsJson,
        d.product,
        d.market,
        d.environment,
        d.version,
        d.instanceId,
      ];
    });
    const ph = placeholdersPg(rows.length, 11);
    await pool.query(
      `INSERT INTO metric_points (tenant_id, ts, name, value, service, labels_json, product, market, environment, version, instance_id) VALUES ${ph}`,
      flat,
    );
    return;
  }
  if (!db) throw new Error("SQLite db unavailable");
  db.insert(metricPoints).values(
    rows.map((r) => {
      const d = pgDims(r);
      return {
        ...r,
        product: d.product,
        market: d.market,
        environment: d.environment,
        version: d.version ?? "",
        instanceId: d.instanceId,
      };
    }),
  ).run();
}

export async function insertLogEntries(rows: LogRow[]): Promise<void> {
  if (rows.length === 0) return;
  if (isPostgres()) {
    const pool = await getPgPool();
    const flat = rows.flatMap((r) => {
      const d = pgDims(r);
      return [
        r.tenantId,
        r.ts,
        r.level,
        r.message,
        r.service,
        r.attributesJson,
        d.product,
        d.market,
        d.environment,
        d.version,
        d.instanceId,
      ];
    });
    const ph = placeholdersPg(rows.length, 11);
    await pool.query(
      `INSERT INTO log_entries (tenant_id, ts, level, message, service, attributes_json, product, market, environment, version, instance_id) VALUES ${ph}`,
      flat,
    );
    return;
  }
  if (!db) throw new Error("SQLite db unavailable");
  db.insert(logEntries).values(
    rows.map((r) => {
      const d = pgDims(r);
      return {
        ...r,
        product: d.product,
        market: d.market,
        environment: d.environment,
        version: d.version ?? "",
        instanceId: d.instanceId,
      };
    }),
  ).run();
}

export type InsertTraceSpansOptions = {
  /** OTLP collectors may retry batches; ignore duplicate span_ids safely. */
  ignoreDuplicateSpanIds?: boolean;
};

export async function insertTraceSpans(
  rows: TraceRow[],
  opts?: InsertTraceSpansOptions,
): Promise<void> {
  if (rows.length === 0) return;
  if (isPostgres()) {
    const pool = await getPgPool();
    const flat = rows.flatMap((r) => {
      const d = pgDims(r);
      return [
        r.tenantId,
        r.traceId,
        r.spanId,
        r.parentSpanId,
        r.service,
        r.name,
        r.startTs,
        r.endTs,
        r.durationMs,
        r.kind,
        r.status,
        r.peerService,
        r.attributesJson,
        r.eventsJson ?? "[]",
        r.linksJson ?? "[]",
        d.product,
        d.market,
        d.environment,
        d.version,
        d.instanceId,
      ];
    });
    const ph = placeholdersPg(rows.length, 20);
    const conflict = opts?.ignoreDuplicateSpanIds
      ? " ON CONFLICT (tenant_id, span_id) DO NOTHING"
      : "";
    await pool.query(
      `INSERT INTO trace_spans (tenant_id, trace_id, span_id, parent_span_id, service, name, start_ts, end_ts, duration_ms, kind, status, peer_service, attributes_json, events_json, links_json, product, market, environment, version, instance_id) VALUES ${ph}${conflict}`,
      flat,
    );
  } else {
    if (!db) throw new Error("SQLite db unavailable");
    const sqliteRows = rows.map((r) => {
      const d = pgDims(r);
      return {
        ...r,
        eventsJson: r.eventsJson ?? "[]",
        linksJson: r.linksJson ?? "[]",
        product: d.product,
        market: d.market,
        environment: d.environment,
        version: d.version ?? "",
        instanceId: d.instanceId,
      };
    });
    if (opts?.ignoreDuplicateSpanIds) {
      db.insert(traceSpans)
        .values(sqliteRows)
        .onConflictDoNothing({ target: traceSpans.spanId })
        .run();
    } else {
      db.insert(traceSpans).values(sqliteRows).run();
    }
  }

  scheduleCatalogUpsertFromTraceRows(rows);
}
