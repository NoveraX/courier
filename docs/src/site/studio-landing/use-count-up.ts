"use client"

import { useEffect, useRef, useState } from "react"

/**
 * A number that eases to each new target instead of jumping, once it is
 * allowed to start; it jumps when motion is turned down.
 *
 * @param target - Where it is going
 * @param durationMs - How long a change takes
 * @param running - Whether it may move yet; until then it stays at 0
 * @param still - Whether to jump straight to the target
 * @returns The number, rounded
 * @example
 * ```ts
 * const score = useCountUp(88, 1500, seen, still)
 * ```
 */
export function useCountUp(
  target: number,
  durationMs: number,
  running: boolean,
  still: boolean
): number {
  const [value, setValue] = useState(0)
  const current = useRef(0)
  useEffect(() => {
    if (!running) return
    if (still) {
      current.current = target
      setValue(target)
      return
    }
    const from = current.current
    const start = performance.now()
    let frame = requestAnimationFrame(function step(now) {
      const done = Math.min(1, (now - start) / durationMs)
      current.current = Math.round(from + (target - from) * (1 - (1 - done) ** 3))
      setValue(current.current)
      if (done < 1) frame = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(frame)
  }, [target, durationMs, running, still])
  return value
}
