/** Longest-duration root→leaf path in a span tree (critical path highlight). */

export type SpanPathNode = {
  spanId: string;
  parentSpanId: string | null;
  durationMs: number;
};

export function computeCriticalPathSpanIds(spans: SpanPathNode[]): Set<string> {
  const out = new Set<string>();
  if (!spans.length) return out;

  const byId = new Map(spans.map((s) => [s.spanId, s]));
  const children = new Map<string, SpanPathNode[]>();
  const roots: SpanPathNode[] = [];

  function resolvedParent(s: SpanPathNode): string | null {
    const p = s.parentSpanId;
    if (p == null || String(p).trim() === "") return null;
    return byId.has(p) ? p : null;
  }

  for (const s of spans) {
    const pid = resolvedParent(s);
    if (pid == null) {
      roots.push(s);
    } else {
      const arr = children.get(pid) ?? [];
      arr.push(s);
      children.set(pid, arr);
    }
  }

  if (!roots.length) {
    roots.push(spans[0]);
  }

  const memo = new Map<string, number>();

  function score(spanId: string): number {
    const hit = memo.get(spanId);
    if (hit != null) return hit;
    const node = byId.get(spanId);
    if (!node) return 0;
    const kids: SpanPathNode[] = children.get(spanId) ?? [];
    let down = 0;
    for (const c of kids) down = Math.max(down, score(c.spanId));
    const v = node.durationMs + down;
    memo.set(spanId, v);
    return v;
  }

  let best = roots[0];
  let bestScore = score(best.spanId);
  for (const r of roots.slice(1)) {
    const sc = score(r.spanId);
    if (sc > bestScore) {
      bestScore = sc;
      best = r;
    }
  }

  let cur: SpanPathNode | undefined = best;
  while (cur) {
    out.add(cur.spanId);
    const kids: SpanPathNode[] = children.get(cur.spanId) ?? [];
    if (!kids.length) break;
    cur = kids.reduce((a, b) =>
      score(a.spanId) >= score(b.spanId) ? a : b,
    );
  }

  return out;
}
