import { queryGet, queryRun } from "@/db/client";
import { isPostgres } from "@/lib/sql-dialect";
import { NextResponse } from "next/server";
import { z } from "zod";

type CatalogRow = {
  id: number;
  service_name: string;
  display_name: string | null;
  product: string;
  scope: string;
  markets_active: unknown;
  tier: number;
  owner_team: string | null;
  oncall_slack: string | null;
  oncall_pd_key: string | null;
  repo_url: string | null;
  runbook_url: string | null;
  tags: unknown;
  created_at: number;
  updated_at: number;
  enabled: number;
};

function parseMarkets(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === "string");
  }
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw) as unknown;
      return Array.isArray(p)
        ? p.filter((x): x is string => typeof x === "string")
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseTags(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw) as unknown;
      if (p && typeof p === "object" && !Array.isArray(p)) {
        return p as Record<string, unknown>;
      }
    } catch {
      /* ignore */
    }
  }
  return {};
}

function mapRow(r: CatalogRow) {
  return {
    id: r.id,
    serviceName: r.service_name,
    displayName: r.display_name ?? null,
    product: r.product,
    scope: r.scope,
    marketsActive: parseMarkets(r.markets_active),
    tier: Number(r.tier),
    ownerTeam: r.owner_team ?? null,
    oncallSlack: r.oncall_slack ?? null,
    oncallPdKey: r.oncall_pd_key ?? null,
    repoUrl: r.repo_url ?? null,
    runbookUrl: r.runbook_url ?? null,
    tags: parseTags(r.tags),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
    enabled: Boolean(r.enabled),
  };
}

const urlOrEmpty = z.union([z.string().url(), z.literal("")]);

const patchSchema = z
  .object({
    display_name: z.string().max(256).nullable().optional(),
    owner_team: z.string().max(128).nullable().optional(),
    oncall_slack: z.string().max(256).nullable().optional(),
    oncall_pd_key: z.string().max(128).nullable().optional(),
    repo_url: urlOrEmpty.optional().nullable(),
    runbook_url: urlOrEmpty.optional().nullable(),
    tags: z.record(z.string(), z.unknown()).optional(),
    tier: z.number().int().min(1).max(5).optional(),
  })
  .strict();

async function loadRow(serviceName: string): Promise<CatalogRow | undefined> {
  return queryGet<CatalogRow>(
    `SELECT id, service_name, display_name, product, scope, markets_active, tier,
            owner_team, oncall_slack, oncall_pd_key, repo_url, runbook_url, tags,
            created_at, updated_at, enabled
     FROM service_catalog WHERE service_name = ?`,
    [serviceName],
  );
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ serviceName: string }> },
) {
  const { serviceName: encoded } = await ctx.params;
  const serviceName = decodeURIComponent(encoded);
  const row = await loadRow(serviceName);
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(mapRow(row));
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ serviceName: string }> },
) {
  const { serviceName: encoded } = await ctx.params;
  const serviceName = decodeURIComponent(encoded);

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

  const existing = await loadRow(serviceName);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const p = parsed.data;
  const assignments: string[] = [];
  const params: unknown[] = [];

  if ("display_name" in p) {
    assignments.push(`display_name = ?`);
    params.push(p.display_name ?? null);
  }
  if ("owner_team" in p) {
    assignments.push(`owner_team = ?`);
    params.push(p.owner_team ?? null);
  }
  if ("oncall_slack" in p) {
    assignments.push(`oncall_slack = ?`);
    params.push(p.oncall_slack ?? null);
  }
  if ("oncall_pd_key" in p) {
    assignments.push(`oncall_pd_key = ?`);
    params.push(p.oncall_pd_key ?? null);
  }
  if ("repo_url" in p) {
    assignments.push(`repo_url = ?`);
    const v = p.repo_url;
    params.push(v && v.length > 0 ? v : null);
  }
  if ("runbook_url" in p) {
    assignments.push(`runbook_url = ?`);
    const v = p.runbook_url;
    params.push(v && v.length > 0 ? v : null);
  }
  if ("tags" in p && p.tags !== undefined) {
    assignments.push(isPostgres() ? `tags = ?::jsonb` : `tags = ?`);
    params.push(JSON.stringify(p.tags));
  }
  if ("tier" in p && p.tier !== undefined) {
    assignments.push(`tier = ?`);
    params.push(p.tier);
  }

  if (assignments.length === 0) {
    return NextResponse.json(mapRow(existing));
  }

  const now = Date.now();
  assignments.push(`updated_at = ?`);
  params.push(now);
  params.push(serviceName);

  const n = await queryRun(
    `UPDATE service_catalog SET ${assignments.join(", ")} WHERE service_name = ?`,
    params,
  );
  if (n === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const row = await loadRow(serviceName);
  return NextResponse.json(row ? mapRow(row) : mapRow(existing));
}

/** Soft-delete: sets `enabled = 0`. Services are created via trace auto-discovery, not POST. */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ serviceName: string }> },
) {
  const { serviceName: encoded } = await ctx.params;
  const serviceName = decodeURIComponent(encoded);
  const now = Date.now();
  const n = await queryRun(
    `UPDATE service_catalog SET enabled = 0, updated_at = ? WHERE service_name = ? AND enabled = 1`,
    [now, serviceName],
  );
  if (n === 0) {
    const row = await loadRow(serviceName);
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      serviceName,
      enabled: false,
      alreadyDisabled: true,
    });
  }
  return NextResponse.json({ serviceName, enabled: false });
}
