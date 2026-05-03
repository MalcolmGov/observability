import { executeLogsQuery } from "@/lib/logs-query";
import { parseLogQlLite } from "@/lib/logql-lite";
import { parseScopeFilters } from "@/lib/scope-filters";
import { getTelemetryTenantIdFromRequest } from "@/lib/telemetry-tenant";
import { NextResponse } from "next/server";

/**
 * LogQL-compatible **subset**: `{service="x"}` with optional `|= "substring"` or `|~ "regex"`.
 */
export async function GET(req: Request) {
  const tenantId = getTelemetryTenantIdFromRequest(req);
  const { searchParams } = new URL(req.url);
  const qRaw = searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(Number(searchParams.get("limit")) || 100, 500);

  const parsed = parseLogQlLite(qRaw);
  if (!parsed) {
    return NextResponse.json(
      {
        error:
          'Invalid LogQL (supported: {service="x"} with optional |= "|~" )',
      },
      { status: 400 },
    );
  }

  const service = parsed.labels.service;
  if (!service) {
    return NextResponse.json(
      { error: 'LogQL stream selector must include service="{name}"' },
      { status: 400 },
    );
  }

  const extraKeys = Object.keys(parsed.labels).filter((k) => k !== "service");
  if (extraKeys.length > 0) {
    return NextResponse.json(
      {
        error:
          "Only the service label is supported in the stream selector for this subset.",
      },
      { status: 400 },
    );
  }

  const sqlQ = parsed.lineContains ?? "";

  const scopeParsed = parseScopeFilters(searchParams);
  if (!scopeParsed.ok) return scopeParsed.response;
  const { filters: scope } = scopeParsed;

  const logs = await executeLogsQuery({
    tenantId,
    service,
    scope,
    limit,
    q: sqlQ,
    levelFilter: "all",
  });

  let out = logs;
  if (parsed.lineRegex) {
    try {
      const re = new RegExp(parsed.lineRegex);
      out = logs.filter((l) => re.test(l.message));
    } catch {
      return NextResponse.json(
        { error: "Invalid regular expression in |~" },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({
    logql: qRaw,
    service,
    scope,
    logs: out,
  });
}
