/**
 * Numbers in [0, 1) from a seed, the same run for the same seed (the
 * mulberry32 generator), so a property test that fails names a seed that
 * fails again.
 *
 * @param seed - Any 32-bit number
 * @returns The next number of the run, each time it is called
 * @example
 * ```ts
 * const next = seeded(7)
 * next() // 0.4…, and the same for seed 7 every time
 * ```
 */
export function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), state | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

/** A whole number from 0 to `below`, less one. */
export function below(next: () => number, below: number): number {
  return Math.floor(next() * below)
}

/** One of the values given. */
export function oneOf<TValue>(next: () => number, values: readonly TValue[]): TValue {
  const value = values[below(next, values.length)]
  if (value === undefined) throw new Error("oneOf takes at least one value")
  return value
}

/* Characters a page can send: letters, digits, spaces, controls, marks, astral ones, a quote. */
const ALPHABET = [
  "a",
  "Z",
  "7",
  " ",
  "\t",
  "\n",
  "\u0000",
  "\u007f",
  "\u0085",
  "@",
  ".",
  "é",
  "\u{1f600}",
  '"',
]

/**
 * Text of up to `most` characters, drawn from those a page can send.
 *
 * @param next - The run
 * @param most - The most characters
 * @returns The text
 */
export function anyText(next: () => number, most: number): string {
  return Array.from({ length: below(next, most + 1) }, () => oneOf(next, ALPHABET)).join("")
}

/**
 * A value as JSON or a query could carry one, or one it could not.
 *
 * @param next - The run
 * @returns The value
 */
export function anyValue(next: () => number): unknown {
  switch (below(next, 9)) {
    case 0:
      return undefined
    case 1:
      return null
    case 2:
      return next() < 0.5
    case 3:
      return (next() - 0.5) * 10 ** below(next, 20)
    case 4:
      return String(below(next, 10 ** below(next, 18)))
    case 5:
      return [anyText(next, 5)]
    case 6:
      return { value: anyText(next, 5) }
    case 7:
      return `${anyText(next, 10)}@${anyText(next, 10)}.${anyText(next, 4)}`
    default:
      return anyText(next, 300)
  }
}
