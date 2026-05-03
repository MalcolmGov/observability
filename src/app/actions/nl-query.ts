"use server";

import {
  executeNlQueryFromAction,
  type PlanNlQueryResult,
} from "@/lib/nl-query-handlers";

export type { PlanNlQueryResult };

export async function planNlQueryAction(
  prompt: string,
  pageHint?: "logs" | "metrics" | "traces",
): Promise<PlanNlQueryResult> {
  return executeNlQueryFromAction(prompt, pageHint);
}
