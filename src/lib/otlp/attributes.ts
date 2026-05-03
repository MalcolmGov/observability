/** Trimmed non-empty string from an OTLP-expanded attribute value. */
export function otlpAttrString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

/** Full resource identity incl. `service.name` (telemetry tables + parsers). */
export type ResourceIdentity = {
  service: string;
  version: string | null;
  instanceId: string | null;
  environment: string;
  market: string;
  product: string;
};

export type TelemetryIdentityCols = Omit<ResourceIdentity, "service">;

export function extractResourceIdentity(
  resourceAttrs: Record<string, unknown>,
): ResourceIdentity {
  const market =
    otlpAttrString(resourceAttrs.market) ??
    otlpAttrString(resourceAttrs["pulse.market"]) ??
    "unknown";
  const product =
    otlpAttrString(resourceAttrs.product) ??
    otlpAttrString(resourceAttrs["pulse.product"]) ??
    "unknown";
  return {
    service: otlpAttrString(resourceAttrs["service.name"]) ?? "unknown",
    version: otlpAttrString(resourceAttrs["service.version"]) ?? null,
    instanceId: otlpAttrString(resourceAttrs["service.instance.id"]) ?? null,
    environment:
      otlpAttrString(resourceAttrs["deployment.environment"]) ?? "unknown",
    market,
    product,
  };
}

export function telemetryDims(id: ResourceIdentity): TelemetryIdentityCols {
  return {
    product: id.product,
    market: id.market,
    environment: id.environment,
    version: id.version,
    instanceId: id.instanceId,
  };
}

/** OTLP KeyValue list → plain object (nested AnyValue expanded). */
export function keyValueListToRecord(kvs: unknown): Record<string, unknown> {
  if (!Array.isArray(kvs)) return {};
  const out: Record<string, unknown> = {};
  for (const kv of kvs) {
    if (!kv || typeof kv !== "object") continue;
    const key = (kv as { key?: string }).key;
    if (!key) continue;
    const val = (kv as { value?: unknown }).value;
    out[key] = anyValueToJson(val);
  }
  return out;
}

export function anyValueToJson(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v !== "object") return v;
  const o = v as Record<string, unknown>;
  if ("stringValue" in o) return o.stringValue;
  if ("boolValue" in o) return o.boolValue;
  if ("intValue" in o) return o.intValue;
  if ("doubleValue" in o) return o.doubleValue;
  if ("bytesValue" in o) return o.bytesValue;
  if ("arrayValue" in o && o.arrayValue && typeof o.arrayValue === "object") {
    const vals = (o.arrayValue as { values?: unknown[] }).values;
    return Array.isArray(vals) ? vals.map(anyValueToJson) : [];
  }
  if ("kvlistValue" in o && o.kvlistValue && typeof o.kvlistValue === "object") {
    const vals = (o.kvlistValue as { values?: unknown[] }).values;
    return keyValueListToRecord(vals ?? []);
  }
  return v;
}

/** Flatten attributes for serviceFromLabels (string values only). */
export function attrsToStringMap(a: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(a)) {
    if (v === null || v === undefined) continue;
    out[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return out;
}
