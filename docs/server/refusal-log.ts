import type { RefusalCode } from "./refusal"

/** Says that the backend refused a call, by the refusal's code. */
export type RefusalLog = (code: RefusalCode) => void

/**
 * The line the backend writes for the calls it refuses: a refusal is
 * expected, not a fault, so it is one line with its code and no stack,
 * at most once a minute for each code, saying how many it held back.
 *
 * @param write - Where a line goes; the console's warnings by default
 * @param now - The time, in milliseconds
 * @param everyMs - How long a code's line holds back the next one
 * @returns The log
 * @example
 * ```ts
 * const log = refusalLog()
 * log("BODY_TOO_LARGE") // "The examples' backend refused a call: BODY_TOO_LARGE"
 * ```
 */
export function refusalLog(
  write: (line: string) => void = console.warn,
  now: () => number = Date.now,
  everyMs = 60_000
): RefusalLog {
  /* One entry for each code there is: the map never grows past them. */
  const last = new Map<RefusalCode, { at: number; held: number }>()
  return (code) => {
    const time = now()
    const seen = last.get(code)
    if (seen !== undefined && time - seen.at < everyMs) {
      seen.held += 1
      return
    }
    const held = seen?.held ? ` (${seen.held} more since its last line)` : ""
    write(`The examples' backend refused a call: ${code}${held}`)
    last.set(code, { at: time, held: 0 })
  }
}
