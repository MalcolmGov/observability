import { queryAll, queryGet, queryRun } from "@/db/client";
import { getPgPool } from "@/db/pg-pool";
import { isPostgres } from "@/lib/sql-dialect";
import {
  CHANNEL_TYPES,
  SCOPE_TYPES,
  SEVERITIES,
  type ChannelType,
  type ScopeType,
  type Severity,
} from "@/lib/alert-routing-resolver";
import { NextResponse } from "next/server";
import { z } from "zod";

const scopeEnum = z.enum(SCOPE_TYPES);
const channelEnum = z.enum(CHANNEL_TYPES);
const severityEnum = z.enum(SEVERITIES);

/** PUT body — idempotent upsert keyed on (scope_type, scope_value, channel_type). */
const upsertSchema = z.object({
  scope_type: scopeEnum,
  scope_value: z.string().trim().min(1).optional().nullable(),
  channel_type: channelEnum,
  channel_value: z.string().trim().min(1),
  severity_min: severityEnum.optional().default("warning"),
  enabled: z.boolean().optional().default(true),
});

type RouteRowDb = {
  id: number;
  scope_type: string;
  scope_value: string | null;
  channel_type: string;
  channel_value: string;
  severity_min: string;
  enabled: number | boolean;
  created_at: number;
  updated_at: number;
};

function rowToWire(r: RouteRowDb) {
  return {
    id: r.id,
    scopeType: r.scope_type as ScopeType,
    scopeValue: r.scope_value,
    channelType: r.channel_type as ChannelType,
    channelValue: r.channel_value,
    severityMin: r.severity_min as Severity,
    enabled: Boolean(r.enabled),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const scopeFilter = url.searchParams.get("scope_type")?.trim();
  const filters: string[] = [];
  const params: unknown[] = [];
  if (scopeFilter && (SCOPE_TYPES as readonly string[]).includes(scopeFilter)) {
    filters.push(`scope_type = ?`);
    params.push(scopeFilter);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const rows = await queryAll<RouteRowDb>(
    `SELECT id, scope_type, scope_value, channel_type, channel_value,
            severity_min, enabled, created_at, updated_at
     FROM alert_routes
     ${where}
     ORDER BY scope_type, scope_value NULLS FIRST, channel_type`,
    params,
  );
  return NextResponse.json({ routes: rows.map(rowToWire) });
}

export async function PUT(req: Request) {
  const json = (await req.json().catch(() => ({}))) as unknown;
  const parsed = upsertSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const body = parsed.data;

  // 'default' scope must have NULL scope_value; other scopes must have one.
  const scopeValue =
    body.scope_type === "default" ? null : (body.scope_value ?? null);
  if (body.scope_type !== "default" && !scopeValue) {
    return NextResponse.json(
      { error: "scope_value required for scope_type 'market' or 'team'" },
      { status: 400 },
    );
  }

  const now = Date.now();
  const enabled = body.enabled ? 1 : 0;

  if (isPostgres()) {
    const pool = await getPgPool();
    // Two upsert variants because the unique indexes are partial (NULL vs not).
    const conflictTarget =
      scopeValue === null
        ? `(scope_type, channel_type) WHERE scope_value IS NULL`
        : `(scope_type, scope_value, channel_type) WHERE scope_value IS NOT NULL`;
    const result = await pool.query<RouteRowDb>(
      `
      INSERT INTO alert_routes (
        scope_type, scope_value, channel_type, channel_value,
        severity_min, enabled, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6::boolean, $7, $7)
      ON CONFLICT ${conflictTarget} DO UPDATE SET
        channel_value = EXCLUDED.channel_value,
        severity_min  = EXCLUDED.severity_min,
        enabled       = EXCLUDED.enabled,
        updated_at    = EXCLUDED.updated_at
      RETURNING id, scope_type, scope_value, channel_type, channel_value,
                severity_min, enabled, created_at, updated_at
      `,
      [
        body.scope_type,
        scopeValue,
        body.channel_type,
        body.channel_value,
        body.severity_min,
        Boolean(body.enabled),
        now,
      ],
    );
    return NextResponse.json({ route: rowToWire(result.rows[0]!) });
  }

  // SQLite: emulate upsert. Try update first, fallback insert.
  if (scopeValue === null) {
    const existing = await queryGet<{ id: number }>(
      `SELECT id FROM alert_routes
       WHERE scope_type = ? AND scope_value IS NULL AND channel_type = ?`,
      [body.scope_type, body.channel_type],
    );
    if (existing) {
      await queryRun(
        `UPDATE alert_routes
         SET channel_value = ?, severity_min = ?, enabled = ?, updated_at = ?
         WHERE id = ?`,
        [body.channel_value, body.severity_min, enabled, now, existing.id],
      );
    } else {
      await queryRun(
        `INSERT INTO alert_routes
           (scope_type, scope_value, channel_type, channel_value,
            severity_min, enabled, created_at, updated_at)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`,
        [
          body.scope_type,
          body.channel_type,
          body.channel_value,
          body.severity_min,
          enabled,
          now,
          now,
        ],
      );
    }
  } else {
    const existing = await queryGet<{ id: number }>(
      `SELECT id FROM alert_routes
       WHERE scope_type = ? AND scope_value = ? AND channel_type = ?`,
      [body.scope_type, scopeValue, body.channel_type],
    );
    if (existing) {
      await queryRun(
        `UPDATE alert_routes
         SET channel_value = ?, severity_min = ?, enabled = ?, updated_at = ?
         WHERE id = ?`,
        [body.channel_value, body.severity_min, enabled, now, existing.id],
      );
    } else {
      await queryRun(
        `INSERT INTO alert_routes
           (scope_type, scope_value, channel_type, channel_value,
            severity_min, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          body.scope_type,
          scopeValue,
          body.channel_type,
          body.channel_value,
          body.severity_min,
          enabled,
          now,
          now,
        ],
      );
    }
  }

  const fresh = await queryGet<RouteRowDb>(
    `SELECT id, scope_type, scope_value, channel_type, channel_value,
            severity_min, enabled, created_at, updated_at
     FROM alert_routes
     WHERE scope_type = ? AND ${scopeValue === null ? "scope_value IS NULL" : "scope_value = ?"} AND channel_type = ?`,
    scopeValue === null
      ? [body.scope_type, body.channel_type]
      : [body.scope_type, scopeValue, body.channel_type],
  );

  return NextResponse.json({ route: fresh ? rowToWire(fresh) : null });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const idParam = url.searchParams.get("id");
  const id = idParam ? Number(idParam) : NaN;
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  await queryRun(`DELETE FROM alert_routes WHERE id = ?`, [id]);
  return NextResponse.json({ ok: true });
}
