"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import {
  CommandPalette,
  useCommandPaletteShortcut,
} from "@/components/command-palette";
import {
  KeyboardShortcutsModal,
  useKeyboardShortcutsShortcut,
} from "@/components/keyboard-shortcuts-modal";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import {
  IconAlerts,
  IconBriefing,
  IconCatalog,
  IconDashboard,
  IconExplore,
  IconLogs,
  IconMap,
  IconMetrics,
  IconMoon,
  IconServices,
  IconSun,
  IconTraces,
} from "@/components/nav-icons";
import { usePulseTheme } from "@/components/theme-context";
import { PULSE_PRIMARY_NAV } from "@/lib/pulse-nav";

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
      className={`pulse-theme-toggle rounded-xl transition duration-200 ${className}`}
      title={light ? "Dark mode" : "Light mode"}
      aria-label={light ? "Switch to dark theme" : "Switch to light theme"}
      aria-pressed={light}
    >
      {light ? (
        <IconMoon className="size-[22px]" aria-hidden />
      ) : (
        <IconSun className="size-[22px]" aria-hidden />
      )}
      <span className="sr-only">{light ? "Dark mode" : "Light mode"}</span>
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

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const sectionLabel = topBarSectionLabel(pathname);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);
  useCommandPaletteShortcut(setPaletteOpen);
  useKeyboardShortcutsShortcut(setShortcutsOpen);

  return (
    <div className="flex min-h-full">
      <KeyboardShortcutsModal open={shortcutsOpen} onClose={closeShortcuts} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />

      <aside className="pulse-sidebar" aria-label="Pulse navigation">
        <Link
          href="/"
          className="pulse-logo-wrap"
          title="Pulse — Observability home"
        >
          <span className="pulse-logo-letter text-[13px] font-bold tracking-tight text-white drop-shadow-sm">
            P
          </span>
        </Link>
        <nav
          className="mt-8 flex flex-1 flex-col items-center gap-1.5 px-1"
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
                className={`pulse-nav-btn ${active ? "pulse-nav-btn-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="size-[22px]" aria-hidden />
                <span className="sr-only">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mx-auto mt-auto flex flex-col items-center gap-2 px-1 pb-1">
          <ThemeToggle className="pulse-nav-btn flex size-11 items-center justify-center" />
          <span className="pulse-badge block max-w-[3.25rem] truncate leading-tight">
            Local
          </span>
        </div>
      </aside>

      <div className="flex min-h-full min-w-0 flex-1 flex-col">
        <header className="pulse-mobile-header sticky top-0 z-10 flex items-center gap-2 border-b border-white/[0.06] bg-slate-950/85 px-3 py-3 backdrop-blur-xl md:hidden">
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600/40 to-cyan-500/25 ring-1 ring-white/15">
              <span className="pulse-mobile-brand-mark text-xs font-bold text-white">
                P
              </span>
            </div>
            <div className="text-sm font-semibold tracking-tight text-white">
              Pulse
            </div>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-[10px] font-medium text-zinc-300"
              aria-label="Open command palette"
            >
              ⌘K
            </button>
            <ThemeToggle className="flex size-9 shrink-0 items-center justify-center" />
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
                        ? "pulse-mobile-nav-active bg-gradient-to-br from-violet-500/35 to-cyan-500/15 text-white ring-1 ring-white/15"
                        : "bg-white/[0.06] text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
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

        <header
          className="pulse-desktop-header sticky top-0 z-10 hidden shrink-0 flex-col border-b border-white/[0.06] bg-slate-950/85 backdrop-blur-xl md:flex"
          aria-label="Application bar"
        >
          <div className="flex h-11 min-h-[2.75rem] items-center justify-between gap-3 px-4 xl:px-5">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600/40 to-cyan-500/25 ring-1 ring-white/15">
                <span className="pulse-mobile-brand-mark text-[11px] font-bold text-white">
                  P
                </span>
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="shrink-0 text-sm font-semibold tracking-tight text-white">
                    Pulse
                  </span>
                  <span className="text-zinc-600" aria-hidden>
                    /
                  </span>
                  <span className="truncate text-sm font-medium text-zinc-300">
                    {sectionLabel}
                  </span>
                </div>
                <div className="hidden min-w-0 sm:block">
                  <PageBreadcrumbs />
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setShortcutsOpen(true)}
                className="hidden rounded-xl border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-zinc-500 transition hover:border-white/[0.12] hover:text-zinc-300 lg:block"
                title="Keyboard shortcuts"
              >
                <kbd className="rounded border border-white/[0.08] bg-slate-950/80 px-1 font-mono text-[10px]">
                  ?
                </kbd>
              </button>
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="hidden rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-left text-xs text-zinc-400 shadow-inner shadow-slate-950/30 transition hover:border-white/[0.14] hover:bg-white/[0.06] sm:block sm:min-w-[9rem]"
              >
                <span className="text-zinc-500">Jump to…</span>{" "}
                <kbd className="ml-1 rounded border border-white/[0.08] bg-slate-950/80 px-1 font-mono text-[10px] text-zinc-500">
                  ⌘K
                </kbd>
              </button>
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="flex size-9 items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.04] text-[10px] font-medium text-zinc-400 sm:hidden"
                aria-label="Open command palette"
              >
                ⌘K
              </button>
              <ThemeToggle className="flex size-9 shrink-0 items-center justify-center" />
            </div>
          </div>
          <div className="border-t border-white/[0.04] px-4 py-1.5 sm:hidden">
            <PageBreadcrumbs />
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
  );
}
