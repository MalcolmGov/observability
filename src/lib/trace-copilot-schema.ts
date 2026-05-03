import { z } from "zod";

/** Structured trace explanation — validated before returning to UI. */
export const traceCopilotSchema = z.object({
  summary: z
    .string()
    .describe("2–4 sentences: what this trace shows in plain language."),
  likelyStory: z
    .string()
    .describe("Best-effort narrative of request flow; caveats if uncertain."),
  timelineBullets: z
    .array(z.string())
    .max(10)
    .describe("Ordered bullets matching trace time order where possible."),
  hotspots: z
    .array(z.string())
    .max(6)
    .describe("Notable spans: errors, high latency, or critical hops."),
  suggestedChecks: z
    .array(z.string())
    .max(8)
    .describe("Concrete things an engineer should verify next."),
  caveat: z
    .string()
    .describe("One short line on limits (missing spans, no logs here, etc.)."),
});

export type TraceCopilotBrief = z.infer<typeof traceCopilotSchema>;
