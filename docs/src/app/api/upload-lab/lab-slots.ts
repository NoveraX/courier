/** How many uploads the lab reads at once, across every visitor. */
export const LAB_SLOTS = 4

let taken = 0

/**
 * Take one of the lab's slots for an upload, if one is free. The lab holds
 * an upload open for seconds by design, so it reads only a few at a time.
 *
 * @returns A function that gives the slot back — calling it twice gives it back once — or null when every slot is taken
 * @example
 * ```ts
 * const release = takeLabSlot()
 * if (!release) return busy()
 * try { … } finally { release() }
 * ```
 */
export function takeLabSlot(): (() => void) | null {
  if (taken >= LAB_SLOTS) return null
  taken += 1
  let given = false
  return () => {
    if (given) return
    given = true
    taken -= 1
  }
}
