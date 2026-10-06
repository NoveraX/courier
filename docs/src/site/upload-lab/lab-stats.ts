/** A moment of a run: the ms since it started, and the share sent then, 0 to 1. */
export type LabPoint = readonly [ms: number, share: number]

/** What a bar did over a run. */
export interface LabStats {
  /** How many times it moved. */
  count: number
  /** Its biggest jump, 0 to 1 — counted from 0, since the jump to the first report shows too. */
  step: number
  /** Its longest wait between two moves, in ms: the wait for the first one is the same for both bars. */
  wait: number
}

/**
 * Sum up what a bar did: how often it moved, its biggest jump and its
 * longest wait between moves.
 *
 * @param points - The bar's moves, in order
 * @returns The bar's numbers
 * @example
 * ```ts
 * labStats([[100, 0.2], [210, 0.5], [300, 1]]) // { count: 3, step: 0.5, wait: 110 }
 * ```
 */
export function labStats(points: readonly LabPoint[]): LabStats {
  let step = points[0]?.[1] ?? 0
  let wait = 0
  points.forEach(([ms, share], at) => {
    const previous = points[at - 1]
    if (!previous) return
    step = Math.max(step, share - previous[1])
    wait = Math.max(wait, ms - previous[0])
  })
  return { count: points.length, step, wait }
}

/**
 * The time a share was first reached, if it was.
 *
 * @param points - A bar's moves, in order
 * @param share - The share, 0 to 1
 * @returns The ms it was reached at, or null
 * @example
 * ```ts
 * reachedAt([[100, 0.4], [250, 1]], 1) // 250
 * ```
 */
export function reachedAt(points: readonly LabPoint[], share: number): number | null {
  return points.find((point) => point[1] >= share)?.[0] ?? null
}

/**
 * Seconds as the lab writes them: two decimals under ten seconds, one above.
 *
 * @param ms - A time, in ms
 * @returns The time, as "1.36 s"
 * @example
 * ```ts
 * seconds(1357) // "1.36 s"
 * ```
 */
export function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`
}
