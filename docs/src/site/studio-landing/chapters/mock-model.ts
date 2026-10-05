/** A chaos preset: how badly the mock backend behaves. */
export interface ChaosPreset {
  label: "Stable" | "Degraded" | "Unstable" | "Down"
  /** The share of calls that fail, in percent. */
  errorRate: number
  tone: "ok" | "warn" | "err"
}

/**
 * The chaos presets the Mocks view offers, mildest first.
 *
 * @example
 * ```ts
 * CHAOS_PRESETS.map((p) => p.errorRate) // [0, 10, 40, 100]
 * ```
 */
export const CHAOS_PRESETS: readonly ChaosPreset[] = [
  { label: "Stable", errorRate: 0, tone: "ok" },
  { label: "Degraded", errorRate: 10, tone: "warn" },
  { label: "Unstable", errorRate: 40, tone: "err" },
  { label: "Down", errorRate: 100, tone: "err" },
]

/** How the presets are stepped through, a preset every three steps. */
const SEQUENCE = [2, 3, 2, 1, 0, 1]

/** How a call in the strip came back. */
export type CallOutcome = "ok" | "slow" | "failed"

/**
 * The preset in force at a step of the visual's clock.
 *
 * @param step - The clock
 * @returns The preset's place in {@link CHAOS_PRESETS}
 * @example
 * ```ts
 * presetAt(0) // 2
 * ```
 */
export function presetAt(step: number): number {
  return SEQUENCE[Math.floor(step / 3) % SEQUENCE.length] ?? 0
}

function unit(seed: number): number {
  return (Math.imul(seed + 1, 2654435761) >>> 0) / 2 ** 32
}

/**
 * A call's outcome under a preset: failed about as often as the preset's
 * error rate says, now and then slow — the same for the same call.
 *
 * @param call - Which call
 * @param preset - The preset's place in {@link CHAOS_PRESETS}
 * @returns How it came back
 * @example
 * ```ts
 * outcomeOf(3, 3) // "failed"
 * ```
 */
export function outcomeOf(call: number, preset: number): CallOutcome {
  const rate = (CHAOS_PRESETS[preset]?.errorRate ?? 0) / 100
  const roll = unit(call)
  if (roll < 0.015 + rate * 0.9) return "failed"
  return roll < 0.06 + rate * 0.95 ? "slow" : "ok"
}

/**
 * The strip of the latest calls at a step: forty-eight, the newest last,
 * each with its place in the stream.
 *
 * @param step - How many calls have gone by
 * @param preset - The preset in force
 * @returns The calls and their outcomes, oldest first
 * @example
 * ```ts
 * callStrip(0, 0).length // 48
 * ```
 */
export function callStrip(step: number, preset: number): { n: number; outcome: CallOutcome }[] {
  return Array.from({ length: 48 }, (_, at) => ({
    n: step + at,
    outcome: outcomeOf(step + at, preset),
  }))
}
