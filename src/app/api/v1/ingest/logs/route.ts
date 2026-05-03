import { insertLogEntries } from "@/db/client";
import { requireIngestAuth } from "@/lib/ingest-auth";
import { serviceFromLog } from "@/lib/service";
import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  logs: z.array(
    z.object({
      level: z.string().min(1),
      message: z.string().min(1),
      timestamp: z.number().int().positive().optional(),
      service: z.string().optional(),
      attributes: z.record(z.string(), z.unknown()).optional(),
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
  const rows = parsed.data.logs.map((l) => {
    const attrs = l.attributes ?? {};
    const service = serviceFromLog(l.service, attrs);
    return {
      ts: l.timestamp ?? now,
      level: l.level.toLowerCase(),
      message: l.message,
      service,
      attributesJson: JSON.stringify(attrs),
    };
  });

  if (rows.length === 0) {
    return NextResponse.json({ accepted: 0 });
  }

  await insertLogEntries(rows);

  return NextResponse.json({ accepted: rows.length });
}
