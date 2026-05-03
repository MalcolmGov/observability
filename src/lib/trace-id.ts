/** Extract trace id from log attributes (OpenTelemetry-style and common aliases). */
export function traceIdFromAttributes(
  attributes: Record<string, unknown> | undefined,
): string | undefined {
  if (!attributes) return undefined;
  const raw =
    attributes.trace_id ??
    attributes.traceId ??
    attributes["dd.trace_id"];
  if (typeof raw === "string" && raw.length > 0) return raw;
  return undefined;
}
