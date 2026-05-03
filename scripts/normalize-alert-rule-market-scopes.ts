/**
 * Canonicalize non-null `alert_rules.market_scope` rows (uppercase, dedupe, sort).
 * Fails on unknown market codes so bad data is surfaced before evaluate silently misses.
 *
 * From observability/:
 *   npx tsx scripts/normalize-alert-rule-market-scopes.ts
 */

import { queryAll, queryRun } from "../src/db/client";
import {
  normalizeMarketScope,
  ValidationError,
} from "../src/lib/market-scope";

async function main() {
  const rows = await queryAll<{ id: number; market_scope: string | null }>(
    `SELECT id, market_scope FROM alert_rules
     WHERE market_scope IS NOT NULL AND TRIM(market_scope) != ''`,
    [],
  );

  let updated = 0;
  for (const r of rows) {
    try {
      const canon = normalizeMarketScope(r.market_scope);
      if (canon !== r.market_scope) {
        await queryRun(`UPDATE alert_rules SET market_scope = ? WHERE id = ?`, [
          canon,
          r.id,
        ]);
        updated += 1;
      }
    } catch (e) {
      if (e instanceof ValidationError) {
        console.error(`Rule id=${r.id}: ${e.message}`);
        process.exit(1);
      }
      throw e;
    }
  }

  console.log(`Checked ${rows.length} rule(s); updated ${updated} to canonical form.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
