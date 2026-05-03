/** Linear interpolation percentile on sorted finite values (Datadog-style latency stats). */
function percentileLinear(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

export function percentilesFromValues(values: number[]): {
  p50: number;
  p95: number;
  p99: number;
  avg: number;
} {
  if (values.length === 0) {
    return { p50: 0, p95: 0, p99: 0, avg: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p50: percentileLinear(sorted, 50),
    p95: percentileLinear(sorted, 95),
    p99: percentileLinear(sorted, 99),
    avg: sorted.reduce((aV, bV) => aV + bV, 0) / sorted.length,
  };
}
