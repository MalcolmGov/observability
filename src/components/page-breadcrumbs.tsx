"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";

const SEGMENT_LABELS: Record<string, string> = {
  briefing: "Briefing",
  catalog: "App catalog",
  services: "Services",
  metrics: "Metrics",
  logs: "Logs",
  map: "Service map",
  traces: "Traces",
  alerts: "Alerts",
  overview: "Overview",
};

export function PageBreadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  const crumbs: { href: string; label: string }[] = [
    { href: "/", label: "Dashboard" },
  ];

  let pathAcc = "";
  for (const seg of segments) {
    pathAcc += `/${seg}`;
    const human =
      SEGMENT_LABELS[seg] ??
      (seg.match(/^[a-f0-9-]{16,}$/i)
        ? `Trace ${seg.slice(0, 8)}…`
        : seg.length > 28
          ? `${seg.slice(0, 14)}…`
          : seg);
    crumbs.push({ href: pathAcc, label: human });
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-[11px] text-zinc-500"
    >
      {crumbs.map((c, idx) => (
        <Fragment key={c.href}>
          {idx > 0 ? (
            <span className="text-zinc-700" aria-hidden>
              /
            </span>
          ) : null}
          {idx === crumbs.length - 1 ? (
            <span className="truncate font-medium text-zinc-300">{c.label}</span>
          ) : (
            <Link
              href={c.href}
              className="truncate text-zinc-500 transition hover:text-violet-300"
            >
              {c.label}
            </Link>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
