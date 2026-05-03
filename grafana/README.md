# Grafana ↔ Pulse integration playbook

Pulse is a **curated, opinionated observability UI** for non-technical and
mid-technical users (market ops, product managers, leadership). It hosts the
OTLP ingest pipeline, the Postgres database, the Service Catalog, the AI Ops
Brief, the App Catalog grid, alert routing, and the notification center.

Grafana is a **deeply technical exploration tool** for SREs and platform
engineers — ad-hoc queries, custom dashboards, flame graphs, etc.

Rather than build Grafana's feature set into Pulse (a multi-year exercise we'd
always lose), we connect Grafana to Pulse's Postgres as a **read-only data
source**. Same data, two interfaces, two audiences.

This folder is the playbook for that integration.

---

## Decision: where to host Grafana

Pick one before continuing. Both work; the trade-offs are real.

### Option A — Self-hosted in the same Azure VNet as Pulse Postgres ← recommended

- **Why:** No public endpoint on Pulse Postgres needed. Lowest latency.
  Easiest network model (VNet-local).
- **How:** Deploy Grafana OSS as a container in the same VNet (Container App
  or AKS pod). It connects to Postgres via private DNS / private endpoint.
- **Cost:** ~R 600 / $35 per month for a small Grafana Container App.
- **Best for:** internal corporate use case, your 13-market platform team.

### Option B — Grafana Cloud

- **Why:** Zero ops. Their team patches it. Built-in auth, RBAC, plugins.
- **How:** Pulse Postgres needs a public endpoint OR a Grafana Private
  Data Source Connector (free, lightweight agent in your VNet that proxies
  queries).
- **Cost:** Free tier covers small teams. Pro is $19/user/month.
- **Best for:** if you're already in the Grafana ecosystem (Grafana Cloud,
  Grafana OnCall) and want the unified workspace.

### Option C — Grafana sidecar in the same Azure deployment as Pulse

- **Why:** Single-team ownership, runs alongside Pulse on the same infra.
- **How:** Add a `grafana` service to the existing Pulse Container App
  Environment / k8s namespace. Mount config + dashboard JSON from a volume.
- **Cost:** Marginal — sharing existing compute.
- **Best for:** small teams who want fewer moving parts.

**Default recommendation:** **Option A** (self-hosted in the same VNet as
Postgres). Simplest network story; no public exposure of the database; no
monthly per-seat cost as the platform team grows.

---

## Phase 1: connect Grafana to Pulse's Postgres (1 day)

Steps, in order. Hand each to whoever owns the relevant infra.

### 1.1 Create the read-only Postgres role

Run [`sql/01-readonly-role.sql`](sql/01-readonly-role.sql) against your Pulse
Postgres as a superuser. It creates `pulse_grafana_ro` with `SELECT` on every
Pulse telemetry table and `service_catalog` / `alert_rules` / `alert_routes` /
`alert_eval_history`.

The role explicitly does **not** have:
- Any write or DDL grants
- Access to `_pulse_kv` (internal key-value store)
- Access to PII-bearing future tables (default-deny via `REVOKE … FROM PUBLIC`)

### 1.2 Set the role's password

Generate a strong password and rotate it into the role:

```sql
ALTER ROLE pulse_grafana_ro WITH PASSWORD 'use-a-real-secret-here';
```

Store it in Azure Key Vault (or whatever your secrets manager is). Grafana
reads it at deploy time.

### 1.3 Configure Grafana data source

In Grafana → Connections → Data sources → Add data source → PostgreSQL.

- **Name:** `Pulse (read-only)`
- **Host:** `pulse-pg.<your-vnet>.postgres.database.azure.com:5432`
  (private endpoint hostname — don't use the public one)
- **Database:** `pulse`
- **User:** `pulse_grafana_ro`
- **Password:** (from Key Vault)
- **TLS/SSL Mode:** `require`
- **Min time interval:** `1m` (matches Pulse's smallest metric bucket)

Save & test. You should see a green "Database Connection OK".

### 1.4 Smoke-test query

Open Grafana Explore → select the Pulse data source → run:

```sql
SELECT
  date_trunc('hour', to_timestamp(start_ts/1000.0)) AS bucket,
  service,
  count(*) AS spans,
  avg(duration_ms) AS avg_ms
FROM trace_spans
WHERE start_ts >= (extract(epoch from now()) - 3600)*1000
GROUP BY bucket, service
ORDER BY bucket DESC, spans DESC
LIMIT 50;
```

If you see rows, the integration is live.

---

## Phase 2: starter dashboards (recommend 3–5 days, build against real data)

We deliberately do **not** ship pre-built dashboards in this folder. They
need to be designed against your actual production data — bucket sizes,
real metric cardinality, real market traffic patterns. Building blind
produces dashboards nobody uses.

Once Phase 1 is live and you have a few weeks of real telemetry:

1. **Multi-market service overview** — variables `$market`, `$product`,
   `$service`. Panels: request volume, error rate, p95 latency. One
   dashboard works for all 13 markets.
2. **Trace latency heatmap** — distribution per bucket, colored by count.
   Grafana's `Heatmap` visualization shines here.
3. **Error rate top-N** — which (service × market) combos have the highest
   error rate this week.
4. **Alert firing history** — gantt-style timeline of which rules fired
   when, sourced from `alert_eval_history`.
5. **SLO burn rate** — once Pulse ships multi-window burn rate, mirror it
   in Grafana for the platform team.

[`sql/02-query-cookbook.sql`](sql/02-query-cookbook.sql) has reference
queries for each of these — copy into your Grafana panel SQL.

When you have dashboards you want to keep, **export each as JSON** (Share →
Export → Save to file) and commit them to `dashboards/` in this folder.
That gives you dashboards-as-code: reviewable, versionable, restorable.

---

## Phase 3: cross-link from Pulse to Grafana (optional, ~½ day)

Once Grafana is live with stable dashboard URLs, add an "Open in Grafana"
button to relevant Pulse pages so power users can drop into deeper
exploration with the right scope pre-applied.

**Implementation:**
- Read `NEXT_PUBLIC_GRAFANA_BASE_URL` env var (e.g.
  `https://grafana.pulse.internal`)
- If unset, the button doesn't render — Pulse degrades gracefully without
  Grafana
- On the `/services` page, the button links to a service-overview
  dashboard with `?var-service=<name>&var-market=<m>` pre-filled
- Same on `/traces` (link to trace-latency heatmap), `/metrics` (link to
  metric explorer), `/catalog` (link to service-overview filtered by the
  clicked cell)

**Defer this until** dashboards exist to link to. Hard-coding URLs to
nothing is worse than no button.

---

## Phase 4: alert webhook from Grafana → Pulse (optional, skip for v1)

Grafana has its own alerting. You probably don't need it:
- Pulse already does threshold + multi-market evaluation + per-market
  routing → PagerDuty.
- Grafana alerts overlap with that.

If you DO end up using Grafana alerting (e.g., for a metric type Pulse
doesn't ingest yet), point the Grafana webhook at
`POST /api/v1/alerts/external` (you'd build that endpoint). It would
register the firing into `alert_eval_history` and dispatch through the
existing routing layer. ~½ day of work; only do it if you're actually
firing Grafana alerts in production.

---

## What stays in Pulse (don't move to Grafana)

These are Pulse's differentiation. Keep them in Pulse and don't try to
reproduce them in Grafana:

- **App Catalog grid** (3 products × 13 markets) — bespoke to fintech
  super-app context; Grafana has no equivalent.
- **AI Ops Brief** — stakeholder-ready narrative. Grafana has nothing
  comparable.
- **NL query** — Grafana has some LLM features, but not as a primary
  interaction surface.
- **Service Catalog with hybrid scope** (shared / market_local + owner_team)
  — bespoke; not just a tag system.
- **Market-aware alert routing with severity-tiered wide-blast escalation**
  — Grafana's alerting has tags but doesn't model markets as first-class.
- **Notification bell** — already polished; Grafana's notifications are a
  different surface.

If a market team or PM logs into Grafana, they'll be lost. Pulse is for
them. Grafana is for the SRE who knows what `histogram_quantile(0.95, …)`
means.

---

## Operational notes

- **Connection pool sizing**: Grafana opens one connection per query. With
  10 dashboard tabs × 8 panels each, that's ~80 concurrent queries during
  active use. Make sure your Pulse Postgres `max_connections` accounts
  for it (default 100 on Azure Flex is fine for a small team; bump to 200
  before adding the 13-market team broadly).
- **Long queries**: Grafana defaults to a 30s query timeout on PostgreSQL.
  If you have wide-window aggregations against tens of millions of spans,
  add a TimescaleDB continuous aggregate (e.g., 1-minute and 1-hour
  rollups) and point dashboards at the rollup tables. Already on the
  Pulse roadmap.
- **Schema changes**: when Pulse adds a column, the read-only role inherits
  the grant via `ALTER DEFAULT PRIVILEGES` (set up in
  [`sql/01-readonly-role.sql`](sql/01-readonly-role.sql)). New tables also
  inherit `SELECT` automatically. No re-grant needed on every migration.

---

## Schema reference (for dashboard authors)

The most-queried tables in Pulse:

| Table | Key columns | Notes |
|---|---|---|
| `metric_points` | `ts`, `name`, `value`, `service`, `product`, `market`, `environment`, `version`, `instance_id`, `labels_json` | Time in ms epoch. `labels_json` is `text` in SQLite, `jsonb` in PG. |
| `log_entries` | `ts`, `level`, `message`, `service`, `product`, `market`, `environment`, `attributes_json` | Same time format. |
| `trace_spans` | `start_ts`, `end_ts`, `duration_ms`, `service`, `name`, `kind`, `status`, `peer_service`, `product`, `market`, `environment` | `status` is `'ok'` or `'error'`. |
| `service_catalog` | `service_name`, `product`, `scope`, `markets_active`, `owner_team`, `tier` | Curated registry. |
| `alert_rules` | `id`, `name`, `service`, `metric_name`, `comparator`, `threshold`, `severity`, `market_scope`, `environment` | Rule definitions. |
| `alert_eval_history` | `rule_id`, `evaluated_at_ms`, `firing`, `observed_avg`, `silenced` | Eval snapshots. |
| `alert_routes` | `scope_type`, `scope_value`, `channel_type`, `channel_value`, `severity_min` | Per-market / per-team / default routing. |

All time columns are **milliseconds since epoch**. Convert in Grafana with
`to_timestamp(<col>/1000.0)` for the `time` field of a time-series query.

For ready-made queries, see [`sql/02-query-cookbook.sql`](sql/02-query-cookbook.sql).
