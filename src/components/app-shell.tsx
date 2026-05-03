"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconAlerts,
  IconDashboard,
  IconLogs,
  IconMap,
  IconMetrics,
  IconServices,
  IconTraces,
} from "@/components/nav-icons";

const nav = [
  { href: "/", label: "Dashboard", desc: "Command center", Icon: IconDashboard },
  { href: "/services", label: "Services", desc: "APM inventory", Icon: IconServices },
  { href: "/metrics", label: "Metrics", desc: "Explorer & ranges", Icon: IconMetrics },
  { href: "/logs", label: "Logs", desc: "Search & filters", Icon: IconLogs },
  { href: "/map", label: "Map", desc: "Service graph", Icon: IconMap },
  { href: "/traces", label: "Traces", desc: "Distributed tracing", Icon: IconTraces },
  { href: "/alerts", label: "Alerts", desc: "Detection rules", Icon: IconAlerts },
] as const;

function isNavActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-full">
      <aside className="pulse-sidebar">
        <Link
          href="/"
          className="pulse-logo-wrap"
          title="Pulse — Observability home"
        >
          <span className="text-[13px] font-bold tracking-tight text-white drop-shadow-sm">
            P
          </span>
        </Link>
        <nav className="mt-8 flex flex-1 flex-col items-center gap-1.5 px-1">
          {nav.map((item) => {
            const active = isNavActive(pathname, item.href);
            const Icon = item.Icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={`${item.label} — ${item.desc}`}
                className={`pulse-nav-btn ${active ? "pulse-nav-btn-active" : ""}`}
              >
                <Icon className="size-[22px]" aria-hidden />
                <span className="sr-only">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mx-auto mt-auto px-1 text-center">
          <span className="pulse-badge block max-w-[3.25rem] truncate leading-tight">
            Local
          </span>
        </div>
      </aside>

      <div className="flex min-h-full min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/[0.06] bg-slate-950/85 px-3 py-3 backdrop-blur-xl lg:hidden">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600/40 to-cyan-500/25 ring-1 ring-white/15">
              <span className="text-xs font-bold text-white">P</span>
            </div>
            <div className="text-sm font-semibold tracking-tight text-white">
              Pulse
            </div>
          </div>
          <div className="ml-auto flex gap-1 overflow-x-auto pb-1 pulse-scroll">
            {nav.map((item) => {
              const active = isNavActive(pathname, item.href);
              const Icon = item.Icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={`flex size-9 shrink-0 items-center justify-center rounded-xl transition ${
                    active
                      ? "bg-gradient-to-br from-violet-500/35 to-cyan-500/15 text-white ring-1 ring-white/15"
                      : "bg-white/[0.06] text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                  }`}
                >
                  <Icon className="size-5" aria-hidden />
                  <span className="sr-only">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
