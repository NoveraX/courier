import { CHUNKS, NEW_FROM, NEW_LINES, OLD_LINES } from "./refactor-code"

/** Where a line of the refactor stands. */
export type LineState = "kept" | "struck" | "gone" | "hidden" | "added"

/** Where a step of the refactor stands. */
export type StepState = "idle" | "active" | "done" | "won"

/** The refactor at one point of the scroll. */
export interface RefactorFrame {
  /** Each hand-written line, then each new one. */
  lines: LineState[]
  /** How many hand-written lines are struck so far. */
  struck: number
  /** Whether the new lines are in. */
  done: boolean
  steps: StepState[]
  /** Per file: whether its tab has closed, and whether it is being edited. */
  tabs: { closed: boolean; active: boolean }[]
  filesLeft: number
  linesLeft: number
}

/* Each hand-written line is struck in turn across its chunk, and goes when the chunk ends. */
const STRIKE_AT: readonly number[] = OLD_LINES.map((line, at) => {
  const [from = 0, to = 0] = CHUNKS[line.chunk] ?? []
  const mates = OLD_LINES.flatMap((other, index) => (other.chunk === line.chunk ? [index] : []))
  return from + (to - from) * (mates.indexOf(at) / mates.length)
})
const CHUNK_DONE_AT: readonly number[] = CHUNKS.map(([, to]) => to + 0.02)
const GONE_AT: readonly number[] = OLD_LINES.map((line) => CHUNK_DONE_AT[line.chunk] ?? 1)
const ADD_AT: readonly number[] = NEW_LINES.map((_, at) => NEW_FROM + at * 0.035)

/* Every point at which the frame changes, in order: between two of them it holds still. */
const STOPS: readonly number[] = [
  ...new Set([
    ...STRIKE_AT,
    ...GONE_AT,
    ...ADD_AT,
    NEW_FROM,
    ...CHUNKS.map(([from]) => from),
    ...CHUNK_DONE_AT,
  ]),
].sort((a, b) => a - b)

function oldLineState(at: number, progress: number): LineState {
  if (progress >= (GONE_AT[at] ?? 1)) return "gone"
  return progress >= (STRIKE_AT[at] ?? 1) ? "struck" : "kept"
}

function stepState(
  at: number,
  chunkDone: readonly boolean[],
  chunkActive: readonly boolean[],
  done: boolean
): StepState {
  if (at >= CHUNKS.length) return done ? "won" : "idle"
  if (chunkDone[at]) return "done"
  return chunkActive[at] ? "active" : "idle"
}

/**
 * The refactor as the reader has scrolled it: the hand-written lines
 * struck chunk by chunk and gone, then the three typed lines in, with the
 * steps, the tabs and the counts that follow.
 *
 * @param progress - How far through the section the reader is, 0 to 1
 * @returns The frame
 * @example
 * ```ts
 * refactorFrame(1).done // true
 * ```
 */
export function refactorFrame(progress: number): RefactorFrame {
  const old = OLD_LINES.map((_, at) => oldLineState(at, progress))
  const added = ADD_AT.map((from): LineState => (progress >= from ? "added" : "hidden"))
  const struck = old.filter((state) => state !== "kept").length
  const chunkDone = CHUNK_DONE_AT.map((from) => progress >= from)
  const chunkActive = CHUNKS.map(
    ([from], at) => progress >= from && progress < (CHUNK_DONE_AT[at] ?? 1)
  )
  const done = progress >= NEW_FROM
  const filesLeft = 1 + (chunkDone[1] ? 0 : 1) + (chunkDone[2] ? 0 : 1)
  return {
    lines: [...old, ...added],
    struck,
    done,
    steps: [0, 1, 2, 3].map((at) => stepState(at, chunkDone, chunkActive, done)),
    tabs: [0, 1, 2].map((at) => ({
      closed: at > 0 && (chunkDone[at] ?? false),
      active: at === 0 || (chunkActive[at] ?? false),
    })),
    filesLeft,
    linesLeft: OLD_LINES.length - struck + (done ? NEW_LINES.length : 0),
  }
}

/**
 * Where the frame shown at a point of the scroll begins: the last point
 * before it at which anything changed, or 0. Every point between two such
 * stops shows the same frame, so the section re-renders only as the reader
 * crosses one — a few dozen times through the whole scroll, not every frame.
 *
 * @param progress - How far through the section the reader is, 0 to 1
 * @returns The stop at or before it
 * @example
 * ```ts
 * refactorStop(0.05) // 0 — nothing is struck before 0.1
 * refactorFrame(refactorStop(0.3)) // the same frame as refactorFrame(0.3)
 * ```
 */
export function refactorStop(progress: number): number {
  let stop = 0
  for (const at of STOPS) {
    if (at > progress) break
    stop = at
  }
  return stop
}
