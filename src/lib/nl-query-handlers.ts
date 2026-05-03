import "server-only";

import { getTelemetryTenantId } from "@/lib/telemetry-tenant";
import { getNlClientIdFromServerAction } from "@/lib/nl-query-client-id";
import { nlQueryRateLimitExceeded } from "@/lib/nl-query-rate-limit";
import { runNlQueryPlanner } from "@/lib/nl-query-run";
import type { NlQueryApiResponse } from "@/lib/nl-query-schema";

export type PlanNlQueryResult =
  | { ok: true; plan: NlQueryApiResponse }
  | { ok: false; error: string };

export async function executeNlQuery(options: {
  prompt: string;
  pageHint?: "logs" | "metrics" | "traces";
  clientId: string;
  tenantId: string;
}): Promise<PlanNlQueryResult> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return {
      ok: false,
      error:
        "OPENAI_API_KEY is not set. Add it to the server environment to use natural-language queries.",
    };
  }

  const trimmed = options.prompt.trim();
  if (trimmed.length < 3) {
    return { ok: false, error: "Prompt is too short." };
  }
  if (trimmed.length > 2000) {
    return { ok: false, error: "Prompt is too long (max 2000 characters)." };
  }

  if (nlQueryRateLimitExceeded(options.clientId)) {
    return {
      ok: false,
      error:
        "Too many natural-language queries from this client. Try again in about a minute.",
    };
  }

  try {
    const plan = await runNlQueryPlanner({
      prompt: trimmed,
      pageHint: options.pageHint,
      tenantId: options.tenantId,
    });
    return { ok: true, plan };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Natural-language query failed.",
    };
  }
}

/** Convenience for server actions (uses request headers for rate-limit key). */
export async function executeNlQueryFromAction(
  prompt: string,
  pageHint?: "logs" | "metrics" | "traces",
): Promise<PlanNlQueryResult> {
  const clientId = await getNlClientIdFromServerAction();
  const tenantId = await getTelemetryTenantId();
  return executeNlQuery({ prompt, pageHint, clientId, tenantId });
}
