import type { CSSProperties } from "react";

/** Premium dark tooltip surface for Recharts */
export const pulseChartTooltipStyle: CSSProperties = {
  background: "rgba(12, 20, 38, 0.94)",
  border: "1px solid rgba(255, 255, 255, 0.09)",
  borderRadius: 12,
  fontSize: 12,
  padding: "10px 12px",
  boxShadow:
    "0 18px 48px -12px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.03) inset",
};

export const pulseChartTooltipLabelStyle: CSSProperties = {
  color: "#a1a1aa",
  marginBottom: 4,
};

export const pulseChartAxisTick = {
  fill: "#a1a1aa",
  fontSize: 10,
};

export const pulseChartGridStroke = "rgba(255,255,255,0.045)";

export const pulseChartSeries = {
  violet: "#a78bfa",
  violetStroke: "#c4b5fd",
  cyan: "#22d3ee",
  amber: "#fcd34d",
  rose: "#fb7185",
  emerald: "#34d399",
  emeraldDeep: "#10b981",
} as const;

type DefsProps = { prefix: string };

/** Unique gradient defs per chart instance (prefix must be unique on the page). */
export function PulseChartDefs({ prefix }: DefsProps) {
  return (
    <defs>
      <linearGradient id={`${prefix}-area-violet`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ddd6fe" stopOpacity={0.5} />
        <stop offset="45%" stopColor="#8b5cf6" stopOpacity={0.18} />
        <stop offset="100%" stopColor="#6d28d9" stopOpacity={0} />
      </linearGradient>
      <linearGradient id={`${prefix}-area-cyan`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#67e8f9" stopOpacity={0.45} />
        <stop offset="50%" stopColor="#22d3ee" stopOpacity={0.12} />
        <stop offset="100%" stopColor="#0891b2" stopOpacity={0} />
      </linearGradient>
      <linearGradient id={`${prefix}-bar-rpm`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#6ee7b7" stopOpacity={1} />
        <stop offset="100%" stopColor="#059669" stopOpacity={0.92} />
      </linearGradient>
      <filter id={`${prefix}-glow-violet`} x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}
