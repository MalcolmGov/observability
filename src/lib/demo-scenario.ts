/** Shared demo identifiers & deep links (safe for client bundles). */

export const DEMO_SERVICES = {
  checkout: "checkout-api",
  inventory: "inventory-api",
  payment: "payment-gateway",
} as const;

export const DEMO_METRICS = {
  requestDuration: "http.server.request_duration_ms",
  requests: "http.server.requests",
  clientRoundtrip: "http.client.roundtrip_ms",
} as const;

export type DemoSeedTraceIds = {
  happyPath: string;
  failedCheckout: string;
};

export function demoLogsUrl(params: {
  service?: string;
  q?: string;
  level?: string;
  traceId?: string;
  windowMs?: number;
}) {
  const q = new URLSearchParams();
  q.set("service", params.service ?? DEMO_SERVICES.checkout);
  if (params.q) q.set("q", params.q);
  if (params.level) q.set("level", params.level);
  if (params.traceId) q.set("traceId", params.traceId);
  if (params.windowMs) q.set("windowMs", String(params.windowMs));
  return `/logs?${q}`;
}

export function demoMetricsUrl(service: string, metric: string, range: string) {
  const q = new URLSearchParams();
  q.set("service", service);
  q.set("metric", metric);
  q.set("range", range);
  return `/metrics?${q}`;
}

export function demoTracesUrl(opts: {
  service?: string;
  errorsOnly?: boolean;
  minMs?: number;
  lookbackMs?: number;
}) {
  const q = new URLSearchParams();
  if (opts.service) q.set("service", opts.service);
  if (opts.errorsOnly) q.set("errors", "1");
  if (opts.minMs != null) q.set("minMs", String(opts.minMs));
  q.set("lookbackMs", String(opts.lookbackMs ?? 86_400_000));
  return `/traces?${q}`;
}

export function demoTraceDetailUrl(traceId: string) {
  return `/traces/${encodeURIComponent(traceId)}`;
}

/** Short prompts for the NL panel — copy/paste friendly. */
export const DEMO_NL_PROMPTS = [
  {
    label: "Checkout errors",
    prompt: `errors from ${DEMO_SERVICES.checkout} in the last hour mentioning payment`,
  },
  {
    label: "Slow traces",
    prompt: `slow traces over 500ms with errors for ${DEMO_SERVICES.checkout}`,
  },
  {
    label: "Inventory latency",
    prompt: `request duration metrics for ${DEMO_SERVICES.inventory} over the last 6 hours`,
  },
] as const;

export const DEMO_STORAGE_KEY = "pulse.demo.lastSeed";

export type DemoSeedClientPayload = {
  scenarioVersion: number;
  traceIds: DemoSeedTraceIds;
  seededAtMs: number;
  inserted?: {
    metricPoints: number;
    logEntries: number;
    traceSpans: number;
  };
  alertsEnsured?: number;
};

/** JSON shape from POST /api/v1/demo/seed */
export type DemoSeedApiResponse = {
  ok: boolean;
  scenarioVersion?: number;
  traceIds?: DemoSeedTraceIds;
  services?: string[];
  inserted?: {
    metricPoints: number;
    logEntries: number;
    traceSpans: number;
  };
  sloTarget?: { service: string; targetSuccess: number };
  alertsEnsured?: number;
  error?: string;
};
