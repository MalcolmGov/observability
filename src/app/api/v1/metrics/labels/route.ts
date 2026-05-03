import { queryAll } from "@/db/client";
import { getTelemetryTenantIdFromRequest } from "@/lib/telemetry-tenant";
import { NextResponse } from "next/server";

/** Sample recent points and return union of label keys + example values. */
export async function GET(req: Request) {
  const tenantId = getTelemetryTenantIdFromRequest(req);
  const { searchParams } = new URL(req.url);
  const service = searchParams.get("service");
  const name = searchParams.get("name");
  const sample = Math.min(Number(searchParams.get("sample")) || 200, 2000);

  if (!service || !name) {
    return NextResponse.json(
      { error: "service and name are required" },
      { status: 400 },
    );
  }

  const rows = await queryAll<{ labelsJson: string }>(
    `
      SELECT labels_json AS labelsJson
      FROM metric_points
      WHERE tenant_id = ? AND service = ? AND name = ?
      ORDER BY ts DESC
      LIMIT ?
    `,
    [tenantId, service, name, sample],
  );

  const keyValues = new Map<string, Set<string>>();

  for (const r of rows) {
    try {
      const obj = JSON.parse(r.labelsJson || "{}") as Record<string, unknown>;
      for (const [k, v] of Object.entries(obj)) {
        if (!keyValues.has(k)) keyValues.set(k, new Set());
        const s =
          typeof v === "string" ? v : v == null ? "" : JSON.stringify(v);
        if (s.length > 0 && s.length < 120) keyValues.get(k)!.add(s);
      }
    } catch {
      /* skip bad json */
    }
  }

  const labels = [...keyValues.entries()].map(([key, vals]) => ({
    key,
    cardinality: vals.size,
    examples: [...vals].slice(0, 8),
  }));

  labels.sort(
    (a, b) => b.cardinality - a.cardinality || a.key.localeCompare(b.key),
  );

  return NextResponse.json({
    service,
    name,
    sampleSize: rows.length,
    labels,
  });
}
