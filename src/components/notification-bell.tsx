"use client";

import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SVGProps,
} from "react";

const POLL_MS = 30_000;
const LAST_SEEN_KEY = "pulse.notifications.lastSeenMs";

type Severity = "info" | "warning" | "critical";

type Notification = {
  ruleId: number;
  ruleName: string;
  service: string;
  severity: Severity;
  metricName: string | null;
  comparator: string | null;
  threshold: number | null;
  observedAvg: number | null;
  marketScope: string | null;
  environment: string;
  runbookUrl: string | null;
  evaluatedAtMs: number;
};

function IconBell(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
      />
    </svg>
  );
}

function readLastSeen(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(LAST_SEEN_KEY);
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeLastSeen(ms: number): void {
  try {
    localStorage.setItem(LAST_SEEN_KEY, String(ms));
  } catch {
    /* ignore quota / private mode */
  }
}

function severityChipClass(s: Severity): string {
  if (s === "critical") return "pulse-chip pulse-chip-danger";
  if (s === "warning") return "pulse-chip pulse-chip-warning";
  return "pulse-chip pulse-chip-info";
}

function severityDotClass(s: Severity): string {
  if (s === "critical") return "pulse-status-dot-danger";
  if (s === "warning") return "pulse-status-dot-warning";
  return "pulse-status-dot-info";
}

function formatThreshold(n: Notification): string | null {
  if (n.threshold == null || !n.comparator) return null;
  const cmp = n.comparator === "gt" ? ">" : "<";
  const val =
    n.observedAvg != null
      ? `${n.observedAvg.toFixed(1)} ${cmp} ${n.threshold}`
      : `${cmp} ${n.threshold}`;
  return val;
}

export function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSeenMs, setLastSeenMs] = useState<number>(0);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Hydrate last-seen from localStorage on mount.
  useEffect(() => {
    setLastSeenMs(readLastSeen());
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/alerts/notifications", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("notifications fetch failed");
      const data = (await res.json()) as { notifications: Notification[] };
      setItems(data.notifications ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  // Click-outside + Esc to close.
  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      const t = e.target as Node | null;
      if (
        t &&
        !panelRef.current?.contains(t) &&
        !buttonRef.current?.contains(t)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unreadCount = useMemo(
    () => items.filter((i) => i.evaluatedAtMs > lastSeenMs).length,
    [items, lastSeenMs],
  );

  function markAllRead() {
    const max = items.reduce(
      (acc, i) => (i.evaluatedAtMs > acc ? i.evaluatedAtMs : acc),
      Date.now(),
    );
    writeLastSeen(max);
    setLastSeenMs(max);
  }

  function toggle() {
    setOpen((o) => {
      const next = !o;
      // Mark as read when the panel opens (industry-standard UX).
      if (next) {
        const max = items.reduce(
          (acc, i) => (i.evaluatedAtMs > acc ? i.evaluatedAtMs : acc),
          Date.now(),
        );
        writeLastSeen(max);
        // Defer state update so the unread count doesn't disappear before
        // the panel has rendered (no awkward badge-flicker on open).
        window.setTimeout(() => setLastSeenMs(max), 220);
      }
      return next;
    });
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          unreadCount > 0
            ? `Notifications (${unreadCount} unread)`
            : "Notifications"
        }
        className="pulse-transition relative flex size-9 items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.04] text-zinc-300 hover:border-white/[0.18] hover:bg-white/[0.07] hover:text-white"
      >
        <IconBell className="size-[18px]" aria-hidden />
        {unreadCount > 0 ? (
          <span
            className="pulse-mono-num absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white shadow-md"
            style={{
              background: "var(--pulse-status-danger-fg)",
              boxShadow: "0 0 0 2px var(--pulse-bg-deep), 0 0 10px var(--pulse-status-danger-glow)",
            }}
            aria-hidden
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notifications"
          className="pulse-card pulse-fade-in absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(92vw,22rem)] overflow-hidden p-0"
          style={{ boxShadow: "0 30px 60px -20px rgba(2, 6, 23, 0.85)" }}
        >
          <div className="flex items-center justify-between border-b border-[var(--pulse-border-default)] px-4 py-3">
            <div>
              <div className="pulse-eyebrow">Notifications</div>
              <div className="mt-0.5 text-[11px] text-zinc-500">
                {items.length === 0
                  ? "All clear"
                  : `${items.length} firing rule${items.length === 1 ? "" : "s"}`}
              </div>
            </div>
            {items.length > 0 ? (
              <button
                type="button"
                onClick={markAllRead}
                className="pulse-transition rounded-md px-2 py-1 text-[11px] font-medium text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100"
              >
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="pulse-scroll max-h-[60vh] overflow-y-auto">
            {error ? (
              <div className="px-4 py-3">
                <p className="pulse-alert-error text-xs">
                  Couldn&rsquo;t refresh notifications: {error}
                </p>
              </div>
            ) : items.length === 0 ? (
              <div className="pulse-empty mx-3 my-4">
                <span
                  className="pulse-status-dot pulse-status-dot-success"
                  aria-hidden
                />
                <p className="pulse-empty-title">No alerts firing</p>
                <p className="pulse-empty-hint">
                  When a rule breaches its threshold you&rsquo;ll see it here in
                  real time.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--pulse-border-light)]">
                {items.map((n) => {
                  const isUnread = n.evaluatedAtMs > lastSeenMs;
                  const cmp = formatThreshold(n);
                  const markets = n.marketScope?.split(",").filter(Boolean);
                  return (
                    <li
                      key={`${n.ruleId}-${n.evaluatedAtMs}`}
                      className="pulse-transition group relative px-4 py-3 hover:bg-white/[0.03]"
                    >
                      {isUnread ? (
                        <span
                          className="absolute left-1.5 top-4 h-1.5 w-1.5 rounded-full"
                          style={{
                            background: "var(--pulse-status-info-fg)",
                            boxShadow:
                              "0 0 8px var(--pulse-status-info-glow)",
                          }}
                          aria-label="unread"
                        />
                      ) : null}
                      <Link
                        href={`/alerts?ruleId=${n.ruleId}`}
                        onClick={() => setOpen(false)}
                        className="block focus:outline-none"
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className={`pulse-status-dot ${severityDotClass(n.severity)} mt-1.5 shrink-0`}
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="pulse-title truncate text-zinc-100 group-hover:text-white">
                                {n.ruleName}
                              </span>
                              <span
                                className={severityChipClass(n.severity)}
                                style={{ padding: "1px 8px", fontSize: 10 }}
                              >
                                {n.severity}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-500">
                              <span className="truncate">{n.service}</span>
                              {n.environment !== "prod" ? (
                                <>
                                  <span className="text-zinc-700">·</span>
                                  <span className="uppercase tracking-wide">
                                    {n.environment}
                                  </span>
                                </>
                              ) : null}
                              <span className="text-zinc-700">·</span>
                              <span title={new Date(n.evaluatedAtMs).toISOString()}>
                                {formatDistanceToNow(
                                  new Date(n.evaluatedAtMs),
                                  { addSuffix: true },
                                )}
                              </span>
                            </div>
                            {(cmp || (markets && markets.length > 0)) && (
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                                {cmp ? (
                                  <span className="pulse-mono-num rounded-md bg-white/[0.04] px-1.5 py-0.5 text-zinc-300">
                                    {cmp}
                                  </span>
                                ) : null}
                                {markets?.slice(0, 4).map((m) => (
                                  <span
                                    key={m}
                                    className="rounded-md border border-[var(--pulse-border-default)] bg-white/[0.02] px-1.5 py-0.5 font-medium tracking-wide text-zinc-400"
                                  >
                                    {m}
                                  </span>
                                ))}
                                {markets && markets.length > 4 ? (
                                  <span className="text-zinc-500">
                                    +{markets.length - 4}
                                  </span>
                                ) : null}
                              </div>
                            )}
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-[var(--pulse-border-default)] bg-white/[0.015] px-4 py-2.5">
            <Link
              href="/alerts"
              onClick={() => setOpen(false)}
              className="pulse-link text-[11px]"
            >
              View all alerts &rarr;
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
