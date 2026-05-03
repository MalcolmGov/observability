import { insertMetricPoints } from "@/db/client";
import { requireIngestAuth } from "@/lib/ingest-auth";
import { parsePrometheusText } from "@/lib/prometheus-text";
import { NextResponse } from "next/server";

/**
 * Accepts Prometheus / OpenMetrics text exposition (scrape format).
 * Optional: ?service=my-app adds a default `service` label when missing.
 */
export async function POST(req: Request) {
  const unauthorized = requireIngestAuth(req);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(req.url);
  const defaultSvc = searchParams.get("service")?.trim();
  const defaultLabels: Record<string, string> = defaultSvc
    ? { service: defaultSvc }
    : {};

  const text = await req.text();
  if (!text.trim()) {
    return NextResponse.json({ accepted: 0 });
  }

  const parsed = parsePrometheusText(text, defaultLabels);
  if (parsed.length === 0) {
    return NextResponse.json({ accepted: 0 });
  }

  const rows = parsed.map((m) => ({
    ts: m.timestamp,
    name: m.name,
    value: m.value,
    service: m.service,
    labelsJson: JSON.stringify(m.labels),
  }));

  await insertMetricPoints(rows);

  return NextResponse.json({ accepted: rows.length });
}
