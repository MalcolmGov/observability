/** OTLP trace id: 16 bytes base64 or 32-char hex. */
export function otlpTraceIdToHex(id: string | undefined): string | null {
  if (id == null || id === "") return null;
  try {
    const buf = Buffer.from(id, "base64");
    if (buf.length === 16) return buf.toString("hex");
  } catch {
    /* fall through */
  }
  const cleaned = id.replace(/^0x/i, "").toLowerCase();
  if (/^[0-9a-f]{32}$/.test(cleaned)) return cleaned;
  return null;
}

/** OTLP span id: 8 bytes base64 or 16-char hex. */
export function otlpSpanIdToHex(id: string | undefined): string | null {
  if (id == null || id === "") return null;
  try {
    const buf = Buffer.from(id, "base64");
    if (buf.length === 8) return buf.toString("hex");
  } catch {
    /* fall through */
  }
  const cleaned = id.replace(/^0x/i, "").toLowerCase();
  if (/^[0-9a-f]{16}$/.test(cleaned)) return cleaned;
  return null;
}
