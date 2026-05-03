"use client";

type Bucket = { t: number; p50: number; p95: number; p99: number };

function heatColor(norm: number): string {
  const x = Math.max(0, Math.min(1, norm));
  const r = Math.round(30 + x * 190);
  const g = Math.round(40 + x * 120);
  const b = Math.round(90 + (1 - x) * 165);
  return `rgb(${r},${g},${b})`;
}

export function LatencyPercentileHeatmap({
  buckets,
  formatTick,
}: {
  buckets: Bucket[];
  formatTick: (t: number) => string;
}) {
  if (!buckets.length) {
    return (
      <div className="pulse-chart-empty min-h-[140px]">
        No latency buckets for heatmap.
      </div>
    );
  }

  const rows = [
    { key: "p50", label: "p50", pick: (b: Bucket) => b.p50 },
    { key: "p95", label: "p95", pick: (b: Bucket) => b.p95 },
    { key: "p99", label: "p99", pick: (b: Bucket) => b.p99 },
  ] as const;

  const vals = buckets.flatMap((b) => [b.p50, b.p95, b.p99]);
  const vmax = Math.max(...vals, 1);

  const cw = 520;
  const ch = 112;
  const padL = 36;
  const padT = 18;
  const cellW = (cw - padL - 8) / buckets.length;
  const cellH = (ch - padT - 8) / rows.length;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        width={cw}
        height={ch}
        className="mx-auto block max-w-full"
        role="img"
        aria-label="Latency percentile heatmap over time"
      >
        {rows.map((row, ri) =>
          buckets.map((b, ci) => {
            const v = row.pick(b);
            const norm = v / vmax;
            return (
              <rect
                key={`${row.key}-${b.t}`}
                x={padL + ci * cellW}
                y={padT + ri * cellH}
                width={Math.max(2, cellW - 1)}
                height={Math.max(2, cellH - 1)}
                rx={3}
                fill={heatColor(norm)}
                stroke="rgba(255,255,255,0.06)"
              />
            );
          }),
        )}
        {rows.map((row, ri) => (
          <text
            key={row.key}
            x={4}
            y={padT + ri * cellH + cellH / 2 + 4}
            fill="#71717a"
            fontSize={10}
            fontWeight={600}
          >
            {row.label}
          </text>
        ))}
        {buckets.map((b, ci) => (
          <text
            key={`lbl-${b.t}`}
            x={padL + ci * cellW + cellW / 2}
            y={12}
            textAnchor="middle"
            fill="#71717a"
            fontSize={9}
          >
            {formatTick(b.t)}
          </text>
        ))}
      </svg>
      <p className="mt-2 text-center text-[10px] text-zinc-600">
        Rows: latency percentiles · Columns: time buckets · Darker = higher ms
      </p>
    </div>
  );
}

export function SloGaugeArc({
  actualPct,
  targetPct,
  label,
}: {
  actualPct: number | null;
  targetPct: number;
  label: string;
}) {
  const pct = actualPct != null ? Math.max(0, Math.min(100, actualPct)) : null;
  const theta = pct != null ? Math.PI * (1 - pct / 100) : 0;
  const x = 80 + 60 * Math.cos(theta);
  const y = 80 - 60 * Math.sin(theta);

  const stroke =
    pct == null
      ? "#52525b"
      : pct >= targetPct
        ? "#34d399"
        : pct >= targetPct - 0.3
          ? "#fbbf24"
          : "#f87171";

  return (
    <div className="flex flex-col items-center">
      <svg width={160} height={92} viewBox="0 0 160 92" className="mx-auto">
        <path
          d="M 20 80 A 60 60 0 0 1 140 80"
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={12}
          strokeLinecap="round"
        />
        {pct != null ? (
          <path
            d={`M 20 80 A 60 60 0 0 1 ${x} ${y}`}
            fill="none"
            stroke={stroke}
            strokeWidth={12}
            strokeLinecap="round"
          />
        ) : null}
        <text
          x={80}
          y={72}
          textAnchor="middle"
          fill="#fafafa"
          fontSize={18}
          fontWeight={700}
        >
          {pct != null ? `${pct.toFixed(2)}%` : "—"}
        </text>
        <text
          x={80}
          y={86}
          textAnchor="middle"
          fill="#71717a"
          fontSize={9}
        >
          target {targetPct.toFixed(2)}%
        </text>
      </svg>
      <p className="mt-1 max-w-[200px] text-center text-[10px] text-zinc-500">
        {label}
      </p>
    </div>
  );
}
