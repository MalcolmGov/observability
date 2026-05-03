import { z } from "zod";

export const nlTimePresetSchema = z.enum(["15m", "1h", "6h", "24h", "7d"]);

export type NlTimePreset = z.infer<typeof nlTimePresetSchema>;

/** Structured plan from the model (validated + normalized by the API). */
export const nlQueryPlanSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("logs"),
    reasoning: z.string().max(800),
    timePreset: nlTimePresetSchema,
    service: z.string(),
    q: z.string().optional(),
    level: z.enum(["error", "warn", "info", "debug"]).optional(),
    traceId: z.string().optional(),
    attrKey: z.string().optional(),
    attrValue: z.string().optional(),
  }),
  z.object({
    kind: z.literal("metrics"),
    reasoning: z.string().max(800),
    timePreset: nlTimePresetSchema,
    service: z.string(),
    metricName: z.string(),
  }),
  z.object({
    kind: z.literal("traces"),
    reasoning: z.string().max(800),
    timePreset: nlTimePresetSchema,
    service: z.string().optional(),
    errorsOnly: z.boolean().optional(),
    minDurationMs: z.number().optional(),
  }),
]);

export type NlQueryPlan = z.infer<typeof nlQueryPlanSchema>;

export type NlQueryTimeRange = {
  preset: NlTimePreset;
  startMs: number;
  endMs: number;
  windowMs: number;
};

export type NlQueryApiResponse = {
  kind: NlQueryPlan["kind"];
  reasoning: string;
  time: NlQueryTimeRange;
  logs?: {
    service: string;
    q?: string;
    level?: string;
    traceId?: string;
    attrKey?: string;
    attrValue?: string;
  };
  metrics?: {
    service: string;
    metricName: string;
    rangeKey: NlTimePreset;
  };
  traces?: {
    service?: string;
    errorsOnly?: boolean;
    minDurationMs?: number;
    lookbackMs: number;
  };
  warnings: string[];
};
