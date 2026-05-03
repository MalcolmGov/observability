import { queryGet, queryRun } from "@/db/client";
import { getTelemetryTenantIdFromRequest } from "@/lib/telemetry-tenant";
import { NextResponse } from "next/server";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  state: z.record(z.string(), z.any()).optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  const tenantId = getTelemetryTenantIdFromRequest(req);
  const { id: idRaw } = await params;
  const id = Number(idRaw);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const owner = await queryGet<{ one: number }>(
    `SELECT 1 AS one FROM saved_views WHERE id = ? AND tenant_id = ?`,
    [id, tenantId],
  );
  if (!owner) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const now = Date.now();
  if (parsed.data.state !== undefined) {
    await queryRun(
      `UPDATE saved_views SET state_json = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`,
      [JSON.stringify(parsed.data.state), now, id, tenantId],
    );
  }
  if (parsed.data.name !== undefined) {
    await queryRun(
      `UPDATE saved_views SET name = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`,
      [parsed.data.name, now, id, tenantId],
    );
  }

  return NextResponse.json({ ok: true, id, updatedAtMs: now });
}

export async function DELETE(req: Request, { params }: Params) {
  const tenantId = getTelemetryTenantIdFromRequest(req);
  const { id: idRaw } = await params;
  const id = Number(idRaw);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const n = await queryRun(
    `DELETE FROM saved_views WHERE id = ? AND tenant_id = ?`,
    [id, tenantId],
  );
  if (!n) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id });
}
