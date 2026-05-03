"use server";

import { getNlClientIdFromServerAction } from "@/lib/nl-query-client-id";
import { nlQueryRateLimitExceeded } from "@/lib/nl-query-rate-limit";
import { getTelemetryTenantId } from "@/lib/telemetry-tenant";
import type { OpsBrief } from "@/lib/ops-brief-schema";
import { runOpsBriefPlanner } from "@/lib/ops-brief-run";
import { loadOpsBriefSnapshot } from "@/lib/ops-brief-snapshot";

export type GenerateOpsBriefResult =
  | { ok: true; brief: OpsBrief }
  | { ok: false; error: string };

const WINDOW_MS = 24 * 60 * 60 * 1000;

export async function generateOpsBriefAction(): Promise<GenerateOpsBriefResult> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return {
      ok: false,
      error:
        "Add OPENAI_API_KEY to your environment to generate AI Ops briefs (same key as natural-language query).",
    };
  }

  const clientId = await getNlClientIdFromServerAction();
  const rlKey = `${clientId}:ops-brief`;
  if (nlQueryRateLimitExceeded(rlKey)) {
    return {
      ok: false,
      error:
        "Too many brief generations from this session. Try again in about a minute.",
    };
  }

  try {
    const tenantId = await getTelemetryTenantId();
    const snapshot = await loadOpsBriefSnapshot(WINDOW_MS, tenantId);
    const brief = await runOpsBriefPlanner(snapshot);
    return { ok: true, brief };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error ? e.message : "Could not generate AI Ops brief.",
    };
  }
}
