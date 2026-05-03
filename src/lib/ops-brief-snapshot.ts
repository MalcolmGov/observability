import "server-only";

import { queryAll, queryGet } from "@/db/client";

export type OpsBriefSnapshot = {
  generatedAtMs: number;
  windowHours: number;
  totals: {
    services: number;
    metricSamples: number;
    logLines: number;
    errorLogs: number;
    traceRootsApprox: number;
  };
  services: Array<{
    name: string;
    health: "healthy" | "degraded" | "critical";
    errors: number;
    warns: number;
    receiving: boolean;
  }>;
  recentErrors: Array<{ service: string; message: string }>;
  alerts: { enabled: number; total: number };
};

const STALE_MS = 5 * 60 * 1000;

function truncateMsg(s: string, max = 200): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export async function loadOpsBriefSnapshot(
  windowMs: number,
  tenantId: string,
): Promise<OpsBriefSnapshot> {
  const now = Date.now();
  const since = now - windowMs;
  const windowHours = Math.round(windowMs / (60 * 60 * 1000));

  const serviceNames = await queryAll<{ service: string }>(
    `
      SELECT DISTINCT service FROM metric_points WHERE tenant_id = ? AND ts >= ?
      UNION
      SELECT DISTINCT service FROM log_entries WHERE tenant_id = ? AND ts >= ?
      UNION
      SELECT DISTINCT service FROM trace_spans WHERE tenant_id = ? AND start_ts >= ?
      ORDER BY service ASC
    `,
    [tenantId, since, tenantId, since, tenantId, since],
  );

  const names = serviceNames.map((r) => r.service).filter(Boolean);

  const totals = {
    services: names.length,
    metricSamples: Number(
      (
        await queryGet<{ c: number }>(
          `SELECT COUNT(*) AS c FROM metric_points WHERE tenant_id = ? AND ts >= ?`,
          [tenantId, since],
        )
      )?.c ?? 0,
    ),
    logLines: Number(
      (
        await queryGet<{ c: number }>(
          `SELECT COUNT(*) AS c FROM log_entries WHERE tenant_id = ? AND ts >= ?`,
          [tenantId, since],
        )
      )?.c ?? 0,
    ),
    errorLogs: Number(
      (
        await queryGet<{ c: number }>(
          `SELECT COUNT(*) AS c FROM log_entries WHERE tenant_id = ? AND ts >= ? AND level = 'error'`,
          [tenantId, since],
        )
      )?.c ?? 0,
    ),
    traceRootsApprox: Number(
      (
        await queryGet<{ c: number }>(
          `SELECT COUNT(*) AS c FROM trace_spans WHERE tenant_id = ? AND start_ts >= ? AND (parent_span_id IS NULL OR parent_span_id = '')`,
          [tenantId, since],
        )
      )?.c ?? 0,
    ),
  };

  const services: OpsBriefSnapshot["services"] = [];

  for (const service of names.slice(0, 24)) {
    const errors = Number(
      (
        await queryGet<{ c: number }>(
          `SELECT COUNT(*) AS c FROM log_entries WHERE tenant_id = ? AND service = ? AND ts >= ? AND level = 'error'`,
          [tenantId, service, since],
        )
      )?.c ?? 0,
    );
    const warns = Number(
      (
        await queryGet<{ c: number }>(
          `SELECT COUNT(*) AS c FROM log_entries WHERE tenant_id = ? AND service = ? AND ts >= ? AND level IN ('warn','warning')`,
          [tenantId, service, since],
        )
      )?.c ?? 0,
    );

    const lastMetric = await queryGet<{ t: number | null }>(
      `SELECT MAX(ts) AS t FROM metric_points WHERE tenant_id = ? AND service = ?`,
      [tenantId, service],
    );
    const lastLog = await queryGet<{ t: number | null }>(
      `SELECT MAX(ts) AS t FROM log_entries WHERE tenant_id = ? AND service = ?`,
      [tenantId, service],
    );
    const lastTrace = await queryGet<{ t: number | null }>(
      `SELECT MAX(end_ts) AS t FROM trace_spans WHERE tenant_id = ? AND service = ?`,
      [tenantId, service],
    );

    const lastSeen = Math.max(
      lastMetric?.t ?? 0,
      lastLog?.t ?? 0,
      lastTrace?.t ?? 0,
    );
    const receiving = lastSeen > 0 && now - lastSeen < STALE_MS;

    let health: "healthy" | "degraded" | "critical" = "healthy";
    if (errors >= 3) health = "critical";
    else if (errors > 0 || warns >= 5) health = "degraded";

    services.push({
      name: service,
      health,
      errors,
      warns,
      receiving,
    });
  }

  services.sort((a, b) => b.errors + b.warns - (a.errors + a.warns));

  const errRows = await queryAll<{ service: string; message: string }>(
    `
    SELECT service, message FROM log_entries
    WHERE tenant_id = ? AND ts >= ? AND level = 'error'
    ORDER BY ts DESC
    LIMIT 12
    `,
    [tenantId, since],
  );

  const recentErrors = errRows.map((r) => ({
    service: r.service,
    message: truncateMsg(r.message ?? ""),
  }));

  let alerts = { enabled: 0, total: 0 };
  try {
    alerts.total = Number(
      (await queryGet<{ c: number }>(`SELECT COUNT(*) AS c FROM alert_rules`))
        ?.c ?? 0,
    );
    alerts.enabled = Number(
      (
        await queryGet<{ c: number }>(
          `SELECT COUNT(*) AS c FROM alert_rules WHERE enabled = 1`,
        )
      )?.c ?? 0,
    );
  } catch {
    alerts = { enabled: 0, total: 0 };
  }

  return {
    generatedAtMs: now,
    windowHours,
    totals,
    services,
    recentErrors,
    alerts,
  };
}
