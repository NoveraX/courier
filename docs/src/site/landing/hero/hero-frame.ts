import { CALLS_FILE, CREATE_STOP, READ_STOP } from "./hero-code"

/** How many ticks one run of the hero's typing takes, before it starts over. */
export const HERO_CYCLE = 311

/** The tick the hero rests on when motion is turned down: everything typed, the error shown. */
export const HERO_REST = 250

/** What the hero's editor shows at one tick. */
export interface HeroFrame {
  /** How many characters of the read, the query and the create are typed. */
  typed: [number, number, number]
  /** Whether the read's and the query's type hints are shown. */
  hints: [boolean, boolean]
  /** The calling file's line the caret is on, if any. */
  caret: number | null
  /** The completion list, open under a line with one entry picked. */
  completion: { line: 1 | 7; picked: number } | null
  /** The definition's lines lit, and in which colour. */
  lit: { lines: readonly number[]; tone: "blue" | "red" }
  /** Whether the type checker has refused the create. */
  refused: boolean
}

const GET_ALL = [6]
const GET_BY_ID = [7, 8, 9]
const CREATE = [10, 11, 12]
const CREATE_VARIABLES = [11]

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value))
}

function typedAt(t: number): [number, number, number] {
  const read = CALLS_FILE[1]?.length ?? 0
  const query = CALLS_FILE[4]?.length ?? 0
  const create = CALLS_FILE[7]?.length ?? 0
  const readTyped = t < READ_STOP ? t : t < 56 ? READ_STOP : clamp(READ_STOP + t - 56, 0, read)
  const createTyped =
    t < 166
      ? clamp(t - 147, 0, CREATE_STOP)
      : t < 186
        ? CREATE_STOP
        : clamp(CREATE_STOP + t - 186, 0, create)
  return [readTyped, clamp(t - 90, 0, query), createTyped]
}

function completionAt(t: number): HeroFrame["completion"] {
  if (t >= READ_STOP && t < 56) return { line: 1, picked: t < 44 ? 0 : 1 }
  if (t >= 166 && t < 186) return { line: 7, picked: t < 172 ? 0 : t < 179 ? 1 : 2 }
  return null
}

function litAt(t: number, completion: HeroFrame["completion"]): HeroFrame["lit"] {
  const groups = [GET_ALL, GET_BY_ID, CREATE]
  if (completion) return { lines: groups[completion.picked] ?? [], tone: "blue" }
  if (t >= 56 && t < 90) return { lines: GET_BY_ID, tone: "blue" }
  if (t >= 90 && t < 147) return { lines: GET_ALL, tone: "blue" }
  if (t >= 186 && t < 214) return { lines: CREATE, tone: "blue" }
  if (t >= 214) return { lines: CREATE_VARIABLES, tone: "red" }
  return { lines: [], tone: "blue" }
}

function caretAt(t: number): number | null {
  if (t < 80) return 1
  if (t < 90) return null
  if (t < 137) return 4
  return t < 214 ? 7 : null
}

/**
 * The hero's editor at one tick of its run: the calls typed so far, the
 * completion list while one is open, the definition's lines the call in
 * hand comes from, and the type error once the create is typed.
 *
 * @param t - The tick, 0 to {@link HERO_CYCLE} − 1
 * @returns The frame
 * @example
 * ```ts
 * heroFrame(40).completion // { line: 1, picked: 0 }
 * ```
 */
export function heroFrame(t: number): HeroFrame {
  const completion = completionAt(t)
  return {
    typed: typedAt(t),
    hints: [t >= 80, t >= 137],
    caret: caretAt(t),
    completion,
    lit: litAt(t, completion),
    refused: t >= 214,
  }
}
