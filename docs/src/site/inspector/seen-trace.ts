import { unescapeTimingText } from "./timing-text"
import type { ApiAttempt, CallTrace, ChainLink, TimingMetric } from "./trace"

/* What the page reads of a header at most: whatever else it holds is not the site's to read. */
const MOST_METRICS = 32
const MOST_DESCRIPTION = 400
const MOST = { attempts: 6, chain: 8, log: 4, cache: 4 } as const

const RECEIVED = /^([A-Z]+) (\S+)$/
const BODY = /^\S+ \S+$/
const ATTEMPT = /^\+(\d+(?:\.\d+)?) ([A-Z]+) (\d{3}|timeout|cancelled|no-answer) (\S+)$/
const LINK = /^(\S+) (before|after|wrap)(?: (\S+))?$/
const CACHE = /^(?:hit \d+|miss|store \d+)$/
const STATUS = /^\d{3}$/
const COUNT = /^\d+$/
const RID = /^[\x21-\x7e]{1,80}$/

/* A trace as it is read, its lists still growing. */
interface Reading {
  rid?: string
  received?: { method: string; target: string }
  headers: string[]
  body?: string
  variables?: string
  attempts: ApiAttempt[]
  sent: string[]
  answered: string[]
  chain: ChainLink[]
  log: string[]
  cache: string[]
  status?: number
  passedBack: string[]
  ms?: number
  cut: number
}

const names = (text: string) => text.split(" ").filter(Boolean)

const push = <TItem>(list: TItem[], item: TItem, most: number) => {
  if (list.length < most) list.push(item)
}

/* Read one of the site's metrics into the trace; whether the metric was one of its own. */
function read(reading: Reading, name: string, text: string, duration: number | undefined): boolean {
  const ms = duration ?? 0
  const matched = (pattern: RegExp) => pattern.exec(text)
  switch (name) {
    case "rid":
      if (RID.test(text)) reading.rid = text
      return true
    case "in": {
      const found = matched(RECEIVED)
      if (found?.[1] && found[2]) reading.received = { method: found[1], target: found[2] }
      return true
    }
    case "in-headers":
      reading.headers = names(text)
      return true
    case "in-body":
      if (BODY.test(text)) reading.body = text
      return true
    case "vars":
      reading.variables = text
      return true
    case "api": {
      const found = matched(ATTEMPT)
      if (found?.[2] && found[3] && found[4]) {
        const attempt = {
          method: found[2],
          target: found[4],
          outcome: found[3],
          at: Number(found[1]),
          ms,
        }
        push(reading.attempts, attempt, MOST.attempts)
      }
      return true
    }
    case "api-headers":
      reading.sent = names(text)
      return true
    case "api-answer-headers":
      reading.answered = names(text)
      return true
    case "mw": {
      const found = matched(LINK)
      if (found?.[1] && found[2]) {
        const added = found[3] === undefined ? [] : found[3].split(",")
        push(reading.chain, { name: found[1], phase: found[2], ms, added }, MOST.chain)
      }
      return true
    }
    case "log":
      push(reading.log, text, MOST.log)
      return true
    case "cache":
      if (CACHE.test(text)) push(reading.cache, text, MOST.cache)
      return true
    case "out":
      if (STATUS.test(text)) reading.status = Number(text)
      return true
    case "out-headers":
      reading.passedBack = names(text)
      return true
    case "cut":
      if (COUNT.test(text)) reading.cut = Number(text)
      return true
    default:
      return false
  }
}

/* The trace a reading makes, its parts that were never read left out. */
function traceOf(reading: Reading): CallTrace {
  const { received, headers, body, rid, variables, status, ms, ...lists } = reading
  return {
    site: "proxy",
    ...(rid !== undefined && { rid }),
    ...(received !== undefined && {
      received: { ...received, headers, ...(body !== undefined && { body }) },
    }),
    ...(variables !== undefined && { variables }),
    ...lists,
    ...(status !== undefined && { status }),
    ...(ms !== undefined && { ms }),
  }
}

/**
 * What the site's server told of a proxied call, read from its answer's
 * `Server-Timing` as the browser hands it to the page — or `undefined`
 * where the header holds none of the site's metrics. The core's own
 * `courier` metric says how long the server took. A metric that does not
 * read as the site writes it is passed over, and the page reads no more
 * than its own limits, whatever else the header holds.
 *
 * @param metrics - The header's metrics: `PerformanceResourceTiming.serverTiming`, say
 * @returns The trace, or `undefined`
 * @example
 * ```ts
 * const trace = traceOfTiming(entry.serverTiming)
 * ```
 */
export function traceOfTiming(metrics: readonly TimingMetric[]): CallTrace | undefined {
  const reading: Reading = {
    headers: [],
    attempts: [],
    sent: [],
    answered: [],
    chain: [],
    log: [],
    cache: [],
    passedBack: [],
    cut: 0,
  }
  let known = false
  for (const metric of metrics.slice(0, MOST_METRICS)) {
    if (metric.name === "courier" && metric.duration !== undefined) reading.ms = metric.duration
    if (metric.description.length > MOST_DESCRIPTION) continue
    const text = unescapeTimingText(metric.description)
    if (text !== undefined && read(reading, metric.name, text, metric.duration)) known = true
  }
  return known ? traceOf(reading) : undefined
}
