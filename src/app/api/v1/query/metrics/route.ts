import { queryAll } from "@/db/client";
import { NextResponse } from "next/server";

type BucketRow = { bucket: number; avg_value: number };

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name");
  const service = searchParams.get("service");
  const start = Number(searchParams.get("start"));
  const end = Number(searchParams.get("end"));
  const bucketMs = Number(searchParams.get("bucketMs")) || 60_000;

  if (!name || !service || !Number.isFinite(start) || !Number.isFinite(end)) {
    return NextResponse.json(
      {
        error:
          "Missing or invalid query params: name, service, start, end (unix ms)",
      },
      { status: 400 },
    );
  }

  if (end <= start) {
    return NextResponse.json(
      { error: "end must be greater than start" },
      { status: 400 },
    );
  }

  const rows = await queryAll<BucketRow>(
    `
    SELECT
      (ts / ?) * ? AS bucket,
      AVG(value) AS avg_value
    FROM metric_points
    WHERE name = ? AND service = ? AND ts >= ? AND ts <= ?
    GROUP BY 1
    ORDER BY 1
  `,
    [bucketMs, bucketMs, name, service, start, end],
  );

  const series = rows.map((r) => ({
    t: Number(r.bucket),
    value: Number(r.avg_value),
  }));

  return NextResponse.json({
    name,
    service,
    start,
    end,
    bucketMs,
    series,
  });
}
