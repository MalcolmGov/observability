import { NextResponse } from "next/server";

/** Allowed chars for market / product / env segments (collector-safe tokens). */
const SEGMENT_RE = /^[a-zA-Z0-9_.\-]{1,64}$/;

export type ScopeFilters = {
  /** When set, restricts rows to this `market` column. */
  market?: string;
  /** When set, restricts rows to this `product` column. */
  product?: string;
  /** When set, restricts rows to this `environment` column (`env` is accepted as alias). */
  environment?: string;
};

export type ParsedScope =
  | { ok: true; filters: ScopeFilters }
  | { ok: false; response: NextResponse };

function invalid(label: string): ParsedScope {
  return {
    ok: false,
    response: NextResponse.json(
      { error: `Invalid ${label} (use 1–64 chars: letters, digits, _, -, .)` },
      { status: 400 },
    ),
  };
}

/**
 * Parse `market`, `product`, `environment` / `env` from URL search params.
 * Omitted params → no filter for that dimension (all values).
 */
export function parseScopeFilters(searchParams: URLSearchParams): ParsedScope {
  const rawMarket = searchParams.get("market")?.trim();
  const rawProduct = searchParams.get("product")?.trim();
  const rawEnv =
    searchParams.get("environment")?.trim() ??
    searchParams.get("env")?.trim();

  const filters: ScopeFilters = {};

  if (rawMarket) {
    if (!SEGMENT_RE.test(rawMarket)) return invalid("market");
    filters.market = rawMarket;
  }
  if (rawProduct) {
    if (!SEGMENT_RE.test(rawProduct)) return invalid("product");
    filters.product = rawProduct;
  }
  if (rawEnv) {
    if (!SEGMENT_RE.test(rawEnv)) return invalid("environment");
    filters.environment = rawEnv;
  }

  return { ok: true, filters };
}

/** Raw equality fragments without leading AND (for dynamic WHERE arrays). */
export function scopeSqlFragments(filters: ScopeFilters): {
  fragments: string[];
  params: unknown[];
} {
  const fragments: string[] = [];
  const params: unknown[] = [];
  if (filters.market !== undefined) {
    fragments.push(`market = ?`);
    params.push(filters.market);
  }
  if (filters.product !== undefined) {
    fragments.push(`product = ?`);
    params.push(filters.product);
  }
  if (filters.environment !== undefined) {
    fragments.push(`environment = ?`);
    params.push(filters.environment);
  }
  return { fragments, params };
}

/** Append `AND ...` clauses after an existing WHERE block. */
export function appendScopeSql(
  filters: ScopeFilters,
): { sql: string; params: unknown[] } {
  const { fragments, params } = scopeSqlFragments(filters);
  if (fragments.length === 0) return { sql: "", params: [] };
  return {
    sql: ` AND ${fragments.join(" AND ")}`,
    params,
  };
}
