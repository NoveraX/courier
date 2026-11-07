import { formatServerTiming } from "./server-timing"
import { escapeTimingText } from "./timing-text"
import type { CallTrace, TimingMetric } from "./trace"

/**
 * The most the site adds to an answer's `Server-Timing`, in bytes: well
 * within what a proxy in front of the site passes in an answer's headers —
 * nginx holds all of them to 4 or 8 KiB by default.
 */
export const TRACE_TIMING_BYTES = 2048

/* The longest description, and the longest a call's variables are shown. */
const TEXT = 200
const VARIABLES = 300

/* A metric, and how long it stays as the header runs out of room: the lowest goes first. */
interface Ranked {
  readonly metric: TimingMetric
  readonly rank: number
}

const said = (name: string, text: string, rank: number, most = TEXT): Ranked => ({
  metric: { name, description: escapeTimingText(text, most) },
  rank,
})

const timed = (name: string, ms: number, text: string, rank: number): Ranked => ({
  metric: { name, duration: ms, description: escapeTimingText(text, TEXT) },
  rank,
})

/* Each part of the trace as a metric, in the order the page reads them. */
function rankedMetrics(trace: CallTrace): Ranked[] {
  const { received, attempts } = trace
  const last = attempts.length - 1
  return [
    ...(trace.rid === undefined ? [] : [said("rid", trace.rid, 9)]),
    ...(received === undefined
      ? []
      : [
          said("in", `${received.method} ${received.target}`, 9),
          said("in-headers", received.headers.join(" "), 5),
          ...(received.body === undefined ? [] : [said("in-body", received.body, 7)]),
        ]),
    ...(trace.variables === undefined ? [] : [said("vars", trace.variables, 4, VARIABLES)]),
    ...attempts.map((attempt, index) =>
      timed(
        "api",
        attempt.ms,
        `+${attempt.at.toFixed(1)} ${attempt.method} ${attempt.outcome} ${attempt.target}`,
        index === last ? 8 : 6
      )
    ),
    ...(trace.sent.length === 0 ? [] : [said("api-headers", trace.sent.join(" "), 5)]),
    ...(trace.answered.length === 0
      ? []
      : [said("api-answer-headers", trace.answered.join(" "), 3)]),
    ...trace.chain.map((link) =>
      timed("mw", link.ms, [link.name, link.phase, link.added.join(",")].join(" ").trim(), 2)
    ),
    ...trace.log.map((line) => said("log", line, 1)),
    ...trace.cache.map((entry) => said("cache", entry, 7)),
    ...(trace.status === undefined ? [] : [said("out", String(trace.status), 9)]),
    ...(trace.passedBack.length === 0 ? [] : [said("out-headers", trace.passedBack.join(" "), 3)]),
  ]
}

const withCut = (metrics: readonly TimingMetric[], cut: number): TimingMetric[] =>
  cut > 0 ? [...metrics, { name: "cut", description: String(cut) }] : [...metrics]

/**
 * A proxied call's trace as the metrics the site adds to its answer's
 * `Server-Timing`, within `budget` bytes. Where the trace is more than
 * fits, its least telling parts go first — the log, then the chain, then
 * the lists of headers — and a `cut` metric says how many went, beside
 * those the trace's own limits left out. What says where the call went
 * and how it ended stays.
 *
 * @param trace - The trace
 * @param budget - The most bytes the metrics take, written
 * @returns The metrics, their descriptions ASCII
 * @example
 * ```ts
 * response.headers.append("Server-Timing", formatServerTiming(traceMetrics(trace)))
 * ```
 */
export function traceMetrics(trace: CallTrace, budget = TRACE_TIMING_BYTES): TimingMetric[] {
  let kept = rankedMetrics(trace)
  let cut = trace.cut
  const size = () =>
    formatServerTiming(
      withCut(
        kept.map((ranked) => ranked.metric),
        cut
      )
    ).length
  while (kept.length > 0 && size() > budget) {
    const lowest = Math.min(...kept.map((ranked) => ranked.rank))
    kept = kept.toSpliced(
      kept.findLastIndex((ranked) => ranked.rank === lowest),
      1
    )
    cut += 1
  }
  return withCut(
    kept.map((ranked) => ranked.metric),
    cut
  )
}
