import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const metricPoints = sqliteTable("metric_points", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ts: integer("ts").notNull(),
  name: text("name").notNull(),
  value: real("value").notNull(),
  service: text("service").notNull(),
  labelsJson: text("labels_json").notNull().default("{}"),
});

export const logEntries = sqliteTable("log_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ts: integer("ts").notNull(),
  level: text("level").notNull(),
  message: text("message").notNull(),
  service: text("service").notNull(),
  attributesJson: text("attributes_json").notNull().default("{}"),
});

export const traceSpans = sqliteTable("trace_spans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  traceId: text("trace_id").notNull(),
  spanId: text("span_id").notNull().unique(),
  parentSpanId: text("parent_span_id"),
  service: text("service").notNull(),
  name: text("name").notNull(),
  startTs: integer("start_ts").notNull(),
  endTs: integer("end_ts").notNull(),
  durationMs: real("duration_ms").notNull(),
  kind: text("kind").notNull().default("internal"),
  status: text("status").notNull().default("ok"),
  peerService: text("peer_service"),
  attributesJson: text("attributes_json").notNull().default("{}"),
});

export const alertRules = sqliteTable("alert_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  enabled: integer("enabled").notNull().default(1),
  metricName: text("metric_name").notNull(),
  service: text("service").notNull(),
  comparator: text("comparator").notNull(),
  threshold: real("threshold").notNull(),
  windowMinutes: integer("window_minutes").notNull().default(5),
  webhookUrl: text("webhook_url"),
  runbookUrl: text("runbook_url"),
});

export const sloTargets = sqliteTable("slo_targets", {
  service: text("service").primaryKey(),
  targetSuccess: real("target_success").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
