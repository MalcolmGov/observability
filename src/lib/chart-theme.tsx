import type { CSSProperties } from "react";

/** Recharts tooltip — colors from CSS variables (dark/light in globals + pulse-light). */
export const pulseChartTooltipStyle: CSSProperties = {
  background: "var(--pulse-chart-tooltip-bg)",
  border: "1px solid var(--pulse-chart-tooltip-border)",
  borderRadius: 12,
  fontSize: 12,
  fontVariantNumeric: "tabular-nums",
  padding: "10px 14px",
  boxShadow: "var(--pulse-chart-tooltip-shadow)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
};

export const pulseChartTooltipLabelStyle: CSSProperties = {
  color: "var(--pulse-chart-tooltip-label)",
  marginBottom: 6,
  fontSize: 10,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

export const pulseChartTooltipItemStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  padding: "1px 0",
  fontVariantNumeric: "tabular-nums",
};

export const pulseChartAxisTick = {
  fill: "var(--pulse-chart-axis-fill)",
  fontSize: 11,
  fontWeight: 500,
};

export const pulseChartAxisTickDense = {
  fill: "var(--pulse-chart-axis-fill-dense)",
  fontSize: 10,
  fontWeight: 500,
};

/** Legend wrapper — set `color` so HTML legend items inherit in both themes */
export const pulseChartLegendWrapperStyle: CSSProperties = {
  fontSize: 11,
  paddingTop: 12,
  color: "var(--pulse-chart-legend-text)",
  fontWeight: 500,
};

/** Premium dot styling for line/area chart endpoints. Pass to Recharts <Line dot={...}>. */
export const pulseChartLineDot = {
  r: 0,
  strokeWidth: 0,
} as const;

export const pulseChartLineActiveDot = {
  r: 4,
  strokeWidth: 2,
  stroke: "var(--pulse-chart-tooltip-bg)",
} as const;

export const pulseChartGridStroke = "var(--pulse-chart-grid-stroke)";

/** Line / area strokes — use in SVG or Recharts `stroke` / `stopColor`. */
export const pulseChartSeries = {
  // Primary palette — teal/sky/blue
  teal: "var(--pulse-series-teal, #06d6c7)",
  tealStroke: "var(--pulse-series-teal-stroke, #06d6c7)",
  sky: "var(--pulse-series-sky, #38bdf8)",
  skyStroke: "var(--pulse-series-sky-stroke, #38bdf8)",
  // Semantic
  cyan: "var(--pulse-series-cyan)",
  amber: "var(--pulse-series-amber)",
  amberLine: "var(--pulse-series-amber-line)",
  rose: "var(--pulse-series-rose)",
  roseLine: "var(--pulse-series-rose-line)",
  emerald: "var(--pulse-series-emerald)",
  emeraldDeep: "var(--pulse-series-emerald-deep)",
  // Legacy aliases — map to teal/cyan so old code keeps working
  violet: "var(--pulse-series-teal, #06d6c7)",
  violetStroke: "var(--pulse-series-teal-stroke, #06d6c7)",
  violetSoft: "var(--pulse-series-cyan)",
  indigo: "var(--pulse-series-sky, #38bdf8)",
} as const;

type DefsProps = { prefix: string };

/** Unique gradient defs per chart instance (prefix must be unique on the page). */
export function PulseChartDefs({ prefix }: DefsProps) {
  return (
    <defs>
      <linearGradient id={`${prefix}-area-violet`} x1="0" y1="0" x2="0" y2="1">
        <stop
          offset="0%"
          stopColor="var(--pulse-gradient-violet-top)"
          stopOpacity={0.5}
        />
        <stop
          offset="45%"
          stopColor="var(--pulse-gradient-violet-mid)"
          stopOpacity={0.18}
        />
        <stop
          offset="100%"
          stopColor="var(--pulse-gradient-violet-bottom)"
          stopOpacity={0}
        />
      </linearGradient>
      <linearGradient id={`${prefix}-area-cyan`} x1="0" y1="0" x2="0" y2="1">
        <stop
          offset="0%"
          stopColor="var(--pulse-gradient-cyan-top)"
          stopOpacity={0.45}
        />
        <stop
          offset="50%"
          stopColor="var(--pulse-gradient-cyan-mid)"
          stopOpacity={0.12}
        />
        <stop
          offset="100%"
          stopColor="var(--pulse-gradient-cyan-bottom)"
          stopOpacity={0}
        />
      </linearGradient>
      <linearGradient id={`${prefix}-bar-rpm`} x1="0" y1="0" x2="0" y2="1">
        <stop
          offset="0%"
          stopColor="var(--pulse-gradient-bar-top)"
          stopOpacity={1}
        />
        <stop
          offset="100%"
          stopColor="var(--pulse-gradient-bar-bottom)"
          stopOpacity={0.92}
        />
      </linearGradient>
      <filter id={`${prefix}-glow-violet`} x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      {/* Teal / sky gradient and glow */}
      <linearGradient id={`${prefix}-area-teal`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#06d6c7" stopOpacity={0.45} />
        <stop offset="50%" stopColor="#06d6c7" stopOpacity={0.12} />
        <stop offset="100%" stopColor="#06d6c7" stopOpacity={0} />
      </linearGradient>
      <linearGradient id={`${prefix}-area-sky`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.4} />
        <stop offset="50%" stopColor="#38bdf8" stopOpacity={0.1} />
        <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
      </linearGradient>
      <filter id={`${prefix}-glow-teal`} x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2.5" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}
