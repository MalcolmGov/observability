import "server-only";

import { queryAll } from "@/db/client";
import { isPostgres } from "@/lib/sql-dialect";

/** Severity tiers — ordered. Higher index = more urgent. */
export const SEVERITIES = ["info", "warning", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const CHANNEL_TYPES = [
  "slack",
  "pagerduty",
  "webhook",
  "email",
] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const SCOPE_TYPES = ["market", "team", "default"] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];

export type AlertRoute = {
  id: number;
  scopeType: ScopeType;
  scopeValue: string | null;
  channelType: ChannelType;
  channelValue: string;
  severityMin: Severity;
  enabled: boolean;
};

export type BreachContext = {
  ruleId: number;
  ruleName: string;
  serviceName: string;
  /** From service_catalog.owner_team — drives team-scope routes. */
  ownerTeam: string | null;
  /** Rule's declared severity. */
  severity: Severity;
  /** Markets where the threshold was actually breached this evaluation. */
  breachedMarkets: string[];
};

export type RouteTarget = {
  channelType: ChannelType;
  channelValue: string;
  /** "market:NG" / "team:platform" / "default" — for evaluator logging. */
  reason: string;
  /** Source route id (null for synthetic / default fallbacks). */
  routeId: number | null;
};

/** Wide-blast threshold per severity — critical escalates faster.
 *  When the breach affects >= these many markets, ALSO page the owner team. */
const WIDE_BLAST_BY_SEVERITY: Record<Severity, number> = {
  info: 4,
  warning: 3,
  critical: 2,
};

function severityRank(s: Severity): number {
  return SEVERITIES.indexOf(s);
}

/** Filter routes by enabled + severity_min satisfied by the rule's severity. */
function eligible(routes: AlertRoute[], ruleSeverity: Severity): AlertRoute[] {
  const ruleRank = severityRank(ruleSeverity);
  return routes.filter(
    (r) => r.enabled && severityRank(r.severityMin) <= ruleRank,
  );
}

/** Deterministic dedupe by (channelType, channelValue) — keeps the first hit
 *  so per-market routes win over team / default for the same channel. */
function dedupe(targets: RouteTarget[]): RouteTarget[] {
  const seen = new Set<string>();
  const out: RouteTarget[] = [];
  for (const t of targets) {
    const key = `${t.channelType}::${t.channelValue}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/**
 * Resolve fan-out targets for a fired alert.
 *
 * Order of precedence (de-dupe by channel value):
 *   1. Per-breached-market routes (`scope_type = market`).
 *   2. Owner-team routes (`scope_type = team`) — only when:
 *        a) breach is "wide" (>= WIDE_BLAST_BY_SEVERITY[severity] markets), OR
 *        b) severity is "critical" (always escalates), OR
 *        c) no per-market route resolved any target.
 *   3. Default routes (`scope_type = default`) — fallback only when steps 1+2
 *      produced nothing.
 *
 * Channels are filtered by `severity_min <= rule.severity` (so a slack route
 * with `severity_min = critical` will not fire on a warning rule).
 */
export function resolveRouteTargets(
  ctx: BreachContext,
  allRoutes: AlertRoute[],
): RouteTarget[] {
  const live = eligible(allRoutes, ctx.severity);
  const byScope = (type: ScopeType) =>
    live.filter((r) => r.scopeType === type);

  const marketRoutes = byScope("market");
  const teamRoutes = byScope("team");
  const defaultRoutes = byScope("default");

  // Step 1: per-breached-market routes.
  const marketTargets: RouteTarget[] = [];
  for (const market of ctx.breachedMarkets) {
    const matches = marketRoutes.filter((r) => r.scopeValue === market);
    for (const m of matches) {
      marketTargets.push({
        channelType: m.channelType,
        channelValue: m.channelValue,
        reason: `market:${market}`,
        routeId: m.id,
      });
    }
  }

  // Step 2: team routes — wide blast OR critical severity OR no market routes hit.
  const wideBlast = ctx.breachedMarkets.length >= WIDE_BLAST_BY_SEVERITY[ctx.severity];
  const isCritical = ctx.severity === "critical";
  const noMarketHit = marketTargets.length === 0;
  const useTeam = ctx.ownerTeam && (wideBlast || isCritical || noMarketHit);

  const teamTargets: RouteTarget[] = [];
  if (useTeam && ctx.ownerTeam) {
    const matches = teamRoutes.filter((r) => r.scopeValue === ctx.ownerTeam);
    for (const t of matches) {
      teamTargets.push({
        channelType: t.channelType,
        channelValue: t.channelValue,
        reason: `team:${ctx.ownerTeam}`,
        routeId: t.id,
      });
    }
  }

  // Step 3: default fallback only if 1+2 are empty.
  const collected = [...marketTargets, ...teamTargets];
  if (collected.length === 0) {
    for (const d of defaultRoutes) {
      collected.push({
        channelType: d.channelType,
        channelValue: d.channelValue,
        reason: "default",
        routeId: d.id,
      });
    }
  }

  return dedupe(collected);
}

type RouteRowDb = {
  id: number;
  scope_type: string;
  scope_value: string | null;
  channel_type: string;
  channel_value: string;
  severity_min: string;
  enabled: number | boolean;
};

function isSeverity(s: string): s is Severity {
  return (SEVERITIES as readonly string[]).includes(s);
}
function isChannel(s: string): s is ChannelType {
  return (CHANNEL_TYPES as readonly string[]).includes(s);
}
function isScope(s: string): s is ScopeType {
  return (SCOPE_TYPES as readonly string[]).includes(s);
}

/** Load all enabled routes for a tenant. Routes are global (not tenant-scoped)
 *  in v1 — keep simple, refactor when multi-tenant routing is needed. */
export async function loadAllRoutes(): Promise<AlertRoute[]> {
  const rows = await queryAll<RouteRowDb>(
    `SELECT id, scope_type, scope_value, channel_type, channel_value,
            severity_min, enabled
     FROM alert_routes
     WHERE enabled = ${isPostgres() ? "TRUE" : "1"}`,
    [],
  );
  return rows
    .filter(
      (r) =>
        isScope(r.scope_type) &&
        isChannel(r.channel_type) &&
        isSeverity(r.severity_min),
    )
    .map<AlertRoute>((r) => ({
      id: r.id,
      scopeType: r.scope_type as ScopeType,
      scopeValue: r.scope_value,
      channelType: r.channel_type as ChannelType,
      channelValue: r.channel_value,
      severityMin: r.severity_min as Severity,
      enabled: Boolean(r.enabled),
    }));
}
