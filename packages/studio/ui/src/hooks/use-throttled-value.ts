import { useEffect, useRef, useState } from "react";

/**
 * A value that follows another at most once per interval: a change after a
 * quiet interval is taken at once, and a burst of changes is taken as its
 * last one when the interval ends.
 *
 * Studio's request list changes with every event of every call, and what is
 * computed from all of it — the audit score beside the sidebar's Audit link
 * — was computed again for each one.
 *
 * @param value - The value to follow
 * @param intervalMs - The shortest time between two changes of the result
 * @returns The value, as of its last change the interval let through
 * @example
 * ```ts
 * const requests = useThrottledValue(useStudioStore((s) => s.requests), 1_000);
 * ```
 */
export function useThrottledValue<T>(value: T, intervalMs: number): T {
  const [shown, setShown] = useState(value);
  const lastShownAt = useRef(0);

  useEffect(() => {
    const wait = lastShownAt.current + intervalMs - Date.now();
    if (wait <= 0) {
      lastShownAt.current = Date.now();
      setShown(() => value);
      return undefined;
    }
    const timer = setTimeout(() => {
      lastShownAt.current = Date.now();
      setShown(() => value);
    }, wait);
    return () => clearTimeout(timer);
  }, [value, intervalMs]);

  return shown;
}
