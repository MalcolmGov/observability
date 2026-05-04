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
  IconGettingStarted,
  IconIncidents,
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
import { useAuth } from "@/components/auth-provider";

function PersonaSwitcher() {
  const { user, availablePersonas, switchPersona, loading } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  return (
    <div className="relative mt-2 px-1.5 pb-2">
      <button
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left transition hover:bg-white/[0.04]"
        title="Switch persona"
      >
        <img src={user.avatarUrl} alt="" className="size-6 shrink-0 rounded-full bg-zinc-800" />
        <div className="flex-1 min-w-0">
          <div className="truncate text-[12px] font-semibold text-zinc-200">{user.name}</div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">{user.role}</div>
        </div>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-1.5 z-50 mb-1 w-56 rounded-xl border border-white/[0.1] bg-[#0f172a] p-1 shadow-xl">
            <div className="px-2 py-1.5 text-[10px] font-semibold uppercase text-zinc-500">Switch Persona (RBAC)</div>
            {availablePersonas.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setOpen(false);
                  void switchPersona(p.id);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition ${
                  p.id === user.id ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"
                }`}
              >
                <img src={p.avatarUrl} alt="" className="size-6 shrink-0 rounded-full bg-zinc-800" />
                <div>
                  <div className="text-[13px] text-zinc-200">{p.name}</div>
                  <div className="text-[11px] text-zinc-500">{p.email}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

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
    ? { border: "1px solid rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.08)", color: "#fca5a5" }
    : isDeg
      ? { border: "1px solid rgba(251,191,36,0.3)", background: "rgba(251,191,36,0.08)", color: "#fcd34d" }
      : { border: "1px solid rgba(52,211,153,0.25)", background: "rgba(52,211,153,0.06)", color: "#6ee7b7" };

  const inner = (
    <>
      <span className="relative flex size-1.5">
        <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${dotClass} ${isCrit || isDeg ? "animate-ping" : ""}`} />
        <span className={`relative inline-flex size-1.5 rounded-full ${dotClass}`} />
      </span>
      {isOk ? "All systems operational" : label}
    </>
  );

  if (!isOk) {
    return (
      <Link href="/incidents"
        className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition lg:flex hover:brightness-125"
        style={chipStyle}
        title={`${h.healthy} healthy · ${h.degraded} degraded · ${h.critical} critical — click to open Incident Command`}>
        {inner}
      </Link>
    );
  }

  return (
    <span
      className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium lg:flex"
      style={chipStyle}
      title={`${h.healthy} healthy · ${h.degraded} degraded · ${h.critical} critical`}>
      {inner}
    </span>
  );
}


const NAV_ICONS = [
  IconGettingStarted,
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
  IconIncidents,
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [timeStr, setTimeStr] = useState("");
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);
  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false); }, [pathname]);
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
          <PersonaSwitcher />
        </div>
      </aside>

      {/* ──────────── MAIN COLUMN ──────────── */}
      <div className="flex min-h-full min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-[#04080f]/95 px-3 py-3 backdrop-blur-xl md:hidden" style={{ borderColor: 'rgba(56,189,248,0.07)' }}>
          {/* Hamburger */}
          <button type="button" onClick={() => setDrawerOpen(true)}
            className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-zinc-300"
            aria-label="Open navigation menu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-5">
              <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-xl ring-1" style={{ background: 'linear-gradient(135deg,rgba(6,214,199,0.35),rgba(56,189,248,0.28),rgba(59,130,246,0.22))', borderColor: 'rgba(6,214,199,0.22)' }}>
              <PulseLogo size={18} />
            </div>
            <span className="text-sm font-bold tracking-tight" style={{ letterSpacing: "-0.03em", color: '#06d6c7' }}>Pulse</span>
          </Link>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <button type="button" onClick={() => setPaletteOpen(true)}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-[10px] font-medium text-zinc-300"
              aria-label="Open command palette">⌘K</button>
            <button type="button" onClick={() => setAiOpen(true)}
              className="flex size-9 items-center justify-center rounded-xl border text-sm"
              style={{ background: "rgba(6,214,199,0.08)", border: "1px solid rgba(6,214,199,0.22)" }}
              title="Pulse AI">✨</button>
          </div>
        </header>

        {/* Mobile nav drawer */}
        {drawerOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setDrawerOpen(false)} aria-hidden />
            {/* Drawer panel */}
            <nav className="absolute left-0 top-0 flex h-full w-72 flex-col overflow-y-auto border-r"
              style={{ background: "rgba(4,8,15,0.98)", borderColor: "rgba(6,214,199,0.15)" }}
              aria-label="Mobile navigation">
              {/* Header */}
              <div className="flex items-center justify-between border-b px-4 py-4"
                style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                <Link href="/" className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-xl ring-1"
                    style={{ background: 'linear-gradient(135deg,rgba(6,214,199,0.35),rgba(56,189,248,0.28))', borderColor: 'rgba(6,214,199,0.22)' }}>
                    <PulseLogo size={18} />
                  </div>
                  <span className="text-sm font-bold" style={{ color: '#06d6c7', letterSpacing: '-0.03em' }}>Pulse</span>
                </Link>
                <button type="button" onClick={() => setDrawerOpen(false)}
                  className="flex size-8 items-center justify-center rounded-xl text-zinc-500 hover:text-zinc-200"
                  aria-label="Close navigation">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-5">
                    <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {/* Nav items */}
              <div className="flex flex-1 flex-col gap-1 px-3 py-4">
                {nav.map((item) => {
                  const active = isNavActive(pathname, item.href);
                  const Icon = item.Icon;
                  return (
                    <Link key={item.href} href={item.href}
                      className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                        active ? "text-cyan-300" : "text-zinc-400 hover:text-zinc-100"
                      }`}
                      style={active ? { background: "rgba(6,214,199,0.1)", border: "1px solid rgba(6,214,199,0.2)" } : {}}
                      aria-current={active ? "page" : undefined}>
                      <Icon className="size-5 shrink-0" aria-hidden />
                      <div className="min-w-0">
                        <div>{item.label}</div>
                        <div className="text-[11px] text-zinc-600">{item.desc}</div>
                      </div>
                    </Link>
                  );
                })}
              </div>
              {/* Footer */}
              <div className="border-t px-4 py-4" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                <div className="mb-2 text-[11px] text-zinc-600">Pulse Observability · Local Dev</div>
                <div className="mx-[-6px]">
                  <PersonaSwitcher />
                </div>
              </div>
            </nav>
          </div>
        )}

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
