import { z } from "zod";

/** Structured executive brief — model output validated before UI. */
export const opsBriefSchema = z.object({
  headline: z
    .string()
    .describe("One compelling headline for executives (max ~120 chars)."),
  narrative: z
    .string()
    .describe("2–4 sentences in plain language; only facts supported by the snapshot."),
  risks: z.array(z.string()).max(5).describe("Concrete risk bullets tied to data."),
  actions: z
    .array(z.string())
    .max(5)
    .describe("Specific next steps an operator or leader could take."),
  boardTalkingPoint: z
    .string()
    .describe("Single sentence suitable for a board or investor slide."),
});

export type OpsBrief = z.infer<typeof opsBriefSchema>;
