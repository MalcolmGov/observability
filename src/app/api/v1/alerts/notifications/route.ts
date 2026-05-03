import { queryAll } from "@/db/client";
import { getTelemetryTenantIdFromRequest } from "@/lib/telemetry-tenant";
import { NextResponse } from "next/server";

const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** In-app notification feed: most recent firing evaluation per rule, joined
 *  with rule meta. One row per rule (de-duped to its latest firing snapshot)
 *  so the bell shows distinct incidents, not every 5-min poll. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const tenantId = getTelemetryTenantIdFromRequest(req);

  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit")) || 30, 1),
    100,
  );
  const windowMs = Math.max(
    Number(url.searchParams.get("windowMs")) || DEFAULT_WINDOW_MS,
    60_000,
  );
  const since = Date.now() - windowMs;

  const rows = await queryAll<{
    ruleId: number;
    evaluatedAtMs: number;
    observedAvg: number | null;
    ruleName: string | null;
    service: string | null;
    severity: string | null;
    marketScope: string | null;
    environment: string | null;
    runbookUrl: string | null;
    metricName: string | null;
    threshold: number | null;
    comparator: string | null;
  }>(
    `
    WITH latest_firing AS (
      SELECT rule_id, MAX(evaluated_at_ms) AS last_ms
      FROM alert_eval_history
      WHERE tenant_id = ?
        AND firing = 1
        AND silenced = 0
        AND evaluated_at_ms >= ?
      GROUP BY rule_id
    )
    SELECT
      lf.rule_id        AS ruleId,
      lf.last_ms        AS evaluatedAtMs,
      h.observed_avg    AS observedAvg,
      r.name            AS ruleName,
      r.service         AS service,
      r.severity        AS severity,
      r.market_scope    AS marketScope,
      r.environment     AS environment,
      r.runbook_url     AS runbookUrl,
      r.metric_name     AS metricName,
      r.threshold       AS threshold,
      r.comparator      AS comparator
    FROM latest_firing lf
    JOIN alert_eval_history h
      ON h.rule_id = lf.rule_id
     AND h.evaluated_at_ms = lf.last_ms
     AND h.tenant_id = ?
    JOIN alert_rules r ON r.id = lf.rule_id
    ORDER BY lf.last_ms DESC
    LIMIT ?
    `,
    [tenantId, since, tenantId, limit],
  );

  const notifications = rows.map((r) => ({
    ruleId: Number(r.ruleId),
    ruleName: r.ruleName ?? `Rule ${r.ruleId}`,
    service: r.service ?? "",
    severity: (r.severity ?? "warning") as "info" | "warning" | "critical",
    metricName: r.metricName ?? null,
    comparator: r.comparator ?? null,
    threshold: r.threshold != null ? Number(r.threshold) : null,
    observedAvg:
      r.observedAvg != null && Number.isFinite(Number(r.observedAvg))
        ? Number(r.observedAvg)
        : null,
    marketScope: r.marketScope ?? null,
    environment: r.environment ?? "prod",
    runbookUrl: r.runbookUrl ?? null,
    evaluatedAtMs: Number(r.evaluatedAtMs),
  }));

  return NextResponse.json({
    generatedAtMs: Date.now(),
    windowMs,
    notifications,
  });
}
