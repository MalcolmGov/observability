import {
  bigint,
  bigserial,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
} from "drizzle-orm/pg-core";

export const metricPoints = pgTable(
  "metric_points",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ts: bigint("ts", { mode: "number" }).notNull(),
    name: text("name").notNull(),
    value: doublePrecision("value").notNull(),
    service: text("service").notNull(),
    labelsJson: text("labels_json").notNull().default("{}"),
  },
  (t) => [
    index("metric_points_ts_idx").on(t.ts),
    index("metric_points_name_service_ts_idx").on(t.name, t.service, t.ts),
  ],
);

export const logEntries = pgTable(
  "log_entries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ts: bigint("ts", { mode: "number" }).notNull(),
    level: text("level").notNull(),
    message: text("message").notNull(),
    service: text("service").notNull(),
    attributesJson: text("attributes_json").notNull().default("{}"),
  },
  (t) => [
    index("log_entries_ts_idx").on(t.ts),
    index("log_entries_service_ts_idx").on(t.service, t.ts),
  ],
);

export const traceSpans = pgTable(
  "trace_spans",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    traceId: text("trace_id").notNull(),
    spanId: text("span_id").notNull().unique(),
    parentSpanId: text("parent_span_id"),
    service: text("service").notNull(),
    name: text("name").notNull(),
    startTs: bigint("start_ts", { mode: "number" }).notNull(),
    endTs: bigint("end_ts", { mode: "number" }).notNull(),
    durationMs: doublePrecision("duration_ms").notNull(),
    kind: text("kind").notNull().default("internal"),
    status: text("status").notNull().default("ok"),
    peerService: text("peer_service"),
    attributesJson: text("attributes_json").notNull().default("{}"),
  },
  (t) => [
    index("trace_spans_trace_id_idx").on(t.traceId),
    index("trace_spans_start_ts_idx").on(t.startTs),
    index("trace_spans_service_start_idx").on(t.service, t.startTs),
  ],
);

export const alertRules = pgTable("alert_rules", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  enabled: integer("enabled").notNull().default(1),
  metricName: text("metric_name").notNull(),
  service: text("service").notNull(),
  comparator: text("comparator").notNull(),
  threshold: doublePrecision("threshold").notNull(),
  windowMinutes: integer("window_minutes").notNull().default(5),
  webhookUrl: text("webhook_url"),
  runbookUrl: text("runbook_url"),
});

export const sloTargets = pgTable("slo_targets", {
  service: text("service").primaryKey(),
  targetSuccess: doublePrecision("target_success").notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});
