import { queryAll } from "@/db/client";
import { NextResponse } from "next/server";

export async function GET() {
  const rows = await queryAll<{ service: string }>(
    `
    SELECT DISTINCT service FROM metric_points
    UNION
    SELECT DISTINCT service FROM log_entries
    UNION
    SELECT DISTINCT service FROM trace_spans
    ORDER BY service ASC
  `,
    [],
  );
  const services = rows.map((r) => r.service).filter(Boolean);

  return NextResponse.json({ services });
}
