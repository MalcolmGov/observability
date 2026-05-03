"use client";

import { useEffect, useRef } from "react";

/** Polls `fn` every `intervalMs` while `enabled` and component mounted. */
export function useLiveRefresh(
  enabled: boolean,
  intervalMs: number,
  fn: () => void | Promise<void>,
) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled || intervalMs < 1000) return;

    const tick = () => void fnRef.current();
    const id = window.setInterval(tick, intervalMs);
    tick();
    return () => window.clearInterval(id);
  }, [enabled, intervalMs]);
}
