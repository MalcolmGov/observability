import { insertLogEntries, insertMetricPoints, queryGet, queryRun } from "@/db/client";
import { getTelemetryTenantIdFromRequest } from "@/lib/telemetry-tenant";
import { NextResponse } from "next/server";

/**
 * POST /api/v1/demo/incidents
 * Seeds realistic incident demo data:
 *  - 4 alert rules (critical + warning + info) with runbook URLs
 *  - Metric data that breaches each threshold
 *  - alert_eval_history rows marking each rule as firing
 *  - Error/warn log entries for each service
 *
 * Idempotent — clears prior demo incident data before re-seeding.
 */
export async function POST(req: Request) {
  const tenantId = getTelemetryTenantIdFromRequest(req);
  const now = Date.now();
  const min = 60_000;

  // ── 1. Alert rules ─────────────────────────────────────────────
  type RuleDef = {
    name: string;
    metricName: string;
    service: string;
    comparator: "gt" | "lt";
    threshold: number;
    windowMinutes: number;
    severity: "critical" | "warning" | "info";
    runbookUrl: string;
    environment: string;
    observedAvg: number;
    firingForMins: number; // how many minutes it has been firing
  };

  const RULES: RuleDef[] = [
    {
      name: "CRIT: checkout-api p95 latency breach",
      metricName: "http.server.request_duration_ms",
      service: "checkout-api",
      comparator: "gt",
      threshold: 500,
      windowMinutes: 5,
      severity: "critical",
      runbookUrl: "https://example.com/runbooks/checkout-latency",
      environment: "prod",
      observedAvg: 842,
      firingForMins: 14,
    },
    {
      name: "CRIT: payment-gateway error rate spike",
      metricName: "http.server.error_rate",
      service: "payment-gateway",
      comparator: "gt",
      threshold: 0.05,
      windowMinutes: 5,
      severity: "critical",
      runbookUrl: "https://example.com/runbooks/payment-errors",
      environment: "prod",
      observedAvg: 0.18,
      firingForMins: 6,
    },
    {
      name: "WARN: inventory-api elevated latency",
      metricName: "http.server.request_duration_ms",
      service: "inventory-api",
      comparator: "gt",
      threshold: 200,
      windowMinutes: 10,
      severity: "warning",
      runbookUrl: "https://example.com/runbooks/inventory-latency",
      environment: "prod",
      observedAvg: 278,
      firingForMins: 31,
    },
    {
      name: "INFO: user-service memory pressure",
      metricName: "process.runtime.jvm.memory.used",
      service: "user-service",
      comparator: "gt",
      threshold: 800,
      windowMinutes: 15,
      severity: "info",
      runbookUrl: "",
      environment: "prod",
      observedAvg: 912,
      firingForMins: 52,
    },
  ];

  // Clean up old demo incident rules
  await queryRun(
    `DELETE FROM alert_rules WHERE name LIKE 'CRIT:%' OR name LIKE 'WARN:%' OR name LIKE 'INFO:%'`,
    [],
  );

  const ruleIds: number[] = [];

  for (const r of RULES) {
    await queryRun(
      `INSERT INTO alert_rules
         (name, enabled, metric_name, service, comparator, threshold, window_minutes,
          webhook_url, runbook_url, slack_webhook_url, pagerduty_routing_key,
          product, market_scope, environment, severity)
       VALUES (?,1,?,?,?,?,?,NULL,?,NULL,NULL,NULL,NULL,?,?)`,
      [
        r.name,
        r.metricName,
        r.service,
        r.comparator,
        r.threshold,
        r.windowMinutes,
        r.runbookUrl || null,
        r.environment,
        r.severity,
      ],
    );
    const row = await queryGet<{ id: number }>(
      `SELECT id FROM alert_rules WHERE name = ? LIMIT 1`,
      [r.name],
    );
    if (row) ruleIds.push(row.id);
  }

  // ── 2. Eval history — multiple firing snapshots per rule ────────
  let historyInserted = 0;
  for (let ri = 0; ri < RULES.length; ri++) {
    const r = RULES[ri];
    const ruleId = ruleIds[ri];
    if (!ruleId) continue;

    // Write one snapshot per 5-min evaluation interval over the firing window
    const evalCount = Math.max(2, Math.ceil(r.firingForMins / 5));
    for (let e = 0; e < evalCount; e++) {
      const evalTs = now - (r.firingForMins - e * 5) * min;
      // Add slight jitter to observed avg to make sparkline interesting
      const jitter = (Math.random() - 0.5) * r.observedAvg * 0.15;
      const observed = parseFloat((r.observedAvg + jitter).toFixed(2));
      await queryRun(
        `INSERT INTO alert_eval_history (tenant_id, rule_id, evaluated_at_ms, firing, observed_avg, silenced)
         VALUES (?,?,?,1,?,0)`,
        [tenantId, ruleId, evalTs, observed],
      );
      historyInserted++;
    }
  }

  // ── 3. Metric points that justify the breach ────────────────────
  type MetricRow = {
    name: string;
    service: string;
    value: number;
    ts: number;
    labelsJson: string;
  };

  const metricRows: MetricRow[] = [];
  for (const r of RULES) {
    for (let i = 0; i < 24; i++) {
      const ts = now - i * 5 * min;
      // Values ramp up to make spike visually obvious
      const spike = i < r.firingForMins / 5 ? 1 : 0.4;
      const value = parseFloat(
        (r.observedAvg * spike * (0.85 + Math.random() * 0.3)).toFixed(3),
      );
      metricRows.push({
        name: r.metricName,
        service: r.service,
        value,
        ts,
        labelsJson: JSON.stringify({ method: "GET", status_code: i < 6 ? "500" : "200" }),
      });
    }
  }

  await insertMetricPoints(
    metricRows.map((m) => ({
      ...m,
      tenantId,
      product: "consumer",
      market: "ZA",
      environment: "prod",
      version: "demo-1.0.0",
      instanceId: null,
    })),
  );

  // ── 4. Error log entries per service ───────────────────────────
  type LogRow = {
    ts: number;
    level: string;
    message: string;
    service: string;
    traceId: string | null;
    spanId: string | null;
    attributesJson: string;
  };

  const ERROR_MSGS: Record<string, string[]> = {
    "checkout-api": [
      "upstream timeout waiting for payment-gateway response after 5000ms",
      "checkout request failed: connection reset by peer",
      "cart service returned 503 — retrying (attempt 3/3)",
      "unhandled exception in OrderController.submit(): NullPointerException",
      "p95 latency 842ms exceeds SLO budget of 500ms",
    ],
    "payment-gateway": [
      "payment processor rejected transaction: INSUFFICIENT_FUNDS (merchant error)",
      "stripe webhook delivery failed: connect ETIMEDOUT 54.187.12.4:443",
      "idempotency key collision — duplicate payment attempt blocked",
      "fraud detection score 0.92 exceeded threshold 0.8 — transaction declined",
      "PSP returned HTTP 502 — bad gateway, circuit breaker open",
    ],
    "inventory-api": [
      "stock reservation timed out after 200ms — DB connection pool exhausted",
      "cache miss rate 84% — Redis latency elevated, falling back to DB",
      "product lookup slow query: 278ms (explain: full table scan on product_id)",
    ],
    "user-service": [
      "JVM heap 912MB / 1024MB — GC pressure increasing",
      "old-gen GC pause 340ms — consider increasing heap allocation",
    ],
  };

  const logRows: LogRow[] = [];
  for (const r of RULES) {
    const msgs = ERROR_MSGS[r.service] ?? [];
    const level = r.severity === "critical" ? "error" : r.severity === "warning" ? "warn" : "info";
    for (let i = 0; i < msgs.length; i++) {
      logRows.push({
        ts: now - i * 3 * min - Math.floor(Math.random() * min),
        level,
        message: msgs[i],
        service: r.service,
        traceId: null,
        spanId: null,
        attributesJson: JSON.stringify({ env: "prod" }),
      });
    }
  }

  await insertLogEntries(
    logRows.map((l) => ({
      ...l,
      tenantId,
      product: "consumer",
      market: "ZA",
      environment: "prod",
      version: "demo-1.0.0",
      instanceId: null,
    })),
  );

  return NextResponse.json({
    ok: true,
    rulesCreated: ruleIds.length,
    historyRowsInserted: historyInserted,
    metricPointsInserted: metricRows.length,
    logEntriesInserted: logRows.length,
    incidents: RULES.map((r, i) => ({
      ruleId: ruleIds[i],
      service: r.service,
      severity: r.severity,
      firingForMins: r.firingForMins,
    })),
  });
}
