"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AiAssistantPanel } from "@/components/ai-assistant-panel";
import {
  CommandPalette,
  useCommandPaletteShortcut,
} from "@/components/command-palette";
import {
  KeyboardShortcutsModal,
  useKeyboardShortcutsShortcut,
} from "@/components/keyboard-shortcuts-modal";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { PulseLogo } from "@/components/logo";
import {
  IconAlerts,
  IconBriefing,
  IconCatalog,
  IconDashboard,
  IconExplore,
  IconIntegrations,
  IconLogs,
  IconMap,
  IconMetrics,
  IconMoon,
  IconServices,
  IconSun,
  IconTraces,
} from "@/components/nav-icons";
import { NotificationBell } from "@/components/notification-bell";
import { usePulseTheme } from "@/components/theme-context";
import { PULSE_PRIMARY_NAV } from "@/lib/pulse-nav";
import { useSystemHealth } from "@/hooks/use-system-health";

function SystemHealthBadge() {
  const h = useSystemHealth();
  if (h.status === "loading" || h.services === 0) return null;
  const isOk = h.status === "ok";
  const isCrit = h.status === "critical";
  const isDeg = h.status === "degraded";
  const label = isCrit
    ? `${h.critical} critical`
    : isDeg
      ? `${h.degraded} degraded`
      : `${h.services} healthy`;
  const dotClass = isCrit
    ? "bg-red-400"
    : isDeg
      ? "bg-amber-400"
      : "bg-emerald-400";
  const chipStyle = isCrit
    ? { border: '1px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.08)', color: '#fca5a5' }
    : isDeg
      ? { border: '1px solid rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.08)', color: '#fcd34d' }
      : { border: '1px solid rgba(52,211,153,0.25)', background: 'rgba(52,211,153,0.06)', color: '#6ee7b7' };
  return (
    <span
      className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium lg:flex"
      style={chipStyle}
      title={`${h.healthy} healthy · ${h.degraded} degraded · ${h.critical} critical`}
    >
      <span className="relative flex size-1.5">
        <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${dotClass} ${isCrit || isDeg ? 'animate-ping' : ''}`} />
        <span className={`relative inline-flex size-1.5 rounded-full ${dotClass}`} />
      </span>
      {isOk ? 'All systems operational' : label}
    </span>
  );
}

const NAV_ICONS = [
  IconBriefing,
  IconDashboard,
  IconServices,
  IconCatalog,
  IconExplore,
  IconMetrics,
  IconLogs,
  IconMap,
  IconTraces,
  IconAlerts,
  IconIntegrations,
] as const;

const nav = PULSE_PRIMARY_NAV.map((item, i) => ({
  ...item,
  Icon: NAV_ICONS[i],
}));

function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = usePulseTheme();
  const light = theme === "light";
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`pulse-nav-item ${className}`}
      title={light ? "Dark mode" : "Light mode"}
      aria-label={light ? "Switch to dark theme" : "Switch to light theme"}
      aria-pressed={light}
    >
      {light ? (
        <IconMoon className="pulse-nav-item-icon size-[20px]" aria-hidden />
      ) : (
        <IconSun className="pulse-nav-item-icon size-[20px]" aria-hidden />
      )}
      <span className="pulse-nav-label sr-only-when-collapsed">
        {light ? "Dark mode" : "Light mode"}
      </span>
    </button>
  );
}

function isNavActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const EXTRA_ROUTE_LABELS: Record<string, string> = {
  "/overview": "Overview",
};

function topBarSectionLabel(pathname: string): string {
  const extra = EXTRA_ROUTE_LABELS[pathname];
  if (extra) return extra;
  const item = nav.find((n) => isNavActive(pathname, n.href));
  return item?.label ?? "Observability";
}

/** Magnifier icon for search bar */
function IconSearch(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} {...props}>
      <circle cx="9" cy="9" r="5.5" />
      <path strokeLinecap="round" d="M13.5 13.5L17 17" />
    </svg>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const sectionLabel = topBarSectionLabel(pathname);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [timeStr, setTimeStr] = useState("");
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);
  useCommandPaletteShortcut(setPaletteOpen);
  useKeyboardShortcutsShortcut(setShortcutsOpen);

  // Tick clock in topbar
  useEffect(() => {
    function tick() {
      setTimeStr(
        new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(new Date()),
      );
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
    <div className="flex min-h-full">
      <KeyboardShortcutsModal open={shortcutsOpen} onClose={closeShortcuts} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />

      {/* ──────────── DESKTOP SIDEBAR ──────────── */}
      <aside
        className="pulse-sidebar-rail"
        aria-label="Pulse navigation"
      >
        {/* Logo */}
        <Link
          href="/"
          className="mx-auto mb-1 flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-white/[0.04]"
          title="Pulse — Observability home"
          style={{ minWidth: 0 }}
        >
          <PulseLogo size={26} className="pulse-nav-item-icon shrink-0" />
          <span
            className="pulse-nav-label text-[15px] font-bold tracking-tight"
            style={{ letterSpacing: "-0.03em", color: "#06d6c7" }}
          >
            Pulse
          </span>
        </Link>

        {/* Primary nav */}
        <nav
          className="mt-6 flex flex-1 flex-col gap-0.5 px-1.5"
          aria-label="Primary"
        >
          {nav.map((item) => {
            const active = isNavActive(pathname, item.href);
            const Icon = item.Icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={`${item.label} — ${item.desc}`}
                className={`pulse-nav-item ${active ? "pulse-nav-item-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="pulse-nav-item-icon size-[20px]" aria-hidden />
                <span className="pulse-nav-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Bottom controls */}
        <div className="mt-auto flex flex-col gap-0.5 px-1.5 pb-1">
          {/* Theme toggle */}
          <ThemeToggle />
          {/* Environment chip (collapsed = dot only, expanded = label) */}
          <div className="flex items-center gap-3 rounded-xl px-2.5 py-2">
            <span className="pulse-nav-item-icon relative flex shrink-0 items-center justify-center">
              <span className="pulse-env-dot" />
            </span>
            <span className="pulse-nav-label text-[10px] font-semibold tracking-widest text-emerald-400">
              LOCAL DEV
            </span>
          </div>
        </div>
      </aside>

      {/* ──────────── MAIN COLUMN ──────────── */}
      <div className="flex min-h-full min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-[#04080f]/90 px-3 py-3 backdrop-blur-xl md:hidden" style={{ borderColor: 'rgba(56,189,248,0.07)' }}>
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-xl ring-1" style={{ background: 'linear-gradient(135deg,rgba(6,214,199,0.35),rgba(56,189,248,0.28),rgba(59,130,246,0.22))', borderColor: 'rgba(6,214,199,0.22)' }}>
              <PulseLogo size={18} />
            </div>
            <span className="text-sm font-bold tracking-tight" style={{ letterSpacing: "-0.03em", color: '#06d6c7' }}>Pulse</span>
          </Link>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-[10px] font-medium text-zinc-300"
              aria-label="Open command palette"
            >
              ⌘K
            </button>
            <div className="flex max-w-[min(520px,70vw)] gap-1 overflow-x-auto pb-1 pulse-scroll">
              {nav.map((item) => {
                const active = isNavActive(pathname, item.href);
                const Icon = item.Icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    aria-current={active ? "page" : undefined}
                    className={`flex size-9 shrink-0 items-center justify-center rounded-xl transition ${
                      active
                      ? "bg-gradient-to-br from-cyan-500/25 to-sky-500/12 text-cyan-300 ring-1 ring-cyan-400/20"
                      : "bg-white/[0.05] text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                    }`}
                  >
                    <Icon className="size-5" aria-hidden />
                    <span className="sr-only">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </header>

        {/* ── Desktop topbar ── */}
        <header
          className="pulse-topbar"
          aria-label="Application bar"
        >
          <div className="flex h-12 min-h-[3rem] items-center justify-between gap-4 px-4 xl:px-5">
            {/* Left: breadcrumb area */}
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {/* Section + breadcrumb */}
              <div className="flex min-w-0 flex-col">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    {sectionLabel}
                  </span>
                </div>
                <div className="hidden min-w-0 sm:block">
                  <PageBreadcrumbs />
                </div>
              </div>
            </div>

            {/* Right: controls */}
            <div className="flex shrink-0 items-center gap-2.5">
              {/* Live time */}
              {timeStr && (
                <span className="hidden font-mono text-[11px] tabular-nums text-zinc-600 lg:block">
                  {timeStr}
                </span>
              )}

              {/* System health badge */}
              <SystemHealthBadge />

              {/* Env chip */}
              <span className="pulse-env-chip hidden sm:inline-flex">
                <span className="relative flex">
                  <span className="pulse-env-dot" />
                  <span className="pulse-env-dot pulse-env-dot-ping absolute inset-0 opacity-60" />
                </span>
                Local Dev
              </span>

              {/* Shortcuts hint */}
              <button
                type="button"
                onClick={() => setShortcutsOpen(true)}
                className="hidden rounded-lg border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[11px] text-zinc-600 transition hover:border-white/[0.12] hover:text-zinc-300 lg:block"
                title="Keyboard shortcuts"
              >
                <kbd className="rounded border border-white/[0.07] bg-slate-950/60 px-1 font-mono text-[10px]">
                  ?
                </kbd>
              </button>

              {/* Search / command palette */}
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="pulse-search-bar hidden sm:flex"
                aria-label="Open command palette (⌘K)"
              >
                <IconSearch className="size-3.5 shrink-0 text-zinc-600" />
                <span className="flex-1 text-left text-[12px] text-zinc-600">
                  Jump to…
                </span>
                <kbd className="ml-1 shrink-0 rounded border border-white/[0.07] bg-slate-950/60 px-1 font-mono text-[10px] text-zinc-600">
                  ⌘K
                </kbd>
              </button>

              {/* Mobile palette button */}
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="flex size-9 items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.04] text-[10px] font-medium text-zinc-400 sm:hidden"
                aria-label="Open command palette"
              >
                ⌘K
              </button>

              {/* AI Assistant button */}
              <button
                type="button"
                onClick={() => setAiOpen(true)}
                className="hidden items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all lg:flex"
                style={{ background: "rgba(6,214,199,0.08)", border: "1px solid rgba(6,214,199,0.22)", color: "#06d6c7" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(6,214,199,0.16)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(6,214,199,0.08)"; }}
                title="Open Pulse AI Assistant"
              >
                <span>✨</span>
                <span>Ask AI</span>
              </button>
              {/* Mobile AI button */}
              <button
                type="button"
                onClick={() => setAiOpen(true)}
                className="flex size-9 items-center justify-center rounded-xl border text-sm lg:hidden"
                style={{ background: "rgba(6,214,199,0.08)", border: "1px solid rgba(6,214,199,0.22)" }}
                title="Pulse AI"
              >
                ✨
              </button>

              <NotificationBell />
            </div>
          </div>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="flex flex-1 flex-col outline-none"
        >
          {children}
        </main>
      </div>
    </div>

    {/* Global AI Assistant */}
    {aiOpen && <AiAssistantPanel onClose={() => setAiOpen(false)} />}
    </>
  );
}
