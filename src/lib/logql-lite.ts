const LABEL_KEY = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** Parses `{service="x"}` with optional `|~ "regex"` or `|= "line"` filter (non-greedy first pipe). */
export function parseLogQlLite(input: string): {
  labels: Record<string, string>;
  lineContains?: string;
  lineRegex?: string;
} | null {
  const s = input.trim();
  const open = s.indexOf("{");
  if (open !== 0) return null;
  const close = s.indexOf("}");
  if (close <= open) return null;

  const inner = s.slice(open + 1, close).trim();
  const labels: Record<string, string> = {};

  if (inner) {
    for (const rawPart of inner.split(",")) {
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
      } else return null;
      labels[k] = v;
    }
  }

  let rest = s.slice(close + 1).trim();
  let lineContains: string | undefined;
  let lineRegex: string | undefined;

  if (rest.startsWith("|=")) {
    rest = rest.slice(2).trim();
    const m = rest.match(/^"((?:[^"\\]|\\.)*)"|^'((?:[^'\\]|\\.)*)'/);
    if (!m) return null;
    lineContains = (m[1] ?? m[2] ?? "").replace(/\\"/g, '"').replace(/\\'/g, "'");
  } else if (rest.startsWith("|~")) {
    rest = rest.slice(2).trim();
    const m = rest.match(/^"((?:[^"\\]|\\.)*)"|^'((?:[^'\\]|\\.)*)'/);
    if (!m) return null;
    lineRegex = (m[1] ?? m[2] ?? "").replace(/\\"/g, '"').replace(/\\'/g, "'");
  }

  return { labels, lineContains, lineRegex };
}
