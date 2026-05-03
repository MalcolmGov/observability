import "server-only";
import { Pool } from "pg";
import { isPostgres } from "@/lib/sql-dialect";
import { runPostgresMigrations } from "@/db/pg-migrate";

let pool: Pool | undefined;
let schemaReady: Promise<void> | undefined;

function poolMaxConnections(): number {
  const raw = process.env.PG_POOL_MAX?.trim();
  if (!raw) {
    return process.env.VERCEL ? 3 : 10;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 50) : 10;
}

export async function getPgPool(): Promise<Pool> {
  if (!isPostgres()) {
    throw new Error("getPgPool called without DATABASE_URL");
  }
  const url = process.env.DATABASE_URL!.trim();
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: poolMaxConnections(),
      idleTimeoutMillis: process.env.VERCEL ? 5000 : 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  if (!schemaReady) {
    schemaReady = runPostgresMigrations(pool);
  }
  await schemaReady;
  return pool;
}
