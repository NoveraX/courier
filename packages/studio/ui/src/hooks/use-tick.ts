import { useEffect } from "react";

import { useStudioStore } from "@/store";

/**
 * Single global tick provider — call once in root layout.
 *
 * Bumps `store.clientTick` every second. All time-dependent components
 * subscribe to this via derived hooks (`useElapsed`, `useRelativeEpoch`)
 * instead of creating their own intervals.
 */
export function useTickProvider(): void {
  useEffect(() => {
    const id = setInterval(() => {
      const prev = useStudioStore.getState().clientTick;
      useStudioStore.setState({ clientTick: prev + 1 });
    }, 1000);
    return () => clearInterval(id);
  }, []);
}

/**
 * Returns formatted elapsed time from a start timestamp.
 * Re-renders every second via clientTick.
 *
 * @param startedAt - Unix ms timestamp, 0 or null if not started
 * @param active - Only tick when true (e.g., server is running)
 * @returns Formatted string like "2h 15m" or null if inactive/not started
 */
export function useElapsed(startedAt: number | null | undefined, active = true): string | null {
  // Subscribe to clientTick only when active — prevents re-renders when idle
  const tick = useStudioStore((s) => (active && startedAt ? s.clientTick : 0));

  if (!startedAt || !active) return null;
  // tick in conditional prevents React Compiler from memoizing Date.now()
  const now = tick >= 0 ? Date.now() : 0;
  return formatElapsed(now - startedAt);
}

/**
 * Returns a monotonically increasing number derived from `store.clientTick`.
 * Changes every 5 seconds. Used as a prop for memo'd components to bust cache
 * for relative timestamp refresh ("5 minutes ago").
 *
 * Derived from store — never resets on remount, unlike local useState.
 */
export function useRelativeEpoch(): number {
  return useStudioStore((s) => Math.floor(s.clientTick / 5));
}

/**
 * Returns a fresh `Date.now()` that updates every 5 seconds.
 *
 * React Compiler treats `Date.now()` as a pure expression and memoizes it
 * when its call-site arguments are stable. This hook ties `Date.now()` to the
 * store tick so the compiler sees a changing dependency and re-evaluates.
 */
export function useNow(): number {
  const epoch = useRelativeEpoch();
  // epoch in the conditional prevents React Compiler from hoisting Date.now()
  return epoch >= 0 ? Date.now() : 0;
}

/**
 * A fresh `Date.now()` every second while `active` — for what counts up as
 * it is watched, such as a request in flight or a stream still open — and
 * `null` otherwise, so an idle caller never re-renders on the tick.
 *
 * @param active - Whether the caller is counting
 * @returns The time now, or `null` while inactive
 * @example
 * ```ts
 * const now = useSecondNow(state === "streaming") ?? context.now;
 * ```
 */
export function useSecondNow(active: boolean): number | null {
  const tick = useStudioStore((s) => (active ? s.clientTick : -1));
  // tick in the conditional prevents React Compiler from hoisting Date.now()
  return tick >= 0 ? Date.now() : null;
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatElapsed(ms: number): string {
  if (ms < 1000) return "0s";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
