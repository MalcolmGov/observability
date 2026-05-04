import { queryAll, queryRun } from "@/db/client";
import { getTelemetryTenantIdFromRequest } from "@/lib/telemetry-tenant";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";

const postSchema = z.object({
  ruleId: z.union([z.number().int().positive(), z.null()]).optional(),
  durationMinutes: z.number().int().min(5).max(24 * 60).optional(),
  endsAtMs: z.number().int().positive().optional(),
  reason: z.string().max(500).optional(),
});

/** Temporary suppression of notifications (per rule or all rules for tenant). */
export async function GET(req: Request) {
  const tenantId = getTelemetryTenantIdFromRequest(req);
  const now = Date.now();
  const includeExpired =
    new URL(req.url).searchParams.get("includeExpired") === "1";

  const rows = await queryAll<{
    id: number;
    ruleId: number | null;
    endsAtMs: number;
    reason: string | null;
    createdAtMs: number;
  }>(
    includeExpired
      ? `
      SELECT id, rule_id AS ruleId, ends_at_ms AS endsAtMs, reason, created_at_ms AS createdAtMs
      FROM alert_silences
      WHERE tenant_id = ?
      ORDER BY ends_at_ms DESC
      LIMIT 200
    `
      : `
      SELECT id, rule_id AS ruleId, ends_at_ms AS endsAtMs, reason, created_at_ms AS createdAtMs
      FROM alert_silences
      WHERE tenant_id = ? AND ends_at_ms > ?
      ORDER BY ends_at_ms ASC
    `,
    includeExpired ? [tenantId] : [tenantId, now],
  );

  return NextResponse.json({ silences: rows });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (user.role === "viewer") {
    return NextResponse.json({ error: "Viewers cannot silence alerts." }, { status: 403 });
  }

  const tenantId = getTelemetryTenantIdFromRequest(req);
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const now = Date.now();
  let endsAt = parsed.data.endsAtMs;
  if (endsAt == null) {
    const mins = parsed.data.durationMinutes ?? 60;
    endsAt = now + mins * 60 * 1000;
  }
  if (endsAt <= now) {
    return NextResponse.json(
      { error: "endsAtMs must be in the future" },
      { status: 400 },
    );
  }

  const ruleId =
    parsed.data.ruleId === undefined ? null : parsed.data.ruleId;

  await queryRun(
    `
    INSERT INTO alert_silences (tenant_id, rule_id, ends_at_ms, reason, created_at_ms)
    VALUES (?, ?, ?, ?, ?)
  `,
    [
      tenantId,
      ruleId,
      endsAt,
      parsed.data.reason?.trim() || null,
      now,
    ],
  );

  return NextResponse.json({
    ok: true,
    ruleId,
    endsAtMs: endsAt,
    createdAtMs: now,
  });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (user.role === "viewer") {
    return NextResponse.json({ error: "Viewers cannot delete silences." }, { status: 403 });
  }

  const tenantId = getTelemetryTenantIdFromRequest(req);
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "id query required" }, { status: 400 });
  }

  const n = await queryRun(
    `DELETE FROM alert_silences WHERE id = ? AND tenant_id = ?`,
    [id, tenantId],
  );
  if (!n) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id });
}
