import { headers } from "next/headers";

export function getNlClientIdFromRequest(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const vf = req.headers.get("x-vercel-forwarded-for")?.trim();
  if (vf) return vf.split(",")[0]?.trim() ?? vf;
  return req.headers.get("x-vercel-id") ?? "unknown";
}

export async function getNlClientIdFromServerAction(): Promise<string> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    if (fwd) {
      const first = fwd.split(",")[0]?.trim();
      if (first) return first;
    }
    const realIp = h.get("x-real-ip")?.trim();
    if (realIp) return realIp;
    return h.get("x-vercel-id") ?? "unknown";
  } catch {
    return "unknown";
  }
}
