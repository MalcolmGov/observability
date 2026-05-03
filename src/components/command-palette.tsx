"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { PULSE_PRIMARY_NAV } from "@/lib/pulse-nav";

type Cmd = {
  kind: "nav" | "action";
  href?: string;
  title: string;
  subtitle: string;
  haystack: string;
  icon?: string;
  onSelect?: () => void;
};

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
};

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  const items = useMemo<Cmd[]>(() => {
    const n = normalize(q);
    const navItems: Cmd[] = PULSE_PRIMARY_NAV.map((item) => ({
      kind: "nav" as const,
      href: item.href,
      title: item.label,
      subtitle: item.desc,
      icon: "→",
      haystack: normalize(`${item.label} ${item.desc} ${item.keywords ?? ""}`),
    }));
    const actions: Cmd[] = [
      {
        kind: "action" as const,
        title: "Load demo data",
        subtitle: "Seed all services, metrics, traces and logs",
        icon: "▶",
        haystack: "demo seed data load populate",
        onSelect: () => {
          void fetch("/api/v1/demo/seed", { method: "POST" });
          onClose();
        },
      },
      {
        kind: "action" as const,
        title: "Refresh page",
        subtitle: "Hard-reload the current page",
        icon: "↺",
        haystack: "refresh reload",
        onSelect: () => { window.location.reload(); },
      },
    ];
    const all = [...navItems, ...actions];
    return n === "" ? all : all.filter((x) => x.haystack.includes(n));
  }, [q, onClose]);

  useEffect(() => {
    setActive(0);
  }, [q]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setActive(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => window.clearTimeout(t);
  }, [open]);

  const go = useCallback(
    (item: Cmd) => {
      if (item.onSelect) {
        item.onSelect();
      } else if (item.href) {
        router.push(item.href);
        onClose();
      }
    },
    [onClose, router],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, Math.max(0, items.length - 1))); }
      if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
      if (e.key === "Enter" && items[active]) { e.preventDefault(); go(items[active]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, go, items, onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center px-3 pt-[min(14vh,120px)] sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-[81] w-full max-w-xl overflow-hidden rounded-2xl shadow-[0_32px_80px_-12px_rgba(0,0,0,0.7)]" style={{ border: '1px solid rgba(6,214,199,0.18)', background: 'rgba(4,8,15,0.97)', backdropFilter: 'blur(24px)' }}>
        {/* Search header */}
        <div className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="rgba(6,214,199,0.6)" strokeWidth="1.5">
            <circle cx="9" cy="9" r="5.5" /><path strokeLinecap="round" d="M13.5 13.5L17 17" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search pages and actions…"
            className="flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
          />
          <kbd className="shrink-0 rounded border border-white/[0.08] bg-slate-950/60 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600">esc</kbd>
        </div>

        {/* Results */}
        <ul className="max-h-[min(52vh,420px)] overflow-y-auto py-1.5">
          {items.length === 0 ? (
            <li className="px-4 py-10 text-center text-sm text-zinc-600">No matches for &ldquo;{q}&rdquo;</li>
          ) : (
            items.map((item, i) => (
              <li key={`${item.kind}-${item.title}`}>
                {item.href ? (
                  <Link
                    href={item.href}
                    onClick={(e) => { e.preventDefault(); go(item); }}
                    className={`flex items-center gap-3 px-4 py-2.5 transition ${
                      i === active
                        ? "text-zinc-50" : "text-zinc-400 hover:text-zinc-200"
                    }`}
                    style={i === active ? { background: 'rgba(6,214,199,0.10)', borderLeft: '2px solid rgba(6,214,199,0.6)' } : { borderLeft: '2px solid transparent' }}
                    onMouseEnter={() => setActive(i)}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg text-sm" style={{ background: i === active ? 'rgba(6,214,199,0.12)' : 'rgba(255,255,255,0.04)', color: i === active ? '#06d6c7' : '#71717a' }}>{item.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{item.title}</span>
                      <span className="block text-[11px] text-zinc-600">{item.subtitle}</span>
                    </span>
                    {i === active && <span className="text-[10px] text-zinc-700">↵</span>}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => go(item)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 transition ${
                      i === active ? "text-zinc-50" : "text-zinc-400 hover:text-zinc-200"
                    }`}
                    style={i === active ? { background: 'rgba(56,189,248,0.08)', borderLeft: '2px solid rgba(56,189,248,0.5)' } : { borderLeft: '2px solid transparent' }}
                    onMouseEnter={() => setActive(i)}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg text-sm" style={{ background: i === active ? 'rgba(56,189,248,0.10)' : 'rgba(255,255,255,0.04)', color: i === active ? '#38bdf8' : '#71717a' }}>{item.icon}</span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block text-sm font-medium">{item.title}</span>
                      <span className="block text-[11px] text-zinc-600">{item.subtitle}</span>
                    </span>
                    {i === active && <span className="text-[10px] text-zinc-700">↵</span>}
                  </button>
                )}
              </li>
            ))
          )}
        </ul>

        {/* Footer hint */}
        <div className="flex items-center gap-4 border-t px-4 py-2" style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}>
          <span className="text-[10px] text-zinc-700">↑↓ navigate</span>
          <span className="text-[10px] text-zinc-700">↵ select</span>
          <span className="text-[10px] text-zinc-700">esc close</span>
        </div>
      </div>
    </div>
  );
}

export function useCommandPaletteShortcut(
  setOpen: (v: boolean | ((p: boolean) => boolean)) => void,
): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);
}
