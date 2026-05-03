const IDENT = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
const LABEL_KEY = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Parses a tiny PromQL subset: `metric_name` or `metric_name{a="b", c="d"}`.
 * Does not support functions, operators, or PromQL grammar beyond one selector.
 */
export function parsePromQlInstantSelector(input: string): {
  metric: string;
  labels: Record<string, string>;
} | null {
  const s = input.trim();
  if (!s) return null;

  const open = s.indexOf("{");
  if (open === -1) {
    const metric = s.trim();
    return IDENT.test(metric) ? { metric, labels: {} } : null;
  }

  const metric = s.slice(0, open).trim();
  if (!IDENT.test(metric)) return null;

  const close = s.lastIndexOf("}");
  if (close <= open || close !== s.length - 1) return null;

  const inner = s.slice(open + 1, close).trim();
  const labels: Record<string, string> = {};
  if (!inner) return { metric, labels };

  const parts = inner.split(",");
  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq <= 0) return null;
    const k = part.slice(0, eq).trim();
    let v = part.slice(eq + 1).trim();
    if (!LABEL_KEY.test(k)) return null;
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'");
    } else {
      return null;
    }
    labels[k] = v;
  }

  return { metric, labels };
}
