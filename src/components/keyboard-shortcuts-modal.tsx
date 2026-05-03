"use client";

import { useEffect } from "react";

type KeyboardShortcutsModalProps = {
  open: boolean;
  onClose: () => void;
};

const ROWS: { keys: string; label: string }[] = [
  { keys: "⌘ K", label: "Open command palette (Ctrl+K on Windows/Linux)" },
  { keys: "?", label: "Show this shortcut list (Shift+/)" },
  { keys: "Esc", label: "Close palette or this dialog" },
  {
    keys: "⌘ ↵",
    label: "Run Explore query from an input or the query editor (Ctrl+Enter)",
  },
];

export function KeyboardShortcutsModal({
  open,
  onClose,
}: KeyboardShortcutsModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pulse-shortcuts-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pulse-card max-h-[min(520px,85vh)] w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.08] bg-slate-950/95 shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <h2
            id="pulse-shortcuts-title"
            className="text-sm font-semibold tracking-tight text-zinc-100"
          >
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-xs text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-300"
          >
            Close
          </button>
        </div>
        <ul className="divide-y divide-white/[0.05] px-2 py-2">
          {ROWS.map((row) => (
            <li
              key={row.label}
              className="flex items-start justify-between gap-4 px-3 py-3"
            >
              <kbd className="shrink-0 rounded-lg border border-white/[0.1] bg-white/[0.05] px-2 py-1 font-mono text-[11px] font-medium text-orange-200/95">
                {row.keys}
              </kbd>
              <span className="text-right text-[13px] leading-snug text-zinc-400">
                {row.label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return el.isContentEditable;
}

/** Toggle help with Shift+/ (`?`) when not typing in a field. */
export function useKeyboardShortcutsShortcut(setOpen: (open: boolean) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "?" || isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);
}
