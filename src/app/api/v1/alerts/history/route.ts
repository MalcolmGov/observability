import { queryAll } from "@/db/client";
import { getTelemetryTenantIdFromRequest } from "@/lib/telemetry-tenant";
import { NextResponse } from "next/server";

/** Recent evaluation snapshots (audit / incident timeline). */
export async function GET(req: Request) {
  const tenantId = getTelemetryTenantIdFromRequest(req);
  const limit = Math.min(
    Number(new URL(req.url).searchParams.get("limit")) || 80,
    500,
  );

  const rows = await queryAll<{
    id: number;
    ruleId: number;
    ruleName: string | null;
    evaluatedAtMs: number;
    firing: number;
    observedAvg: number | null;
    silenced: number;
  }>(
    `
    SELECT
      h.id,
      h.rule_id AS ruleId,
      r.name AS ruleName,
      h.evaluated_at_ms AS evaluatedAtMs,
      h.firing,
      h.observed_avg AS observedAvg,
      h.silenced
    FROM alert_eval_history h
    LEFT JOIN alert_rules r ON r.id = h.rule_id
    WHERE h.tenant_id = ?
    ORDER BY h.evaluated_at_ms DESC
    LIMIT ?
  `,
    [tenantId, limit],
  );

  return NextResponse.json({
    entries: rows.map((r) => ({
      id: r.id,
      ruleId: r.ruleId,
      ruleName: r.ruleName,
      evaluatedAtMs: Number(r.evaluatedAtMs),
      firing: Boolean(r.firing),
      observedAvg:
        r.observedAvg != null && Number.isFinite(Number(r.observedAvg))
          ? Number(r.observedAvg)
          : null,
      silenced: Boolean(r.silenced),
    })),
  });
}
