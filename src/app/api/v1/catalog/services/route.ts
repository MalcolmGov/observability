import { queryAll } from "@/db/client";
import { isPostgres } from "@/lib/sql-dialect";
import { parseScopeFilters } from "@/lib/scope-filters";
import { NextResponse } from "next/server";

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

const CATALOG_SCOPE = new Set(["shared", "market_local"]);

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

/**
 * List curated / auto-discovered services from `service_catalog`.
 * Query: `product`, `market` (member of `markets_active`), `scope` (`shared` | `market_local`).
 * Rows with `enabled = 0` are omitted (soft-deleted).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = parseScopeFilters(searchParams);
  if (!parsed.ok) return parsed.response;

  const rawScope = searchParams.get("scope")?.trim();
  if (rawScope && !CATALOG_SCOPE.has(rawScope)) {
    return NextResponse.json(
      { error: "Invalid scope (use shared or market_local)" },
      { status: 400 },
    );
  }

  const product = parsed.filters.product;
  const market = parsed.filters.market;

  let sql = `SELECT id, service_name, display_name, product, scope, markets_active, tier,
       owner_team, oncall_slack, oncall_pd_key, repo_url, runbook_url, tags,
       created_at, updated_at, enabled
     FROM service_catalog WHERE enabled = 1`;
  const params: unknown[] = [];

  if (product !== undefined) {
    sql += ` AND product = ?`;
    params.push(product);
  }
  if (rawScope) {
    sql += ` AND scope = ?`;
    params.push(rawScope);
  }
  if (market !== undefined) {
    if (isPostgres()) {
      sql += ` AND ?::text = ANY(markets_active)`;
    } else {
      sql += ` AND EXISTS (
        SELECT 1 FROM json_each(service_catalog.markets_active)
        WHERE json_each.value = ?
      )`;
    }
    params.push(market);
  }

  sql += ` ORDER BY service_name ASC`;

  const rows = await queryAll<CatalogRow>(sql, params);
  return NextResponse.json({
    services: rows.map(mapRow),
  });
}
