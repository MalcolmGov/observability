import "server-only";

import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";

/** Sent by collectors / proxies for ingest isolation. */
export const TELEMETRY_TENANT_HEADER = "x-pulse-tenant-id";

/** Browser sessions: set after auth (middleware or login action). */
export const TELEMETRY_TENANT_COOKIE = "pulse_tenant_id";

/** Slug-style tenant ids (NO raw emails / spaces). */
const TENANT_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}[a-zA-Z0-9]$/;

export function isMultiTenantIngestMode(): boolean {
  const v = process.env.PULSE_MULTI_TENANT?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function validateTelemetryTenantId(raw: string): string | null {
  const t = raw.trim();
  if (!t || t.length > 64) return null;
  if (!TENANT_RE.test(t)) return null;
  return t;
}

export function defaultTelemetryTenantId(): string {
  const env = process.env.PULSE_DEFAULT_TENANT_ID?.trim();
  if (env) {
    const v = validateTelemetryTenantId(env);
    if (v) return v;
  }
  return "default";
}

/**
 * UI + same-origin API: header (dev tools), cookie (post-login), then default.
 * Does not enforce multi-tenant ingest rules — use `resolveIngestTenantId`.
 */
export async function getTelemetryTenantId(): Promise<string> {
  const h = await headers();
  const c = await cookies();
  const fromHeader = h.get(TELEMETRY_TENANT_HEADER)?.trim();
  if (fromHeader) {
    const v = validateTelemetryTenantId(fromHeader);
    if (v) return v;
  }
  const fromCookie = c.get(TELEMETRY_TENANT_COOKIE)?.value?.trim();
  if (fromCookie) {
    const v = validateTelemetryTenantId(fromCookie);
    if (v) return v;
  }
  return defaultTelemetryTenantId();
}

/** Stateless handler variant (middleware-safe). Reads header, cookie, then query param `pulseTenant`. */
export function getTelemetryTenantIdFromRequest(req: Request): string {
  const raw = req.headers.get(TELEMETRY_TENANT_HEADER)?.trim();
  if (raw) {
    const v = validateTelemetryTenantId(raw);
    if (v) return v;
  }

  const cookieHeader = req.headers.get("cookie") ?? "";
  const cookieMatch = cookieHeader.match(
    new RegExp(
      `(?:^|;\\s*)${TELEMETRY_TENANT_COOKIE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`,
    ),
  );
  if (cookieMatch?.[1]) {
    try {
      const decoded = decodeURIComponent(cookieMatch[1].trim());
      const v = validateTelemetryTenantId(decoded);
      if (v) return v;
    } catch {
      /* ignore malformed cookie */
    }
  }

  try {
    const qp = new URL(req.url).searchParams.get("pulseTenant")?.trim();
    if (qp) {
      const v = validateTelemetryTenantId(qp);
      if (v) return v;
    }
  } catch {
    /* ignore bad URL */
  }

  return defaultTelemetryTenantId();
}

/**
 * Ingest paths: require tenant header when `PULSE_MULTI_TENANT` is enabled.
 * Otherwise default tenant (single-tenant installs).
 */
export function resolveIngestTenantId(req: Request): NextResponse | string {
  const raw = req.headers.get(TELEMETRY_TENANT_HEADER)?.trim();
  if (!raw) {
    if (isMultiTenantIngestMode()) {
      return NextResponse.json(
        {
          error: `Missing ${TELEMETRY_TENANT_HEADER} header. Multi-tenant ingest requires an explicit tenant per request.`,
        },
        { status: 400 },
      );
    }
    return defaultTelemetryTenantId();
  }
  const v = validateTelemetryTenantId(raw);
  if (!v) {
    return NextResponse.json(
      { error: "Invalid tenant id (use letters, digits, . _ -; max 64 chars)." },
      { status: 400 },
    );
  }
  return v;
}
