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
const GONE_AT: readonly number[] = OLD_LINES.map((line) => (CHUNKS[line.chunk]?.[1] ?? 0) + 0.02)

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
  const added = NEW_LINES.map(
    (_, at): LineState => (progress >= NEW_FROM + at * 0.035 ? "added" : "hidden")
  )
  const struck = old.filter((state) => state !== "kept").length
  const chunkDone = CHUNKS.map(([, to]) => progress >= to + 0.02)
  const chunkActive = CHUNKS.map(([from, to]) => progress >= from && progress < to + 0.02)
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
