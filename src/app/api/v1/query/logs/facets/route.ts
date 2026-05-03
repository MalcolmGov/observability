import { queryAll, queryGet } from "@/db/client";
import {
  appendLogAttributeExistsClause,
  LOG_ATTR_KEY_RE,
} from "@/lib/log-attr-filter";
import { getTelemetryTenantIdFromRequest } from "@/lib/telemetry-tenant";
import { isPostgres } from "@/lib/sql-dialect";
import { NextResponse } from "next/server";

/** Facet counts for log explorer (same filter dimensions as /query/logs except level). */
export async function GET(req: Request) {
  const tenantId = getTelemetryTenantIdFromRequest(req);
  const { searchParams } = new URL(req.url);
  const service = searchParams.get("service");
  const q = searchParams.get("q")?.trim() ?? "";
  const traceId = searchParams.get("traceId")?.trim();

  if (!service) {
    return NextResponse.json({ error: "service is required" }, { status: 400 });
  }

  const dialect = isPostgres() ? "postgres" : "sqlite";

  const parts = [`FROM log_entries`, `WHERE tenant_id = ? AND service = ?`];
  const params: unknown[] = [tenantId, service];

  if (q) {
    parts.push(
      `AND (message LIKE '%' || ? || '%' COLLATE NOCASE OR attributes_json LIKE '%' || ? || '%' COLLATE NOCASE)`,
    );
    params.push(q, q);
  }

  if (traceId) {
    parts.push(
      `AND (json_extract(attributes_json, '$.trace_id') = ? OR json_extract(attributes_json, '$.traceId') = ?)`,
    );
    params.push(traceId, traceId);
  }

  const startRaw = searchParams.get("start");
  const endRaw = searchParams.get("end");
  if (startRaw !== null && startRaw !== "") {
    const startMs = Number(startRaw);
    if (Number.isFinite(startMs)) {
      parts.push(`AND ts >= ?`);
      params.push(startMs);
    }
  }
  if (endRaw !== null && endRaw !== "") {
    const endMs = Number(endRaw);
    if (Number.isFinite(endMs)) {
      parts.push(`AND ts <= ?`);
      params.push(endMs);
    }
  }

  const attrKeyRaw = searchParams.get("attrKey")?.trim() ?? "";
  const attrValueRaw = searchParams.get("attrValue")?.trim() ?? "";
  if (attrKeyRaw) {
    if (!LOG_ATTR_KEY_RE.test(attrKeyRaw)) {
      return NextResponse.json(
        { error: "Invalid attrKey (use letters, numbers, _, -, .)" },
        { status: 400 },
      );
    }
    appendLogAttributeExistsClause(
      parts,
      params,
      attrKeyRaw,
      attrValueRaw,
      dialect,
    );
  }

  const tail = parts.join("\n");

  const levelRows = await queryAll<{ level: string; c: number }>(
    `SELECT level, COUNT(*) AS c ${tail} GROUP BY level ORDER BY c DESC`,
    params,
  );

  const totalRow = await queryGet<{ c: number }>(
    `SELECT COUNT(*) AS c ${tail}`,
    params,
  );

  const topMessages = await queryAll<{ sample: string; c: number }>(
    `SELECT substr(message, 1, 72) AS sample, COUNT(*) AS c ${tail} GROUP BY substr(message, 1, 120) ORDER BY c DESC LIMIT 6`,
    params,
  );

  const sampleAttrs = await queryAll<{ attributesJson: string }>(
    `SELECT attributes_json AS attributesJson ${tail} ORDER BY ts DESC LIMIT 400`,
    params,
  );

  const keyHits = new Map<string, number>();
  for (const row of sampleAttrs) {
    try {
      const o = JSON.parse(row.attributesJson || "{}") as Record<
        string,
        unknown
      >;
      for (const k of Object.keys(o)) {
        keyHits.set(k, (keyHits.get(k) ?? 0) + 1);
      }
    } catch {
      /* skip */
    }
  }
  const attributeKeys = [...keyHits.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 14)
    .map(([key, count]) => ({ key, count }));

  return NextResponse.json({
    service,
    total: Number(totalRow?.c ?? 0),
    sampleSize: sampleAttrs.length,
    levels: levelRows.map((r) => ({
      level: r.level,
      count: Number(r.c),
    })),
    topMessages: topMessages.map((r) => ({
      message: r.sample,
      count: Number(r.c),
    })),
    attributeKeys,
  });
}
