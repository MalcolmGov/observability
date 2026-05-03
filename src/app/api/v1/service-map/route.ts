import { queryAll } from "@/db/client";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sinceMs = Number(searchParams.get("sinceMs"));
  const since =
    Number.isFinite(sinceMs) && sinceMs > 0
      ? sinceMs
      : Date.now() - 60 * 60 * 1000;

  const peerEdges = await queryAll<{ source: string; target: string; weight: number }>(
    `
      SELECT service AS source, peer_service AS target, COUNT(*) AS weight
      FROM trace_spans
      WHERE start_ts >= ?
        AND peer_service IS NOT NULL
        AND TRIM(peer_service) != ''
      GROUP BY service, peer_service
    `,
    [since],
  );

  const crossEdges = await queryAll<{ source: string; target: string; weight: number }>(
    `
      SELECT
        p.service AS source,
        c.service AS target,
        COUNT(*) AS weight
      FROM trace_spans c
      JOIN trace_spans p ON p.span_id = c.parent_span_id
      WHERE c.start_ts >= ?
        AND p.service IS NOT NULL
        AND c.service IS NOT NULL
        AND p.service != c.service
      GROUP BY p.service, c.service
    `,
    [since],
  );

  const merged = new Map<
    string,
    { source: string; target: string; weight: number }
  >();
  for (const e of [...peerEdges, ...crossEdges]) {
    const k = `${e.source}\0${e.target}`;
    const prev = merged.get(k);
    merged.set(k, {
      source: e.source,
      target: e.target,
      weight: (prev?.weight ?? 0) + Number(e.weight),
    });
  }

  const edges = [...merged.values()].sort((a, b) => b.weight - a.weight);

  const nodes = new Set<string>();
  for (const e of edges) {
    nodes.add(e.source);
    nodes.add(e.target);
  }

  return NextResponse.json({
    since,
    nodes: [...nodes].sort(),
    edges,
  });
}
