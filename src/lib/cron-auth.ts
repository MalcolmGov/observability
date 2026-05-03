import { NextResponse } from "next/server";

/** Bearer token for automated jobs (e.g. Vercel Cron). */
export function requireCronSecret(req: Request): NextResponse | null {
  if (process.env.NODE_ENV !== "production") return null;

  const secret = process.env.PULSE_CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      {
        error:
          "PULSE_CRON_SECRET is not set — refuse retention in production",
      },
      { status: 503 },
    );
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

export function isCronSecretConfigured(): boolean {
  return Boolean(process.env.PULSE_CRON_SECRET?.trim());
}
