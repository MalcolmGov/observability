import {
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/** JSON array string e.g. ["ZA","NG"] — Postgres uses native text[]. */
export const serviceCatalog = sqliteTable("service_catalog", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  serviceName: text("service_name").notNull().unique(),
  displayName: text("display_name"),
  product: text("product").notNull(),
  scope: text("scope").notNull(),
  marketsActive: text("markets_active").notNull().default("[]"),
  tier: integer("tier").notNull().default(3),
  ownerTeam: text("owner_team"),
  oncallSlack: text("oncall_slack"),
  oncallPdKey: text("oncall_pd_key"),
  repoUrl: text("repo_url"),
  runbookUrl: text("runbook_url"),
  tags: text("tags").notNull().default("{}"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  enabled: integer("enabled").notNull().default(1),
});

export const metricPoints = sqliteTable("metric_points", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: text("tenant_id").notNull().default("default"),
  ts: integer("ts").notNull(),
  name: text("name").notNull(),
  value: real("value").notNull(),
  service: text("service").notNull(),
  labelsJson: text("labels_json").notNull().default("{}"),
  product: text("product").notNull().default("unknown"),
  market: text("market").notNull().default("unknown"),
  environment: text("environment").notNull().default("unknown"),
  version: text("version").notNull().default(""),
  instanceId: text("instance_id"),
});

export const logEntries = sqliteTable("log_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: text("tenant_id").notNull().default("default"),
  ts: integer("ts").notNull(),
  level: text("level").notNull(),
  message: text("message").notNull(),
  service: text("service").notNull(),
  attributesJson: text("attributes_json").notNull().default("{}"),
  product: text("product").notNull().default("unknown"),
  market: text("market").notNull().default("unknown"),
  environment: text("environment").notNull().default("unknown"),
  version: text("version").notNull().default(""),
  instanceId: text("instance_id"),
});

export const traceSpans = sqliteTable("trace_spans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: text("tenant_id").notNull().default("default"),
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
  eventsJson: text("events_json").notNull().default("[]"),
  linksJson: text("links_json").notNull().default("[]"),
  product: text("product").notNull().default("unknown"),
  market: text("market").notNull().default("unknown"),
  environment: text("environment").notNull().default("unknown"),
  version: text("version").notNull().default(""),
  instanceId: text("instance_id"),
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
  slackWebhookUrl: text("slack_webhook_url"),
  pagerdutyRoutingKey: text("pagerduty_routing_key"),
  product: text("product"),
  marketScope: text("market_scope"),
  environment: text("environment").notNull().default("prod"),
  severity: text("severity").notNull().default("warning"),
});

export const alertRoutes = sqliteTable("alert_routes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scopeType: text("scope_type").notNull(),
  scopeValue: text("scope_value"),
  channelType: text("channel_type").notNull(),
  channelValue: text("channel_value").notNull(),
  severityMin: text("severity_min").notNull().default("warning"),
  enabled: integer("enabled").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const sloTargets = sqliteTable(
  "slo_targets",
  {
    service: text("service").notNull(),
    product: text("product").notNull().default("platform"),
    market: text("market").notNull().default("ALL"),
    environment: text("environment").notNull().default("prod"),
    targetSuccess: real("target_success").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.service, t.product, t.market, t.environment],
    }),
  ],
);

export const savedViews = sqliteTable(
  "saved_views",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenantId: text("tenant_id").notNull().default("default"),
    page: text("page").notNull(),
    name: text("name").notNull(),
    stateJson: text("state_json").notNull().default("{}"),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("saved_views_tenant_page_name_uidx").on(
      t.tenantId,
      t.page,
      t.name,
    ),
  ],
);
