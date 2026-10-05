"use client"

import { useEffect, useState } from "react"

/**
 * A count that goes up at a steady pace while it runs, and holds while it
 * does not — the clock the landing page's animations are drawn from.
 *
 * @param running - Whether it counts
 * @param intervalMs - How long one tick lasts
 * @returns The ticks counted so far
 * @example
 * ```ts
 * const tick = useTicker(inView, 100)
 * ```
 */
export function useTicker(running: boolean, intervalMs: number): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setTick((count) => count + 1), intervalMs)
    return () => clearInterval(timer)
  }, [running, intervalMs])
  return tick
}
