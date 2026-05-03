/** Safe top-level JSON object keys for json_each / jsonb_each filters. */
export const LOG_ATTR_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/;

export type LogJsonDialect = "sqlite" | "postgres";

export function appendLogAttributeExistsClause(
  parts: string[],
  params: unknown[],
  attrKey: string,
  attrValue: string | undefined,
  dialect: LogJsonDialect,
) {
  const val = attrValue?.trim() ?? "";
  if (dialect === "postgres") {
    if (val.length > 0) {
      parts.push(`AND EXISTS (
      SELECT 1 FROM jsonb_each(attributes_json::jsonb) AS je(key, value)
      WHERE je.key = ?
      AND je.value::text ILIKE '%' || ? || '%'
    )`);
      params.push(attrKey, val);
    } else {
      parts.push(`AND EXISTS (
      SELECT 1 FROM jsonb_each(attributes_json::jsonb) AS je(key, value)
      WHERE je.key = ?
    )`);
      params.push(attrKey);
    }
    return;
  }

  if (val.length > 0) {
    parts.push(`AND EXISTS (
      SELECT 1 FROM json_each(attributes_json) je
      WHERE je.key = ?
      AND CAST(je.value AS TEXT) LIKE '%' || ? || '%' COLLATE NOCASE
    )`);
    params.push(attrKey, val);
  } else {
    parts.push(`AND EXISTS (
      SELECT 1 FROM json_each(attributes_json) je
      WHERE je.key = ?
    )`);
    params.push(attrKey);
  }
}
