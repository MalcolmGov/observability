import { queryAll } from "@/db/client";
import {
  appendLogAttributeExistsClause,
  LOG_ATTR_KEY_RE,
} from "@/lib/log-attr-filter";
import { isPostgres } from "@/lib/sql-dialect";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const service = searchParams.get("service");
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 500);
  const q = searchParams.get("q")?.trim() ?? "";
  const levelFilter = searchParams.get("level")?.trim().toLowerCase() ?? "";

  if (!service) {
    return NextResponse.json({ error: "service is required" }, { status: 400 });
  }

  const dialect = isPostgres() ? "postgres" : "sqlite";

  const parts = [
    `SELECT ts, level, message, attributes_json AS attributesJson`,
    `FROM log_entries`,
    `WHERE service = ?`,
  ];
  const params: unknown[] = [service];

  if (levelFilter && levelFilter !== "all") {
    parts.push(`AND level = ?`);
    params.push(levelFilter);
  }

  if (q) {
    parts.push(
      `AND (message LIKE '%' || ? || '%' COLLATE NOCASE OR attributes_json LIKE '%' || ? || '%' COLLATE NOCASE)`,
    );
    params.push(q, q);
  }

  const traceId = searchParams.get("traceId")?.trim();
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

  parts.push(`ORDER BY ts DESC`);
  parts.push(`LIMIT ?`);
  params.push(limit);

  const rows = await queryAll<{
    ts: number;
    level: string;
    message: string;
    attributesJson: string;
  }>(parts.join("\n"), params);

  const logs = rows.map((r) => ({
    ts: Number(r.ts),
    level: r.level,
    message: r.message,
    attributes: JSON.parse(r.attributesJson || "{}") as Record<
      string,
      unknown
    >,
  }));

  return NextResponse.json({ service, logs });
}
