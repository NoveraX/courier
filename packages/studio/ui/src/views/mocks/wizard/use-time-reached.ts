import { useEffect, useState } from "react";

/**
 * Whether the clock has reached a moment, re-rendering once it does. The
 * answer is `false` on the first render even for a moment already past,
 * and turns `true` on the next tick, so nothing rendered from it counts on
 * a clock read during rendering.
 *
 * @param at - The moment, in epoch milliseconds
 * @returns Whether it has been reached
 *
 * @example
 * ```tsx
 * const armed = useTimeReached(plan.armedAt);
 * <Button disabled={!armed} onClick={apply}>Apply</Button>
 * ```
 */
export function useTimeReached(at: number): boolean {
  const [reached, setReached] = useState<number | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setReached(at), Math.max(0, at - Date.now()));
    return () => clearTimeout(timer);
  }, [at]);
  return reached === at;
}
