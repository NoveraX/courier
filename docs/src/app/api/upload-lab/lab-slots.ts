/** How many uploads the lab reads at once, across every visitor: one at a time for each. */
export const LAB_SLOTS = 4

/* Whom the lab is reading an upload for, each as the examples' budgets count a visitor. */
const reading = new Set<string>()

/**
 * Take one of the lab's slots for a caller's upload. The lab holds an
 * upload open for seconds by design, so it reads only a few at a time,
 * and one for each caller: one who sends several at once cannot take the
 * lab from everyone else.
 *
 * @param caller - Who the upload comes from: their address, an IPv6 one by its /64
 * @returns A function that gives the slot back — calling it twice gives it
 *   back once — or why there is none: `"yours"` while the caller holds one,
 *   `"full"` while every slot is taken
 * @example
 * ```ts
 * const release = takeLabSlot(caller)
 * if (typeof release !== "function") return busy(release)
 * try { … } finally { release() }
 * ```
 */
export function takeLabSlot(caller: string): (() => void) | "yours" | "full" {
  if (reading.has(caller)) return "yours"
  if (reading.size >= LAB_SLOTS) return "full"
  reading.add(caller)
  let given = false
  return () => {
    if (given) return
    given = true
    reading.delete(caller)
  }
}
