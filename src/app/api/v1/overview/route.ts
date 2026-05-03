import { queryAll, queryGet } from "@/db/client";
import { NextResponse } from "next/server";

type ServiceRow = {
  service: string;
  errors1h: number;
  warns1h: number;
  logs1h: number;
  metrics1h: number;
  lastMetricTs: number | null;
  lastLogTs: number | null;
  lastTraceTs: number | null;
};

const DEFAULT_WINDOW_MS = 60 * 60 * 1000;
const MIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_WINDOW_MS = 48 * 60 * 60 * 1000;

export async function GET(req: Request) {
  const now = Date.now();
  const { searchParams } = new URL(req.url);
  const requested = Number(searchParams.get("windowMs"));
  const windowMs = Number.isFinite(requested)
    ? Math.min(MAX_WINDOW_MS, Math.max(MIN_WINDOW_MS, requested))
    : DEFAULT_WINDOW_MS;
  const since = now - windowMs;
  const staleAfterMs = 5 * 60 * 1000;

  const serviceNames = await queryAll<{ service: string }>(
    `
      SELECT DISTINCT service FROM metric_points WHERE ts >= ?
      UNION
      SELECT DISTINCT service FROM log_entries WHERE ts >= ?
      UNION
      SELECT DISTINCT service FROM trace_spans WHERE start_ts >= ?
      ORDER BY service ASC
    `,
    [since, since, since],
  );

  const names = serviceNames.map((r) => r.service).filter(Boolean);

  const totals = {
    services: names.length,
    metricPoints1h: Number(
      (
        await queryGet<{ c: number }>(
          `SELECT COUNT(*) AS c FROM metric_points WHERE ts >= ?`,
          [since],
        )
      )?.c ?? 0,
    ),
    logLines1h: Number(
      (
        await queryGet<{ c: number }>(
          `SELECT COUNT(*) AS c FROM log_entries WHERE ts >= ?`,
          [since],
        )
      )?.c ?? 0,
    ),
    errorLogs1h: Number(
      (
        await queryGet<{ c: number }>(
          `SELECT COUNT(*) AS c FROM log_entries WHERE ts >= ? AND level = 'error'`,
          [since],
        )
      )?.c ?? 0,
    ),
  };

  const services: ServiceRow[] = [];
  for (const service of names) {
    const errors1h = Number(
      (
        await queryGet<{ c: number }>(
          `
        SELECT COUNT(*) AS c FROM log_entries
        WHERE service = ? AND ts >= ? AND level = 'error'
      `,
          [service, since],
        )
      )?.c ?? 0,
    );

    const warns1h = Number(
      (
        await queryGet<{ c: number }>(
          `
        SELECT COUNT(*) AS c FROM log_entries
        WHERE service = ? AND ts >= ? AND level IN ('warn','warning')
      `,
          [service, since],
        )
      )?.c ?? 0,
    );

    const logs1h = Number(
      (
        await queryGet<{ c: number }>(
          `
        SELECT COUNT(*) AS c FROM log_entries
        WHERE service = ? AND ts >= ?
      `,
          [service, since],
        )
      )?.c ?? 0,
    );

    const metrics1h = Number(
      (
        await queryGet<{ c: number }>(
          `
        SELECT COUNT(*) AS c FROM metric_points
        WHERE service = ? AND ts >= ?
      `,
          [service, since],
        )
      )?.c ?? 0,
    );

    const lastMetric = await queryGet<{ t: number | null }>(
      `SELECT MAX(ts) AS t FROM metric_points WHERE service = ?`,
      [service],
    );

    const lastLog = await queryGet<{ t: number | null }>(
      `SELECT MAX(ts) AS t FROM log_entries WHERE service = ?`,
      [service],
    );

    const lastTrace = await queryGet<{ t: number | null }>(
      `SELECT MAX(end_ts) AS t FROM trace_spans WHERE service = ?`,
      [service],
    );

    services.push({
      service,
      errors1h,
      warns1h,
      logs1h,
      metrics1h,
      lastMetricTs: lastMetric?.t ?? null,
      lastLogTs: lastLog?.t ?? null,
      lastTraceTs: lastTrace?.t ?? null,
    });
  }

  const enriched = services.map((s) => {
    const lastSeen = Math.max(
      s.lastMetricTs ?? 0,
      s.lastLogTs ?? 0,
      s.lastTraceTs ?? 0,
    );
    const receiving = lastSeen > 0 && now - lastSeen < staleAfterMs;
    let health: "healthy" | "degraded" | "critical" = "healthy";
    if (s.errors1h >= 3) health = "critical";
    else if (s.errors1h > 0 || s.warns1h >= 5) health = "degraded";

    return {
      ...s,
      lastSeenMs: lastSeen,
      receiving,
      health,
    };
  });

  return NextResponse.json({
    generatedAtMs: now,
    windowMs,
    totals,
    services: enriched,
  });
}
