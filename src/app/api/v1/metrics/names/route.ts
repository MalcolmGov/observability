import { queryAll } from "@/db/client";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const service = searchParams.get("service");

  if (!service) {
    return NextResponse.json({ error: "service is required" }, { status: 400 });
  }

  const rows = await queryAll<{ name: string }>(
    `
    SELECT DISTINCT name FROM metric_points
    WHERE service = ?
    ORDER BY name ASC
  `,
    [service],
  );
  const names = rows.map((r) => r.name);

  return NextResponse.json({ service, names });
}
