/** The upload demo at one tick: how far it is, and how fast it goes. */
export interface UploadFrame {
  /** 0 to 100. */
  percent: number
  /** Megabytes a second, or null once it is done. */
  speed: number | null
}

/** The file's size, in megabytes. */
export const UPLOAD_SIZE_MB = 2.4

const HOLD = 16

/* Each tick sends a little more, unevenly, as a real upload does. */
function step(at: number): number {
  return 1.5 + ((at * 37) % 36) / 10
}

const RAMP: readonly number[] = (() => {
  const percents: number[] = [0]
  for (let at = 0; (percents.at(-1) ?? 100) < 100; at += 1) {
    percents.push(Math.min(100, (percents.at(-1) ?? 0) + step(at)))
  }
  return percents
})()

/** How many ticks one upload takes, its pause at 100 % included. */
export const UPLOAD_CYCLE = RAMP.length + HOLD

/**
 * The upload demo at a tick: the share sent climbing unevenly to 100 %,
 * a pause there, then the next upload.
 *
 * @param tick - The demo clock's tick
 * @returns The frame
 * @example
 * ```ts
 * uploadFrame(0) // { percent: 0, speed: 3.2 }
 * ```
 */
export function uploadFrame(tick: number): UploadFrame {
  const at = tick % UPLOAD_CYCLE
  const percent = Math.round(RAMP[Math.min(at, RAMP.length - 1)] ?? 100)
  if (percent >= 100) return { percent: 100, speed: null }
  return { percent, speed: 3.2 + ((at * 13) % 15) / 10 }
}
