import { isPostgres } from "@/lib/sql-dialect";
import { sqlite } from "@/db/sqlite-instance";
import { getPgPool } from "@/db/pg-pool";
import { retentionConfig } from "@/lib/telemetry-retention";
import { isCronSecretConfigured } from "@/lib/cron-auth";
import { isIngestAuthConfigured } from "@/lib/ingest-auth";
import { isNlQueryApiAuthConfigured } from "@/lib/nl-query-auth";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    if (isPostgres()) {
      const pool = await getPgPool();
      await pool.query("SELECT 1 AS ok");
      return NextResponse.json({
        status: "ok",
        time: new Date().toISOString(),
        store: "postgres",
        ingestAuthRequired: isIngestAuthConfigured(),
        naturalLanguageQuery: {
          openaiConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
          restApiAuthRequired: isNlQueryApiAuthConfigured(),
        },
        retentionPolicyDays: retentionConfig(),
        cronRetention: {
          productionRequiresSecret: process.env.NODE_ENV === "production",
          secretConfigured: isCronSecretConfigured(),
        },
      });
    }
    if (!sqlite) throw new Error("SQLite not available");
    sqlite.prepare(`SELECT 1 AS ok`).get() as { ok: number };
    return NextResponse.json({
      status: "ok",
      time: new Date().toISOString(),
      store: "sqlite",
      ingestAuthRequired: isIngestAuthConfigured(),
      naturalLanguageQuery: {
        openaiConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
        restApiAuthRequired: isNlQueryApiAuthConfigured(),
      },
      retentionPolicyDays: retentionConfig(),
      cronRetention: {
        productionRequiresSecret: process.env.NODE_ENV === "production",
        secretConfigured: isCronSecretConfigured(),
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        status: "error",
        time: new Date().toISOString(),
        message: e instanceof Error ? e.message : "db check failed",
      },
      { status: 503 },
    );
  }
}
