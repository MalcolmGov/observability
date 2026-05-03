import "server-only";
import { isPostgres, toPostgresSql } from "@/lib/sql-dialect";
import { getPgPool } from "@/db/pg-pool";
import { sqlite } from "@/db/sqlite-instance";

export async function queryAll<T>(
  sqliteSql: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (isPostgres()) {
    const pool = await getPgPool();
    const r = await pool.query(toPostgresSql(sqliteSql), params);
    return r.rows as T[];
  }
  if (!sqlite) throw new Error("SQLite not initialized");
  return sqlite.prepare(sqliteSql).all(...params) as T[];
}

export async function queryGet<T>(
  sqliteSql: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  if (isPostgres()) {
    const pool = await getPgPool();
    const r = await pool.query(toPostgresSql(sqliteSql), params);
    return r.rows[0] as T | undefined;
  }
  if (!sqlite) throw new Error("SQLite not initialized");
  return sqlite.prepare(sqliteSql).get(...params) as T | undefined;
}

export async function queryRun(
  sqliteSql: string,
  params: unknown[] = [],
): Promise<number> {
  if (isPostgres()) {
    const pool = await getPgPool();
    const r = await pool.query(toPostgresSql(sqliteSql), params);
    return r.rowCount ?? 0;
  }
  if (!sqlite) throw new Error("SQLite not initialized");
  return sqlite.prepare(sqliteSql).run(...params).changes;
}
