import { useEffect, useState } from "react";

/**
 * The time now, kept current every few tenths of a second while something
 * counts up on screen — a call in flight — and left still otherwise.
 *
 * @param active - Whether to keep it current
 * @param everyMs - How often to update it
 * @returns The time, in epoch milliseconds
 * @example
 * ```ts
 * const now = useLiveNow(sending);
 * ```
 */
export function useLiveNow(active: boolean, everyMs = 100): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [active, everyMs]);
  return now;
}
