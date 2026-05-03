import { queryAll, queryGet } from "@/db/client";
import { getTelemetryTenantIdFromRequest } from "@/lib/telemetry-tenant";
import { NextResponse } from "next/server";

const WINDOWS_MS = [
  { id: "1h", ms: 60 * 60 * 1000 },
  { id: "6h", ms: 6 * 60 * 60 * 1000 },
  { id: "24h", ms: 24 * 60 * 60 * 1000 },
] as const;

/**
 * Multi-window **burn-rate style** signals from trace spans (availability proxy).
 * For each SLO target `targetSuccess`, compares observed error rate vs budget `(1 - target)`.
 */
export async function GET(req: Request) {
  const tenantId = getTelemetryTenantIdFromRequest(req);
  const serviceFilter = new URL(req.url).searchParams.get("service")?.trim();

  const targets = await queryAll<{
    service: string;
    product: string;
    market: string;
    environment: string;
    targetSuccess: number;
  }>(
    serviceFilter
      ? `SELECT service, product, market, environment, target_success AS targetSuccess
           FROM slo_targets WHERE service = ?`
      : `SELECT service, product, market, environment, target_success AS targetSuccess
           FROM slo_targets ORDER BY service, product, market, environment`,
    serviceFilter ? [serviceFilter] : [],
  );

  if (!targets.length) {
    return NextResponse.json({
      tenantId,
      services: [],
      note: "Define SLO targets via PUT /api/v1/slo/targets first.",
    });
  }

  const now = Date.now();
  const out: {
    service: string;
    product: string;
    market: string;
    environment: string;
    targetSuccess: number;
    windows: {
      id: string;
      windowMs: number;
      spanCount: number;
      errorCount: number;
      errorRate: number;
      budgetBadRate: number;
      burnMultiplier: number | null;
    }[];
  }[] = [];

  for (const t of targets) {
    const budgetBadRate = Math.max(1e-9, 1 - Number(t.targetSuccess));
    const windows: (typeof out)[0]["windows"] = [];

    for (const w of WINDOWS_MS) {
      const start = now - w.ms;
      const row = await queryGet<{
        spanCount: number;
        errorCount: number;
      }>(
        `
        SELECT
          COUNT(*) AS spanCount,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errorCount
        FROM trace_spans
        WHERE tenant_id = ? AND service = ?
          AND product = ? AND market = ? AND environment = ?
          AND start_ts >= ?
      `,
        [
          tenantId,
          t.service,
          t.product,
          t.market,
          t.environment,
          start,
        ],
      );
      const spanCount = Number(row?.spanCount ?? 0);
      const errorCount = Number(row?.errorCount ?? 0);
      const errorRate = spanCount > 0 ? errorCount / spanCount : 0;
      windows.push({
        id: w.id,
        windowMs: w.ms,
        spanCount,
        errorCount,
        errorRate,
        budgetBadRate,
        burnMultiplier:
          spanCount > 0 ? errorRate / budgetBadRate : null,
      });
    }

    out.push({
      service: t.service,
      product: t.product,
      market: t.market,
      environment: t.environment,
      targetSuccess: Number(t.targetSuccess),
      windows,
    });
  }

  return NextResponse.json({
    tenantId,
    computedAtMs: now,
    services: out,
  });
}
