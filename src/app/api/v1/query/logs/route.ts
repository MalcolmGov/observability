import { executeLogsQuery } from "@/lib/logs-query";
import { LOG_ATTR_KEY_RE } from "@/lib/log-attr-filter";
import { parseScopeFilters } from "@/lib/scope-filters";
import { getTelemetryTenantIdFromRequest } from "@/lib/telemetry-tenant";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const tenantId = getTelemetryTenantIdFromRequest(req);
  const { searchParams } = new URL(req.url);
  const service = searchParams.get("service");
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 500);
  const q = searchParams.get("q")?.trim() ?? "";
  const levelFilter = searchParams.get("level")?.trim().toLowerCase() ?? "";

  if (!service) {
    return NextResponse.json({ error: "service is required" }, { status: 400 });
  }

  const traceId = searchParams.get("traceId")?.trim();
  const scopeParsed = parseScopeFilters(searchParams);
  if (!scopeParsed.ok) return scopeParsed.response;
  const { filters: scope } = scopeParsed;

  const startRaw = searchParams.get("start");
  const endRaw = searchParams.get("end");
  let startMs: number | undefined;
  let endMs: number | undefined;
  if (startRaw !== null && startRaw !== "") {
    const n = Number(startRaw);
    if (Number.isFinite(n)) startMs = n;
  }
  if (endRaw !== null && endRaw !== "") {
    const n = Number(endRaw);
    if (Number.isFinite(n)) endMs = n;
  }

  const attrKeyRaw = searchParams.get("attrKey")?.trim() ?? "";
  const attrValueRaw = searchParams.get("attrValue")?.trim() ?? "";
  if (attrKeyRaw && !LOG_ATTR_KEY_RE.test(attrKeyRaw)) {
    return NextResponse.json(
      { error: "Invalid attrKey (use letters, numbers, _, -, .)" },
      { status: 400 },
    );
  }

  try {
    const logs = await executeLogsQuery({
      tenantId,
      service,
      scope,
      limit,
      q,
      levelFilter,
      traceId: traceId || undefined,
      startMs,
      endMs,
      attrKey: attrKeyRaw || undefined,
      attrValue: attrValueRaw || undefined,
    });
    return NextResponse.json({ service, scope, logs });
  } catch (e) {
    if (e instanceof Error && e.message === "INVALID_ATTR_KEY") {
      return NextResponse.json(
        { error: "Invalid attrKey (use letters, numbers, _, -, .)" },
        { status: 400 },
      );
    }
    throw e;
  }
}
