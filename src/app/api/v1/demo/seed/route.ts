import { buildDemoDataset } from "@/lib/build-demo-dataset";
import { DEMO_METRICS, DEMO_SERVICES } from "@/lib/demo-scenario";
import {
  insertLogEntries,
  insertMetricPoints,
  insertTraceSpans,
  queryGet,
  queryRun,
} from "@/db/client";
import { getTelemetryTenantIdFromRequest } from "@/lib/telemetry-tenant";
import { NextResponse } from "next/server";

const DEMO_ALERTS: {
  name: string;
  metricName: string;
  service: string;
  comparator: string;
  threshold: number;
  windowMinutes: number;
}[] = [
  {
    name: "Demo: checkout latency over 80ms (avg)",
    metricName: DEMO_METRICS.requestDuration,
    service: DEMO_SERVICES.checkout,
    comparator: "gt",
    threshold: 80,
    windowMinutes: 5,
  },
  {
    name: "Demo: payment gateway latency spike",
    metricName: DEMO_METRICS.requestDuration,
    service: DEMO_SERVICES.payment,
    comparator: "gt",
    threshold: 220,
    windowMinutes: 5,
  },
  {
    name: "Demo: inventory elevated latency",
    metricName: DEMO_METRICS.requestDuration,
    service: DEMO_SERVICES.inventory,
    comparator: "gt",
    threshold: 65,
    windowMinutes: 10,
  },
];

/** Rich sample data for showroom / evaluation. Disable in production unless ALLOW_DEMO_SEED=1 */
export async function POST(req: Request) {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_DEMO_SEED !== "1"
  ) {
    return NextResponse.json({ error: "Not available" }, { status: 403 });
  }

  const tenantId = getTelemetryTenantIdFromRequest(req);
  const now = Date.now();
  const dataset = buildDemoDataset(now);

  const demoIdentity = {
    product: "consumer",
    market: "ZA",
    environment: "demo",
    version: "demo-1.0.0" as string | null,
    instanceId: null as string | null,
  };

  await insertMetricPoints(
    dataset.metricRows.map((r) => ({ ...r, ...demoIdentity, tenantId })),
  );
  await insertTraceSpans(
    dataset.traceSpans.map((r) => ({ ...r, ...demoIdentity, tenantId })),
  );
  await insertLogEntries(
    dataset.logRows.map((r) => ({ ...r, ...demoIdentity, tenantId })),
  );

  await queryRun(
    `INSERT INTO slo_targets (service, target_success, updated_at, product, market, environment)
       VALUES (?, ?, ?, 'consumer', 'ZA', 'demo')
       ON CONFLICT (service, product, market, environment) DO UPDATE SET
         target_success = excluded.target_success,
         updated_at = excluded.updated_at`,
    [DEMO_SERVICES.checkout, 0.995, now],
  );

  for (const rule of DEMO_ALERTS) {
    const exists = await queryGet<{ one: number }>(
      `SELECT 1 AS one FROM alert_rules WHERE name = ? LIMIT 1`,
      [rule.name],
    );
    if (exists) continue;
    await queryRun(
      `INSERT INTO alert_rules (name, enabled, metric_name, service, comparator, threshold, window_minutes, webhook_url, runbook_url, slack_webhook_url, pagerduty_routing_key, product, market_scope, environment) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        rule.name,
        1,
        rule.metricName,
        rule.service,
        rule.comparator,
        rule.threshold,
        rule.windowMinutes,
        null,
        null,
        null,
        null,
        null,
        null,
        "prod",
      ],
    );
  }

  return NextResponse.json({
    ok: true,
    scenarioVersion: dataset.scenarioVersion,
    traceIds: dataset.traceIds,
    services: Object.values(DEMO_SERVICES),
    inserted: {
      metricPoints: dataset.metricRows.length,
      logEntries: dataset.logRows.length,
      traceSpans: dataset.traceSpans.length,
    },
    sloTarget: {
      service: DEMO_SERVICES.checkout,
      product: "consumer",
      market: "ZA",
      environment: "demo",
      targetSuccess: 0.995,
    },
    alertsEnsured: DEMO_ALERTS.length,
  });
}
