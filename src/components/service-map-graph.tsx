"use client";

import { useMemo } from "react";

type Edge = { source: string; target: string; weight: number };

function tierLayout(nodes: string[], edges: Edge[]) {
  const tier = new Map<string, number>();
  for (const n of nodes) tier.set(n, 0);

  let changed = true;
  let guard = 0;
  while (changed && guard++ < nodes.length + edges.length + 4) {
    changed = false;
    for (const e of edges) {
      const ns = tier.get(e.source) ?? 0;
      const nt = ns + 1;
      if (nt > (tier.get(e.target) ?? 0)) {
        tier.set(e.target, nt);
        changed = true;
      }
    }
  }

  const byTier = new Map<number, string[]>();
  for (const n of nodes) {
    const t = tier.get(n) ?? 0;
    const arr = byTier.get(t) ?? [];
    arr.push(n);
    byTier.set(t, arr);
  }
  for (const arr of byTier.values()) arr.sort((a, b) => a.localeCompare(b));

  const tiers = [...byTier.keys()].sort((a, b) => a - b);
  const colW = 168;
  const rowH = 44;
  const pad = 24;

  const pos = new Map<string, { x: number; y: number }>();
  for (const t of tiers) {
    const row = byTier.get(t) ?? [];
    const x = pad + t * colW;
    row.forEach((n, i) => {
      pos.set(n, { x, y: pad + i * rowH });
    });
  }

  const maxRows = Math.max(1, ...[...byTier.values()].map((r) => r.length));
  const width = pad * 2 + Math.max(1, tiers.length) * colW;
  const height = pad * 2 + maxRows * rowH;

  return { pos, width, height };
}

export function ServiceMapGraph({
  nodes,
  edges,
}: {
  nodes: string[];
  edges: Edge[];
}) {
  const layout = useMemo(() => tierLayout(nodes, edges), [edges, nodes]);

  const rendered = useMemo(() => {
    const maxW = Math.max(...edges.map((e) => e.weight), 1);
    const strokeFor = (w: number) => 1.2 + (w / maxW) * 5;

    const paths = edges
      .map((e) => {
        const a = layout.pos.get(e.source);
        const b = layout.pos.get(e.target);
        if (!a || !b) return null;
        const mx = (a.x + b.x) / 2;
        const d = `M ${a.x + 72} ${a.y + 14} C ${mx} ${a.y + 14}, ${mx} ${b.y + 14}, ${b.x + 72} ${b.y + 14}`;
        return {
          key: `${e.source}->${e.target}`,
          d,
          strokeWidth: strokeFor(e.weight),
          weight: e.weight,
        };
      })
      .filter(Boolean) as {
      key: string;
      d: string;
      strokeWidth: number;
      weight: number;
    }[];

    const boxes = [...layout.pos.entries()].map(([name, p]) => ({
      key: name,
      name,
      x: p.x,
      y: p.y,
    }));

    return { paths, boxes };
  }, [edges, layout.pos]);

  if (!nodes.length) {
    return (
      <div className="pulse-chart-empty min-h-[200px] rounded-xl">
        No graph data in this window.
      </div>
    );
  }

  const w = Math.max(layout.width, 320);
  const h = Math.min(Math.max(layout.height, 200), 560);

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-white/[0.06] bg-slate-950/35">
      <svg
        width={w}
        height={h}
        className="block"
        role="img"
        aria-label="Service dependency graph"
      >
        <defs>
          <linearGradient id="sm-edge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(139,92,246,0.55)" />
            <stop offset="100%" stopColor="rgba(52,211,153,0.5)" />
          </linearGradient>
        </defs>
        {rendered.paths.map((e) => (
          <path
            key={e.key}
            d={e.d}
            fill="none"
            stroke="url(#sm-edge)"
            strokeWidth={e.strokeWidth}
            strokeLinecap="round"
            opacity={0.88}
          />
        ))}
        {rendered.boxes.map((b) => (
          <g key={b.key} transform={`translate(${b.x},${b.y})`}>
            <rect
              width={144}
              height={28}
              rx={8}
              fill="rgba(2,6,23,0.88)"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth={1}
            />
            <text
              x={72}
              y={18}
              textAnchor="middle"
              fill="#e4e4e7"
              fontSize={11}
              fontWeight={600}
              fontFamily="ui-sans-serif, system-ui"
            >
              {b.name.length > 20 ? `${b.name.slice(0, 18)}…` : b.name}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
