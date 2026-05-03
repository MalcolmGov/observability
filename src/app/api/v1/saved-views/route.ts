import { queryAll, queryGet, queryRun } from "@/db/client";
import { getTelemetryTenantIdFromRequest } from "@/lib/telemetry-tenant";
import { isPostgres } from "@/lib/sql-dialect";
import { NextResponse } from "next/server";
import { z } from "zod";

const postSchema = z.object({
  page: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  state: z.record(z.string(), z.any()),
});

/** Per-tenant saved UI states (logs filters, etc.). */
export async function GET(req: Request) {
  const tenantId = getTelemetryTenantIdFromRequest(req);
  const page = new URL(req.url).searchParams.get("page")?.trim();
  if (!page) {
    return NextResponse.json({ error: "page query param required" }, { status: 400 });
  }

  const rows = await queryAll<{
    id: number;
    name: string;
    stateJson: string;
    updatedAt: number;
  }>(
    `
    SELECT id, name, state_json AS stateJson, updated_at AS updatedAt
    FROM saved_views
    WHERE tenant_id = ? AND page = ?
    ORDER BY updated_at DESC, name ASC
  `,
    [tenantId, page],
  );

  return NextResponse.json({
    views: rows.map((r) => ({
      id: r.id,
      name: r.name,
      updatedAtMs: Number(r.updatedAt),
      state: JSON.parse(r.stateJson || "{}") as Record<string, unknown>,
    })),
  });
}

export async function POST(req: Request) {
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
  const { page, name, state } = parsed.data;
  const stateJson = JSON.stringify(state);
  const now = Date.now();

  if (isPostgres()) {
    const row = await queryGet<{ id: number }>(
      `
      INSERT INTO saved_views (tenant_id, page, name, state_json, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (tenant_id, page, name) DO UPDATE SET
        state_json = EXCLUDED.state_json,
        updated_at = EXCLUDED.updated_at
      RETURNING id
    `,
      [tenantId, page, name, stateJson, now],
    );
    return NextResponse.json({
      id: row?.id,
      page,
      name,
      updatedAtMs: now,
    });
  }

  await queryRun(
    `
    INSERT INTO saved_views (tenant_id, page, name, state_json, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id, page, name) DO UPDATE SET
      state_json = excluded.state_json,
      updated_at = excluded.updated_at
  `,
    [tenantId, page, name, stateJson, now],
  );

  const row = await queryGet<{ id: number }>(
    `
    SELECT id FROM saved_views
    WHERE tenant_id = ? AND page = ? AND name = ?
  `,
    [tenantId, page, name],
  );

  return NextResponse.json({
    id: row?.id,
    page,
    name,
    updatedAtMs: now,
  });
}
