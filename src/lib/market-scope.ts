/** Column order for App Catalog grid and UX parity with alerts normalization. */
export const KNOWN_MARKETS_ORDER = [
  "ZA",
  "NG",
  "KE",
  "GH",
  "EG",
  "MA",
  "CI",
  "SN",
  "UG",
  "TZ",
  "ZW",
  "MZ",
  "AO",
] as const;

/** Pulse-supported markets (App Catalog columns). */
export const KNOWN_MARKETS = new Set<string>(KNOWN_MARKETS_ORDER);

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Canonical alert rule `market_scope` for storage and trivial read-side filtering.
 *
 * - `null` / empty / `ALL` / `*` → `NULL` on disk (all markets; no metric filter).
 * - Otherwise comma- or array-listed codes → uppercase, deduped, sorted CSV.
 *
 * @throws ValidationError if any token is not in {@link KNOWN_MARKETS} (after ALL/* handling).
 */
export function normalizeMarketScope(input: unknown): string | null {
  if (input == null) return null;

  const tokens = (Array.isArray(input) ? input : String(input).split(","))
    .map((t) => String(t).trim().toUpperCase())
    .filter(Boolean);

  if (
    tokens.length === 0 ||
    tokens.includes("ALL") ||
    tokens.includes("*")
  ) {
    return null;
  }

  const unknown = tokens.filter((t) => !KNOWN_MARKETS.has(t));
  if (unknown.length > 0) {
    throw new ValidationError(`Unknown market(s): ${unknown.join(", ")}`);
  }

  const canonical = [...new Set(tokens)].sort();
  return canonical.join(",");
}
