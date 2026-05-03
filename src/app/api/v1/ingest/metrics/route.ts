import { insertMetricPoints } from "@/db/client";
import { requireIngestAuth } from "@/lib/ingest-auth";
import { serviceFromLabels } from "@/lib/service";
import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  metrics: z.array(
    z.object({
      name: z.string().min(1),
      value: z.number().finite(),
      timestamp: z.number().int().positive().optional(),
      labels: z.record(z.string(), z.string()).optional(),
    }),
  ),
});

export async function POST(req: Request) {
  const unauthorized = requireIngestAuth(req);
  if (unauthorized) return unauthorized;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const now = Date.now();
  const rows = parsed.data.metrics.map((m) => {
    const labels = m.labels ?? {};
    const service = serviceFromLabels(labels);
    return {
      ts: m.timestamp ?? now,
      name: m.name,
      value: m.value,
      service,
      labelsJson: JSON.stringify(labels),
    };
  });

  if (rows.length === 0) {
    return NextResponse.json({ accepted: 0 });
  }

  await insertMetricPoints(rows);

  return NextResponse.json({ accepted: rows.length });
}
