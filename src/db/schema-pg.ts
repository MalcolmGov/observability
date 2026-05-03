import { eq, sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Human-curated registry; telemetry tables reference `service` string only. */
export const serviceCatalog = pgTable(
  "service_catalog",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    serviceName: text("service_name").notNull().unique(),
    displayName: text("display_name"),
    product: text("product").notNull(),
    scope: text("scope").notNull(),
    marketsActive: text("markets_active")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    tier: integer("tier").notNull().default(3),
    ownerTeam: text("owner_team"),
    oncallSlack: text("oncall_slack"),
    oncallPdKey: text("oncall_pd_key"),
    repoUrl: text("repo_url"),
    runbookUrl: text("runbook_url"),
    tags: jsonb("tags").default(sql`'{}'::jsonb`),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
    enabled: integer("enabled").notNull().default(1),
  },
  (t) => [
    index("service_catalog_product_idx").on(t.product),
    index("service_catalog_scope_idx").on(t.scope),
    index("service_catalog_enabled_idx").on(t.enabled),
  ],
);

export const metricPoints = pgTable(
  "metric_points",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: text("tenant_id").notNull().default("default"),
    ts: bigint("ts", { mode: "number" }).notNull(),
    name: text("name").notNull(),
    value: doublePrecision("value").notNull(),
    service: text("service").notNull(),
    labelsJson: text("labels_json").notNull().default("{}"),
    product: text("product").notNull().default("unknown"),
    market: text("market").notNull().default("unknown"),
    environment: text("environment").notNull().default("unknown"),
    version: text("version"),
    instanceId: text("instance_id"),
  },
  (t) => [
    index("metric_points_ts_idx").on(t.ts),
    index("metric_points_name_service_ts_idx").on(t.name, t.service, t.ts),
    index("metric_points_tenant_ts_idx").on(t.tenantId, t.ts),
    index("metric_points_tenant_name_service_ts_idx").on(
      t.tenantId,
      t.name,
      t.service,
      t.ts,
    ),
    index("metric_points_market_product_service_ts_idx").on(
      t.market,
      t.product,
      t.service,
      t.ts.desc(),
    ),
  ],
);

export const logEntries = pgTable(
  "log_entries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: text("tenant_id").notNull().default("default"),
    ts: bigint("ts", { mode: "number" }).notNull(),
    level: text("level").notNull(),
    message: text("message").notNull(),
    service: text("service").notNull(),
    attributesJson: text("attributes_json").notNull().default("{}"),
    product: text("product").notNull().default("unknown"),
    market: text("market").notNull().default("unknown"),
    environment: text("environment").notNull().default("unknown"),
    version: text("version"),
    instanceId: text("instance_id"),
  },
  (t) => [
    index("log_entries_ts_idx").on(t.ts),
    index("log_entries_service_ts_idx").on(t.service, t.ts),
    index("log_entries_tenant_ts_idx").on(t.tenantId, t.ts),
    index("log_entries_tenant_service_ts_idx").on(t.tenantId, t.service, t.ts),
    index("log_entries_market_product_service_ts_idx").on(
      t.market,
      t.product,
      t.service,
      t.ts.desc(),
    ),
  ],
);

export const traceSpans = pgTable(
  "trace_spans",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: text("tenant_id").notNull().default("default"),
    traceId: text("trace_id").notNull(),
    spanId: text("span_id").notNull(),
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
    eventsJson: text("events_json").notNull().default("[]"),
    linksJson: text("links_json").notNull().default("[]"),
    product: text("product").notNull().default("unknown"),
    market: text("market").notNull().default("unknown"),
    environment: text("environment").notNull().default("unknown"),
    version: text("version"),
    instanceId: text("instance_id"),
  },
  (t) => [
    uniqueIndex("trace_spans_tenant_span_uidx").on(t.tenantId, t.spanId),
    index("trace_spans_trace_id_idx").on(t.traceId),
    index("trace_spans_start_ts_idx").on(t.startTs),
    index("trace_spans_service_start_idx").on(t.service, t.startTs),
    index("trace_spans_tenant_trace_idx").on(t.tenantId, t.traceId),
    index("trace_spans_tenant_start_ts_idx").on(t.tenantId, t.startTs),
    index("trace_spans_tenant_service_start_idx").on(
      t.tenantId,
      t.service,
      t.startTs,
    ),
    index("trace_spans_market_product_service_ts_idx").on(
      t.market,
      t.product,
      t.service,
      t.startTs.desc(),
    ),
    index("trace_spans_market_env_ts_idx")
      .on(t.market, t.environment, t.startTs.desc())
      .where(eq(t.environment, "prod")),
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
  slackWebhookUrl: text("slack_webhook_url"),
  pagerdutyRoutingKey: text("pagerduty_routing_key"),
  product: text("product"),
  marketScope: text("market_scope"),
  environment: text("environment").notNull().default("prod"),
});

export const sloTargets = pgTable(
  "slo_targets",
  {
    service: text("service").notNull(),
    product: text("product").notNull().default("platform"),
    market: text("market").notNull().default("ALL"),
    environment: text("environment").notNull().default("prod"),
    targetSuccess: doublePrecision("target_success").notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.service, t.product, t.market, t.environment],
    }),
  ],
);

export const savedViews = pgTable(
  "saved_views",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: text("tenant_id").notNull().default("default"),
    page: text("page").notNull(),
    name: text("name").notNull(),
    stateJson: text("state_json").notNull().default("{}"),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [
    uniqueIndex("saved_views_tenant_page_name_uidx").on(
      t.tenantId,
      t.page,
      t.name,
    ),
    index("saved_views_tenant_page_idx").on(t.tenantId, t.page),
  ],
);
