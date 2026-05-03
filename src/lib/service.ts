export function serviceFromLabels(
  labels: Record<string, string> | undefined,
): string {
  if (!labels) return "unknown";
  return (
    labels.service ??
    labels.app ??
    labels.application ??
    labels["service.name"] ??
    "unknown"
  );
}

export function serviceFromLog(
  explicit: string | undefined,
  attributes: Record<string, unknown> | undefined,
): string {
  if (explicit && explicit.trim()) return explicit.trim();
  const s = attributes?.service;
  if (typeof s === "string" && s.trim()) return s.trim();
  return "unknown";
}
