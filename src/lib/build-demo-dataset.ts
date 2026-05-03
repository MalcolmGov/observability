import "server-only";

import {
  DEMO_METRICS,
  DEMO_SERVICES,
  type DemoSeedTraceIds,
} from "@/lib/demo-scenario";

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
  eventsJson?: string;
  linksJson?: string;
};

export type DemoDataset = {
  scenarioVersion: number;
  metricRows: MetricRow[];
  logRows: LogRow[];
  traceSpans: TraceRow[];
  traceIds: DemoSeedTraceIds;
};

function mkLabels(service: string, extras: Record<string, string> = {}) {
  return JSON.stringify({
    service,
    env: "demo",
    region: "us-east-1",
    ...extras,
  });
}

function buildMetrics(now: number): MetricRow[] {
  const windowMs = 90 * 60 * 1000;
  const start = now - windowMs;
  const step = 60_000;
  const rows: MetricRow[] = [];

  const series: {
    service: string;
    base: number;
    amp: number;
    metrics: { name: string; scale?: number }[];
  }[] = [
    {
      service: DEMO_SERVICES.checkout,
      base: 88,
      amp: 14,
      metrics: [
        { name: DEMO_METRICS.requestDuration },
        { name: DEMO_METRICS.requests, scale: 1 },
      ],
    },
    {
      service: DEMO_SERVICES.inventory,
      base: 42,
      amp: 10,
      metrics: [
        { name: DEMO_METRICS.requestDuration },
        { name: DEMO_METRICS.requests, scale: 0.55 },
      ],
    },
    {
      service: DEMO_SERVICES.payment,
      base: 125,
      amp: 35,
      metrics: [
        { name: DEMO_METRICS.requestDuration },
        { name: DEMO_METRICS.clientRoundtrip },
        { name: DEMO_METRICS.requests, scale: 0.35 },
      ],
    },
  ];

  for (let t = start; t <= now; t += step) {
    for (const svc of series) {
      const wave = Math.sin(t / 140000) * svc.amp + (Math.random() - 0.5) * 6;
      const labels = mkLabels(svc.service);
      for (const m of svc.metrics) {
        const scale = m.scale ?? 1;
        if (m.name === DEMO_METRICS.requests) {
          rows.push({
            ts: t,
            name: m.name,
            value: Math.floor((95 + Math.random() * 55) * scale),
            service: svc.service,
            labelsJson: labels,
          });
        } else {
          rows.push({
            ts: t,
            name: m.name,
            value: Math.max(8, (svc.base + wave) * scale),
            service: svc.service,
            labelsJson: labels,
          });
        }
      }
    }
  }

  return rows;
}

function buildTraces(now: number): { spans: TraceRow[]; traceIds: DemoSeedTraceIds } {
  const checkout = DEMO_SERVICES.checkout;
  const inventory = DEMO_SERVICES.inventory;
  const payment = DEMO_SERVICES.payment;

  const suffix = now.toString(36).toUpperCase().slice(-8);
  const happyTraceId = `01JDEMO${suffix}H`;
  const failTraceId = `01JDEMO${suffix}F`;

  const t0 = now - 72_000;
  const happy: TraceRow[] = [
    {
      traceId: happyTraceId,
      spanId: `${happyTraceId}-root`,
      parentSpanId: null,
      service: checkout,
      name: "POST /checkout",
      startTs: t0,
      endTs: t0 + 95,
      durationMs: 95,
      kind: "server",
      status: "ok",
      peerService: null,
      attributesJson: JSON.stringify({
        "http.route": "/checkout",
        "http.method": "POST",
      }),
    },
    {
      traceId: happyTraceId,
      spanId: `${happyTraceId}-inv-client`,
      parentSpanId: `${happyTraceId}-root`,
      service: checkout,
      name: "GET /inventory/stock",
      startTs: t0 + 6,
      endTs: t0 + 78,
      durationMs: 72,
      kind: "client",
      status: "ok",
      peerService: inventory,
      attributesJson: JSON.stringify({ "rpc.system": "http" }),
    },
    {
      traceId: happyTraceId,
      spanId: `${happyTraceId}-inv-srv`,
      parentSpanId: `${happyTraceId}-inv-client`,
      service: inventory,
      name: "GET /stock",
      startTs: t0 + 8,
      endTs: t0 + 74,
      durationMs: 66,
      kind: "server",
      status: "ok",
      peerService: null,
      attributesJson: JSON.stringify({ "http.route": "/stock" }),
    },
    {
      traceId: happyTraceId,
      spanId: `${happyTraceId}-sql`,
      parentSpanId: `${happyTraceId}-inv-srv`,
      service: inventory,
      name: "SELECT stock",
      startTs: t0 + 14,
      endTs: t0 + 62,
      durationMs: 48,
      kind: "internal",
      status: "ok",
      peerService: "postgres",
      attributesJson: JSON.stringify({ "db.system": "postgresql" }),
    },
    {
      traceId: happyTraceId,
      spanId: `${happyTraceId}-pay`,
      parentSpanId: `${happyTraceId}-root`,
      service: checkout,
      name: "POST /payments/charge",
      startTs: t0 + 22,
      endTs: t0 + 88,
      durationMs: 66,
      kind: "client",
      status: "ok",
      peerService: payment,
      attributesJson: JSON.stringify({ "rpc.system": "http" }),
    },
    {
      traceId: happyTraceId,
      spanId: `${happyTraceId}-pay-srv`,
      parentSpanId: `${happyTraceId}-pay`,
      service: payment,
      name: "POST /charge",
      startTs: t0 + 24,
      endTs: t0 + 84,
      durationMs: 60,
      kind: "server",
      status: "ok",
      peerService: null,
      attributesJson: JSON.stringify({ "http.route": "/charge" }),
    },
  ];

  const t1 = now - 38_000;
  const failed: TraceRow[] = [
    {
      traceId: failTraceId,
      spanId: `${failTraceId}-root`,
      parentSpanId: null,
      service: checkout,
      name: "POST /checkout",
      startTs: t1,
      endTs: t1 + 820,
      durationMs: 820,
      kind: "server",
      status: "error",
      peerService: null,
      attributesJson: JSON.stringify({
        "http.route": "/checkout",
        "http.method": "POST",
        error: "payment_processor_timeout",
      }),
    },
    {
      traceId: failTraceId,
      spanId: `${failTraceId}-pay-client`,
      parentSpanId: `${failTraceId}-root`,
      service: checkout,
      name: "POST /payments/charge",
      startTs: t1 + 12,
      endTs: t1 + 805,
      durationMs: 793,
      kind: "client",
      status: "ok",
      peerService: payment,
      attributesJson: JSON.stringify({ "rpc.system": "http" }),
    },
    {
      traceId: failTraceId,
      spanId: `${failTraceId}-pay-srv`,
      parentSpanId: `${failTraceId}-pay-client`,
      service: payment,
      name: "POST /charge",
      startTs: t1 + 18,
      endTs: t1 + 798,
      durationMs: 780,
      kind: "server",
      status: "error",
      peerService: null,
      attributesJson: JSON.stringify({
        "http.route": "/charge",
        "psp.code": "issuer_declined",
      }),
      eventsJson: JSON.stringify([
        {
          name: "exception",
          attributes: {
            type: "IssuerTimeout",
            message: "PSP did not respond within deadline",
          },
        },
      ]),
      linksJson: "[]",
    },
    {
      traceId: failTraceId,
      spanId: `${failTraceId}-inv-quick`,
      parentSpanId: `${failTraceId}-root`,
      service: checkout,
      name: "GET /inventory/stock",
      startTs: t1 + 4,
      endTs: t1 + 36,
      durationMs: 32,
      kind: "client",
      status: "ok",
      peerService: inventory,
      attributesJson: JSON.stringify({ "rpc.system": "http" }),
    },
    {
      traceId: failTraceId,
      spanId: `${failTraceId}-inv-srv`,
      parentSpanId: `${failTraceId}-inv-quick`,
      service: inventory,
      name: "GET /stock",
      startTs: t1 + 6,
      endTs: t1 + 30,
      durationMs: 24,
      kind: "server",
      status: "ok",
      peerService: null,
      attributesJson: JSON.stringify({ "http.route": "/stock" }),
    },
  ];

  return {
    spans: [...happy, ...failed],
    traceIds: { happyPath: happyTraceId, failedCheckout: failTraceId },
  };
}

function buildLogs(now: number, traceIds: DemoSeedTraceIds): LogRow[] {
  const checkout = DEMO_SERVICES.checkout;
  const inventory = DEMO_SERVICES.inventory;
  const payment = DEMO_SERVICES.payment;

  const m = (mins: number) => now - mins * 60_000;

  return [
    {
      ts: m(82),
      level: "info",
      message: "Demo scenario baseline — multi-service checkout flow",
      service: checkout,
      attributesJson: JSON.stringify({
        demo: true,
        scenario: "pulse-retail",
      }),
    },
    {
      ts: m(78),
      level: "info",
      message: "Stock reservation confirmed",
      service: inventory,
      attributesJson: JSON.stringify({
        sku: "SKU-4412",
        qty: 1,
        trace_id: traceIds.happyPath,
      }),
    },
    {
      ts: m(74),
      level: "warn",
      message: "Retrying downstream inventory lock",
      service: checkout,
      attributesJson: JSON.stringify({ attempt: 2, sku: "SKU-4412" }),
    },
    {
      ts: m(70),
      level: "info",
      message: "Stripe webhook received",
      service: payment,
      attributesJson: JSON.stringify({
        event_type: "payment_intent.succeeded",
        trace_id: traceIds.happyPath,
      }),
    },
    {
      ts: m(62),
      level: "info",
      message: "PSP latency within SLO",
      service: payment,
      attributesJson: JSON.stringify({
        partner: "demo_psp",
        latency_ms: 118,
      }),
    },
    {
      ts: m(55),
      level: "warn",
      message: "Elevated queue depth on stock shard B",
      service: inventory,
      attributesJson: JSON.stringify({ shard: "B", depth: 812 }),
    },
    {
      ts: m(48),
      level: "error",
      message: "Inventory service timeout",
      service: checkout,
      attributesJson: JSON.stringify({
        trace_id: traceIds.happyPath,
        elapsed_ms: 5002,
      }),
    },
    {
      ts: m(42),
      level: "error",
      message: "Charge declined — issuer timeout",
      service: payment,
      attributesJson: JSON.stringify({
        trace_id: traceIds.failedCheckout,
        psp_request_id: "req_demo_9982",
      }),
    },
    {
      ts: m(38),
      level: "error",
      message: "Checkout abandoned after PSP failure",
      service: checkout,
      attributesJson: JSON.stringify({
        trace_id: traceIds.failedCheckout,
        cart_id: "cart_demo_22",
      }),
    },
    {
      ts: m(33),
      level: "warn",
      message: "Circuit breaker half-open for PSP sandbox",
      service: payment,
      attributesJson: JSON.stringify({ breaker: "psp_sandbox" }),
    },
    {
      ts: m(28),
      level: "info",
      message: "Canary deployment 10% — checkout",
      service: checkout,
      attributesJson: JSON.stringify({ version: "v2.4.1-canary" }),
    },
    {
      ts: m(22),
      level: "debug",
      message: "Feature flag evaluation",
      service: checkout,
      attributesJson: JSON.stringify({
        flag: "fast_inventory_path",
        value: true,
      }),
    },
    {
      ts: m(18),
      level: "info",
      message: "Scheduled cache warmup complete",
      service: inventory,
      attributesJson: JSON.stringify({ keys: 4200 }),
    },
    {
      ts: m(12),
      level: "warn",
      message: "Rate limit approaching for guest checkout",
      service: checkout,
      attributesJson: JSON.stringify({ bucket: "guest_ip", pct: 86 }),
    },
    {
      ts: m(8),
      level: "info",
      message: "Health check OK",
      service: payment,
      attributesJson: JSON.stringify({ region: "us-east-1" }),
    },
    {
      ts: m(4),
      level: "error",
      message: "Synthetic probe failed for /charge",
      service: payment,
      attributesJson: JSON.stringify({
        probe: "synthetic_east",
        trace_id: traceIds.failedCheckout,
      }),
    },
  ];
}

export function buildDemoDataset(now = Date.now()): DemoDataset {
  const metricRows = buildMetrics(now);
  const { spans, traceIds } = buildTraces(now);
  const logRows = buildLogs(now, traceIds);

  return {
    scenarioVersion: 2,
    metricRows,
    logRows,
    traceSpans: spans,
    traceIds,
  };
}
