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

  const items = useMemo(() => {
    const n = normalize(q);
    const base = PULSE_PRIMARY_NAV.map((item) => ({
      kind: "nav" as const,
      href: item.href,
      title: item.label,
      subtitle: item.desc,
      haystack: normalize(
        `${item.label} ${item.desc} ${item.keywords ?? ""}`,
      ),
    }));
    return n === "" ? base : base.filter((x) => x.haystack.includes(n));
  }, [q]);

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
    (href: string) => {
      router.push(href);
      onClose();
    },
    [onClose, router],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, Math.max(0, items.length - 1)));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter" && items[active]) {
        e.preventDefault();
        go(items[active].href);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, go, items, onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center px-3 pt-[min(18vh,140px)] sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-[81] w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.12] bg-slate-950/95 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.65)] ring-1 ring-white/[0.06]">
        <div className="border-b border-white/[0.08] px-3 py-2">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Go to…"
            className="w-full rounded-lg border border-transparent bg-transparent px-2 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
          />
          <p className="px-2 pb-1 text-[10px] text-zinc-600">
            ↑↓ navigate · ↵ open · esc close
          </p>
        </div>
        <ul className="max-h-[min(52vh,380px)] overflow-y-auto py-1">
          {items.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-zinc-500">
              No matches
            </li>
          ) : (
            items.map((item, i) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={(e) => {
                    e.preventDefault();
                    go(item.href);
                  }}
                  className={`flex flex-col gap-0.5 px-4 py-2.5 text-left transition ${
                    i === active
                      ? "bg-violet-500/15 text-zinc-50"
                      : "text-zinc-300 hover:bg-white/[0.04]"
                  }`}
                  onMouseEnter={() => setActive(i)}
                >
                  <span className="text-sm font-medium">{item.title}</span>
                  <span className="text-[11px] text-zinc-500">
                    {item.subtitle}
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
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
