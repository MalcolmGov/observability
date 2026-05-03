import { executeLogsQuery } from "@/lib/logs-query";
import { LOG_ATTR_KEY_RE } from "@/lib/log-attr-filter";
import { parseScopeFilters } from "@/lib/scope-filters";
import { getTelemetryTenantIdFromRequest } from "@/lib/telemetry-tenant";

export const runtime = "nodejs";

/**
 * Server-Sent Events live tail: polls upstream storage and pushes `log` events.
 * Query params mirror `/api/v1/query/logs` plus `intervalMs`, `lookbackMs`.
 */
export async function GET(req: Request) {
  const tenantId = getTelemetryTenantIdFromRequest(req);
  const { searchParams } = new URL(req.url);
  const service = searchParams.get("service");
  if (!service) {
    return new Response(JSON.stringify({ error: "service is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const limit = Math.min(Number(searchParams.get("limit")) || 80, 200);
  const q = searchParams.get("q")?.trim() ?? "";
  const levelFilter = searchParams.get("level")?.trim().toLowerCase() ?? "";
  const traceId = searchParams.get("traceId")?.trim();
  const scopeParsed = parseScopeFilters(searchParams);
  if (!scopeParsed.ok) return scopeParsed.response;
  const { filters: scope } = scopeParsed;

  const attrKeyRaw = searchParams.get("attrKey")?.trim() ?? "";
  const attrValueRaw = searchParams.get("attrValue")?.trim() ?? "";
  if (attrKeyRaw && !LOG_ATTR_KEY_RE.test(attrKeyRaw)) {
    return new Response(JSON.stringify({ error: "Invalid attrKey" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const intervalMs = Math.min(
    Math.max(Number(searchParams.get("intervalMs")) || 2000, 500),
    30_000,
  );
  const lookbackMs = Math.min(
    Math.max(Number(searchParams.get("lookbackMs")) || 120_000, 10_000),
    24 * 60 * 60 * 1000,
  );

  let cursor =
    Number(searchParams.get("since")) ||
    Date.now() - lookbackMs;

  const encoder = new TextEncoder();
  const signal = req.signal;

  const stream = new ReadableStream({
    async start(controller) {
      const push = (obj: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(obj)}\n\n`),
        );
      };

      push({ type: "ready", intervalMs });

      while (!signal.aborted) {
        try {
          const batch = await executeLogsQuery({
            tenantId,
            service,
            scope,
            limit,
            q,
            levelFilter,
            traceId: traceId || undefined,
            attrKey: attrKeyRaw || undefined,
            attrValue: attrValueRaw || undefined,
            cursorTsExclusive: cursor,
            sort: "asc",
          });
          for (const log of batch) {
            push({ type: "log", log });
            cursor = Math.max(cursor, log.ts);
          }
          push({ type: "tick", at: Date.now(), cursor });
        } catch {
          push({
            type: "error",
            message: "logs query failed",
          });
        }

        await new Promise<void>((resolve) => {
          const id = setTimeout(resolve, intervalMs);
          signal.addEventListener("abort", () => {
            clearTimeout(id);
            resolve();
          });
        });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
