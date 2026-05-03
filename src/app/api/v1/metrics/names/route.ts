import { queryAll } from "@/db/client";
import { getTelemetryTenantIdFromRequest } from "@/lib/telemetry-tenant";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const tenantId = getTelemetryTenantIdFromRequest(req);
  const { searchParams } = new URL(req.url);
  const service = searchParams.get("service");

  if (!service) {
    return NextResponse.json({ error: "service is required" }, { status: 400 });
  }

  const rows = await queryAll<{ name: string }>(
    `
    SELECT DISTINCT name FROM metric_points
    WHERE tenant_id = ? AND service = ?
    ORDER BY name ASC
  `,
    [tenantId, service],
  );
  const names = rows.map((r) => r.name);

  return NextResponse.json({ service, names });
}
