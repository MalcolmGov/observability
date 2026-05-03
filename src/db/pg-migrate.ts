import "server-only";

/**
 * Applies SQL from `src/db/drizzle-pg` via Drizzle's migrator (journal in
 * `src/db/drizzle-pg/meta`). Postgres databases that were created with the old
 * runtime DDL bootstrap must be baselined or recreated before first deploy:
 * either drop the Pulse tables and let migrations run, or insert a matching row
 * into `__drizzle_migrations` (see Drizzle `MigrationConfig`) if the schema already matches `0000_*`.
 */

import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Pool } from "pg";

import * as pgSchema from "@/db/schema-pg";

const migrationsFolder = path.join(process.cwd(), "src/db/drizzle-pg");

export async function runPostgresMigrations(pool: Pool) {
  const db = drizzle(pool, { schema: pgSchema });
  await migrate(db, { migrationsFolder });
}
