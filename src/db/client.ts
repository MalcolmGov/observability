import "server-only";

/** Side effect: ensures SQLite file exists when DATABASE_URL is unset. */
import "@/db/sqlite-instance";

export { db, sqlite } from "@/db/sqlite-instance";
export { queryAll, queryGet, queryRun } from "@/db/query-runtime";
export {
  insertMetricPoints,
  insertLogEntries,
  insertTraceSpans,
} from "@/db/writes";
