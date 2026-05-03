import { queryAll, queryGet, queryRun } from "@/db/client";
import { NextResponse } from "next/server";
import { z } from "zod";

const putSchema = z.object({
  service: z.string().min(1).max(128),
  targetSuccess: z.number().min(0.9).max(0.99999),
});

/** List persisted SLO availability targets per service (server-side). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const service = searchParams.get("service")?.trim();

  if (service) {
    const row = await queryGet<{
      service: string;
      targetSuccess: number;
      updatedAt: number;
    }>(
      `SELECT service, target_success AS targetSuccess, updated_at AS updatedAt
         FROM slo_targets WHERE service = ?`,
      [service],
    );
    return NextResponse.json({
      service,
      targetSuccess: row?.targetSuccess ?? null,
      updatedAtMs: row?.updatedAt ?? null,
    });
  }

  const rows = await queryAll<{
    service: string;
    targetSuccess: number;
    updatedAt: number;
  }>(
    `SELECT service, target_success AS targetSuccess, updated_at AS updatedAt
       FROM slo_targets ORDER BY service ASC`,
    [],
  );

  return NextResponse.json({
    targets: rows.map((r) => ({
      service: r.service,
      targetSuccess: r.targetSuccess,
      updatedAtMs: r.updatedAt,
    })),
  });
}

export async function PUT(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = putSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const { service, targetSuccess } = parsed.data;
  const now = Date.now();
  await queryRun(
    `INSERT INTO slo_targets (service, target_success, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (service) DO UPDATE SET
         target_success = excluded.target_success,
         updated_at = excluded.updated_at`,
    [service, targetSuccess, now],
  );

  return NextResponse.json({
    service,
    targetSuccess,
    updatedAtMs: now,
  });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const service = searchParams.get("service")?.trim();
  if (!service) {
    return NextResponse.json({ error: "service is required" }, { status: 400 });
  }
  await queryRun(`DELETE FROM slo_targets WHERE service = ?`, [service]);
  return NextResponse.json({ ok: true, service });
}
