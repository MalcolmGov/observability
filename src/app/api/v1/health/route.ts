import { isPostgres } from "@/lib/sql-dialect";
import { sqlite } from "@/db/sqlite-instance";
import { getPgPool } from "@/db/pg-pool";
import { retentionConfig } from "@/lib/telemetry-retention";
import { isCronSecretConfigured } from "@/lib/cron-auth";
import { isIngestAuthConfigured } from "@/lib/ingest-auth";
import { isNlQueryApiAuthConfigured } from "@/lib/nl-query-auth";
import {
  isMultiTenantIngestMode,
  TELEMETRY_TENANT_HEADER,
} from "@/lib/telemetry-tenant";
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
        otlpHttpJson: {
          traces: "/api/v1/ingest/otlp/v1/traces",
          metrics: "/api/v1/ingest/otlp/v1/metrics",
          logs: "/api/v1/ingest/otlp/v1/logs",
        },
        naturalLanguageQuery: {
          openaiConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
          restApiAuthRequired: isNlQueryApiAuthConfigured(),
        },
        telemetryIsolation: {
          tenantScopedTelemetry: true,
          tenantHeader: TELEMETRY_TENANT_HEADER,
          multiTenantIngestRequired: isMultiTenantIngestMode(),
          tenantCookie: "pulse_tenant_id",
        },
        retentionInline: {
          enabled: process.env.PULSE_DISABLE_INLINE_RETENTION?.trim() !== "1",
          intervalMsDefault: 21_600_000,
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
      otlpHttpJson: {
        traces: "/api/v1/ingest/otlp/v1/traces",
        metrics: "/api/v1/ingest/otlp/v1/metrics",
        logs: "/api/v1/ingest/otlp/v1/logs",
      },
      naturalLanguageQuery: {
        openaiConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
        restApiAuthRequired: isNlQueryApiAuthConfigured(),
      },
      telemetryIsolation: {
        tenantScopedTelemetry: true,
        tenantHeader: TELEMETRY_TENANT_HEADER,
        multiTenantIngestRequired: isMultiTenantIngestMode(),
        tenantCookie: "pulse_tenant_id",
      },
      retentionInline: {
        enabled: process.env.PULSE_DISABLE_INLINE_RETENTION?.trim() !== "1",
        intervalMsDefault: 21_600_000,
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
