import "server-only";
import { metricPoints, logEntries, traceSpans } from "@/db/schema";
import { db } from "@/db/sqlite-instance";
import { getPgPool } from "@/db/pg-pool";
import { isPostgres } from "@/lib/sql-dialect";

type MetricRow = {
  ts: number;
  name: string;
  value: number;
  service: string;
  labelsJson: string;
};

type LogRow = {
  ts: number;
  level: string;
  message: string;
  service: string;
  attributesJson: string;
};

type TraceRow = {
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

export async function insertMetricPoints(rows: MetricRow[]): Promise<void> {
  if (rows.length === 0) return;
  if (isPostgres()) {
    const pool = await getPgPool();
    const flat = rows.flatMap((r) => [
      r.ts,
      r.name,
      r.value,
      r.service,
      r.labelsJson,
    ]);
    const ph = placeholdersPg(rows.length, 5);
    await pool.query(
      `INSERT INTO metric_points (ts, name, value, service, labels_json) VALUES ${ph}`,
      flat,
    );
    return;
  }
  if (!db) throw new Error("SQLite db unavailable");
  db.insert(metricPoints).values(rows).run();
}

export async function insertLogEntries(rows: LogRow[]): Promise<void> {
  if (rows.length === 0) return;
  if (isPostgres()) {
    const pool = await getPgPool();
    const flat = rows.flatMap((r) => [
      r.ts,
      r.level,
      r.message,
      r.service,
      r.attributesJson,
    ]);
    const ph = placeholdersPg(rows.length, 5);
    await pool.query(
      `INSERT INTO log_entries (ts, level, message, service, attributes_json) VALUES ${ph}`,
      flat,
    );
    return;
  }
  if (!db) throw new Error("SQLite db unavailable");
  db.insert(logEntries).values(rows).run();
}

export async function insertTraceSpans(rows: TraceRow[]): Promise<void> {
  if (rows.length === 0) return;
  if (isPostgres()) {
    const pool = await getPgPool();
    const flat = rows.flatMap((r) => [
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
    ]);
    const ph = placeholdersPg(rows.length, 12);
    await pool.query(
      `INSERT INTO trace_spans (trace_id, span_id, parent_span_id, service, name, start_ts, end_ts, duration_ms, kind, status, peer_service, attributes_json) VALUES ${ph}`,
      flat,
    );
    return;
  }
  if (!db) throw new Error("SQLite db unavailable");
  db.insert(traceSpans).values(rows).run();
}
