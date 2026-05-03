import { queryAll } from "@/db/client";
import { percentilesFromValues } from "@/lib/stats";
import { NextResponse } from "next/server";

const DEFAULT_WINDOW_MS = 60 * 60 * 1000;
const MIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_WINDOW_MS = 48 * 60 * 60 * 1000;

export async function GET(req: Request) {
  const now = Date.now();
  const { searchParams } = new URL(req.url);
  const service = searchParams.get("service");
  if (!service) {
    return NextResponse.json({ error: "service is required" }, { status: 400 });
  }

  const requested = Number(searchParams.get("windowMs"));
  const windowMs = Number.isFinite(requested)
    ? Math.min(MAX_WINDOW_MS, Math.max(MIN_WINDOW_MS, requested))
    : DEFAULT_WINDOW_MS;
  const since = now - windowMs;

  const roots = await queryAll<{
    resource: string;
    durationMs: number;
    status: string;
  }>(
    `
    SELECT
      COALESCE(
        NULLIF(TRIM(json_extract(attributes_json, '$.http.route')), ''),
        name
      ) AS resource,
      duration_ms AS durationMs,
      status
    FROM trace_spans
    WHERE service = ?
      AND start_ts >= ? AND start_ts <= ?
      AND (parent_span_id IS NULL OR parent_span_id = '')
  `,
    [service, since, now],
  );

  type Agg = { durations: number[]; errors: number; requests: number };
  const byResource = new Map<string, Agg>();
  for (const r of roots) {
    const key = r.resource || "(unknown)";
    let a = byResource.get(key);
    if (!a) {
      a = { durations: [], errors: 0, requests: 0 };
      byResource.set(key, a);
    }
    a.requests += 1;
    a.durations.push(Number(r.durationMs));
    if (r.status === "error") a.errors += 1;
  }

  const operations = [...byResource.entries()]
    .map(([resource, agg]) => {
      const { p50, p95, p99 } = percentilesFromValues(agg.durations);
      return {
        resource,
        requests: agg.requests,
        errorCount: agg.errors,
        errorRate: agg.requests ? agg.errors / agg.requests : 0,
        p50Ms: p50,
        p95Ms: p95,
        p99Ms: p99,
      };
    })
    .sort(
      (a, b) =>
        b.requests - a.requests || a.resource.localeCompare(b.resource),
    );

  return NextResponse.json({
    generatedAtMs: now,
    windowMs,
    service,
    operations,
  });
}
