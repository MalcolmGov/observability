/** OTLP uint64 unix epoch nanoseconds → epoch milliseconds. */
export function unixNanoToMs(nano: string | number | undefined): number | null {
  if (nano === undefined || nano === null) return null;
  try {
    const n = typeof nano === "bigint" ? nano : BigInt(String(nano));
    return Number(n / BigInt(1000000));
  } catch {
    return null;
  }
}
