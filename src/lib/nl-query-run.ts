import "server-only";

import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";

import {
  loadNlQueryContext,
  metricNamesForService,
  type NlQueryContext,
} from "@/lib/nl-query-context";
import {
  type NlQueryApiResponse,
  type NlQueryPlan,
  nlQueryPlanSchema,
  type NlTimePreset,
} from "@/lib/nl-query-schema";
import { LOG_ATTR_KEY_RE } from "@/lib/log-attr-filter";

const PRESET_MS: Record<NlTimePreset, number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

function timeRange(now: number, preset: NlTimePreset) {
  const windowMs = PRESET_MS[preset];
  const endMs = now;
  const startMs = endMs - windowMs;
  return { preset, startMs, endMs, windowMs };
}

function pickNearestMetricName(
  requested: string,
  available: string[],
): string | null {
  const q = requested.trim().toLowerCase();
  if (!q) return available[0] ?? null;
  const exact = available.find((n) => n.toLowerCase() === q);
  if (exact) return exact;
  const partial = available.find(
    (n) => n.toLowerCase().includes(q) || q.includes(n.toLowerCase()),
  );
  if (partial) return partial;
  return available[0] ?? null;
}

function coerceService(
  raw: string | undefined,
  ctx: NlQueryContext,
  warnings: string[],
): string | undefined {
  const s = raw?.trim();
  if (!s) return undefined;
  if (ctx.services.includes(s)) return s;
  const lower = s.toLowerCase();
  const hit = ctx.services.find((x) => x.toLowerCase() === lower);
  if (hit) return hit;
  warnings.push(`Unknown service "${s}" — pick from known services.`);
  return ctx.services[0];
}

function normalizeLogsPlan(
  plan: Extract<NlQueryPlan, { kind: "logs" }>,
  ctx: NlQueryContext,
  now: number,
): NlQueryApiResponse {
  const warnings: string[] = [];
  let service = coerceService(plan.service, ctx, warnings);
  if (!service && ctx.services.length) {
    service = ctx.services[0];
    warnings.push("Defaulted service to first known service.");
  }
  if (!service) {
    throw new Error("No services in store — ingest telemetry first.");
  }

  let attrKey = plan.attrKey?.trim();
  if (attrKey && !LOG_ATTR_KEY_RE.test(attrKey)) {
    warnings.push(`Ignored invalid attrKey "${attrKey}".`);
    attrKey = undefined;
  }

  return {
    kind: "logs",
    reasoning: plan.reasoning.trim(),
    time: timeRange(now, plan.timePreset),
    logs: {
      service,
      q: plan.q?.trim() || undefined,
      level: plan.level,
      traceId: plan.traceId?.trim() || undefined,
      attrKey,
      attrValue: plan.attrValue?.trim() || undefined,
    },
    warnings,
  };
}

async function normalizeMetricsPlan(
  plan: Extract<NlQueryPlan, { kind: "metrics" }>,
  ctx: NlQueryContext,
  now: number,
): Promise<NlQueryApiResponse> {
  const warnings: string[] = [];
  let service = coerceService(plan.service, ctx, warnings);
  if (!service && ctx.services.length) {
    service = ctx.services[0];
    warnings.push("Defaulted service to first known service.");
  }
  if (!service) {
    throw new Error("No services in store — ingest telemetry first.");
  }

  const names = await metricNamesForService(service);
  const picked = pickNearestMetricName(plan.metricName, names);
  if (!picked) {
    throw new Error(`No metrics found for service "${service}".`);
  }
  if (picked !== plan.metricName.trim()) {
    warnings.push(
      `Adjusted metric name "${plan.metricName.trim()}" → "${picked}".`,
    );
  }

  let rangeKey: NlTimePreset = plan.timePreset;

  return {
    kind: "metrics",
    reasoning: plan.reasoning.trim(),
    time: timeRange(now, plan.timePreset),
    metrics: {
      service: service,
      metricName: picked,
      rangeKey,
    },
    warnings,
  };
}

function normalizeTracesPlan(
  plan: Extract<NlQueryPlan, { kind: "traces" }>,
  ctx: NlQueryContext,
  now: number,
): NlQueryApiResponse {
  const warnings: string[] = [];
  const service = coerceService(plan.service, ctx, warnings);

  return {
    kind: "traces",
    reasoning: plan.reasoning.trim(),
    time: timeRange(now, plan.timePreset),
    traces: {
      service,
      errorsOnly: plan.errorsOnly === true ? true : undefined,
      minDurationMs:
        typeof plan.minDurationMs === "number" &&
        Number.isFinite(plan.minDurationMs) &&
        plan.minDurationMs > 0
          ? Math.round(plan.minDurationMs)
          : undefined,
      lookbackMs: PRESET_MS[plan.timePreset],
    },
    warnings,
  };
}

function buildSystemPrompt(
  ctx: NlQueryContext,
  pageHint?: "logs" | "metrics" | "traces",
): string {
  const svc =
    ctx.services.length > 0 ? ctx.services.join(", ") : "(no services yet)";
  const metrics =
    ctx.metricNames.length > 0
      ? ctx.metricNames.join(", ")
      : "(no metric names yet)";
  const hint =
    pageHint === "logs"
      ? "The user is on the Log explorer — prefer kind logs unless they clearly ask for charts or traces."
      : pageHint === "metrics"
        ? "The user is on the Metrics explorer — prefer kind metrics unless they clearly ask for raw logs or traces."
        : pageHint === "traces"
          ? "The user is on the Traces explorer — prefer kind traces unless they clearly ask for logs or metric charts."
          : "Infer the best kind from the question.";

  return `You convert short natural-language questions into a structured query plan for an observability UI.

Known services (exact strings): ${svc}
Known metric names (hints; metrics also depend on service): ${metrics}

Rules:
- Use exact service strings from the list when possible.
- For logs: optional q is a substring match on message or JSON attributes; level is only error|warn|info|debug when explicitly requested.
- For metrics: metricName must be chosen from names plausible for the service; pick the closest match from the hints list.
- For traces: service is optional (all traces); errorsOnly when user asks for failures/errors; minDurationMs when user mentions slow/latency thresholds (convert seconds to ms).
- timePreset: choose from recent window implied by the user (default 24h if unspecified).

${hint}

Respond only as structured JSON matching the schema.`;
}

export async function runNlQueryPlanner(options: {
  prompt: string;
  pageHint?: "logs" | "metrics" | "traces";
  now?: number;
}): Promise<NlQueryApiResponse> {
  const now = options.now ?? Date.now();
  const ctx = await loadNlQueryContext();

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const modelId =
    process.env.OPENAI_NL_MODEL?.trim() || "gpt-4o-mini";

  const { object: plan } = await generateObject({
    model: openai(modelId),
    schema: nlQueryPlanSchema,
    system: buildSystemPrompt(ctx, options.pageHint),
    prompt: options.prompt.trim(),
  });

  switch (plan.kind) {
    case "logs":
      return normalizeLogsPlan(plan, ctx, now);
    case "metrics":
      return normalizeMetricsPlan(plan, ctx, now);
    case "traces":
      return normalizeTracesPlan(plan, ctx, now);
    default: {
      const _exhaustive: never = plan;
      void _exhaustive;
      throw new Error("Unsupported NL query kind");
    }
  }
}
