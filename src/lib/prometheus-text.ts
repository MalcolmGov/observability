import { serviceFromLabels } from "@/lib/service";

/** Parse Prometheus exposition format lines into pulse metric rows. */
export function parsePrometheusText(
  text: string,
  defaultLabels: Record<string, string> = {},
) {
  const out: {
    name: string;
    value: number;
    timestamp: number;
    labels: Record<string, string>;
    service: string;
  }[] = [];

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;

    let namePart: string;
    let labelStr: string | null = null;
    let afterBrace: string;

    const open = t.indexOf("{");
    if (open >= 0) {
      const close = t.indexOf("}", open);
      if (close < 0) continue;
      namePart = t.slice(0, open).trim();
      labelStr = t.slice(open + 1, close);
      afterBrace = t.slice(close + 1).trim();
    } else {
      const sp = t.indexOf(" ");
      if (sp < 0) continue;
      namePart = t.slice(0, sp).trim();
      afterBrace = t.slice(sp + 1).trim();
    }

    if (!namePart) continue;

    const tokens = afterBrace.split(/\s+/).filter(Boolean);
    if (tokens.length < 1) continue;

    const valueStr = tokens[0];
    const tsRaw = tokens[1];

    const lv = valueStr.toLowerCase();
    if (
      valueStr === "NaN" ||
      lv === "inf" ||
      lv === "+inf" ||
      lv === "-inf"
    ) {
      continue;
    }

    const value = Number(valueStr);
    if (!Number.isFinite(value)) continue;

    let timestamp = Date.now();
    if (tsRaw !== undefined && /^\d+$/.test(tsRaw)) {
      const n = Number(tsRaw);
      timestamp = n > 1_000_000_000_000 ? n : n * 1000;
    }

    const labels: Record<string, string> = { ...defaultLabels };
    if (labelStr !== null && labelStr.length > 0) {
      const parsed = parsePrometheusLabels(labelStr);
      Object.assign(labels, parsed);
    }

    out.push({
      name: namePart,
      value,
      timestamp,
      labels,
      service: serviceFromLabels(labels),
    });
  }

  return out;
}

function parsePrometheusLabels(s: string): Record<string, string> {
  const labels: Record<string, string> = {};
  const re =
    /([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*"((?:[^\\"]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const key = m[1];
    const raw = m[2];
    labels[key] = raw
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\")
      .replace(/\\n/g, "\n");
  }
  return labels;
}
