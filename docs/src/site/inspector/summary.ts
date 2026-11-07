import type { SeenRequest } from "./network-log"
import type { ApiAttempt, CallTrace } from "./trace"

/** What the inspector calls the examples' backend: its own address is the server's to know. */
export const API_NAME = "API (demo)"

const WHERE = {
  proxy: "through the proxy route",
  render: "on the server, as the page rendered",
  action: "in a Server Action",
} as const

/**
 * A duration as the inspector writes it: tenths under 10 ms, whole
 * milliseconds under a second, tenths of a second past one — each in the
 * unit it rounds to, so 999.6 ms is a second and not `1000 ms`.
 *
 * @param ms - The duration, in ms
 * @returns The duration, in words
 * @example
 * ```ts
 * duration(4.82) // "4.8 ms"
 * duration(1240) // "1.2 s"
 * ```
 */
export function duration(ms: number): string {
  if (Math.round(ms) >= 1000) return `${(ms / 1000).toFixed(1)} s`
  if (Number(ms.toFixed(1)) < 10) return `${Math.max(0, ms).toFixed(1)} ms`
  return `${Math.round(ms)} ms`
}

/**
 * How one request to the API ended, in words: its status and how long it
 * took, or that it ran out of time, was stopped or got no answer.
 *
 * @param attempt - The request
 * @returns How it ended
 * @example
 * ```ts
 * attemptOutcome({ method: "GET", target: "/slow", outcome: "timeout", at: 0, ms: 1000 })
 * // "timed out after 1.0 s"
 * ```
 */
export function attemptOutcome(attempt: ApiAttempt): string {
  switch (attempt.outcome) {
    case "timeout":
      return `timed out after ${duration(attempt.ms)}`
    case "cancelled":
      return `stopped after ${duration(attempt.ms)}`
    case "no-answer":
      return `no answer after ${duration(attempt.ms)}`
    default:
      return `${attempt.outcome} in ${duration(attempt.ms)}`
  }
}

/* How a trace's way to the API went: its last request, and how many it took to get there. */
function apiPart(trace: CallTrace): string | undefined {
  const last = trace.attempts.at(-1)
  if (last === undefined) return undefined
  const count = trace.attempts.length
  const tries = count > 1 ? `, the last of ${count} attempts` : ""
  return `${API_NAME}: ${last.method} ${last.target} → ${attemptOutcome(last)}${tries}`
}

/* What answered a trace's call when nothing went to the API. */
function answeredWithoutApi(trace: CallTrace): string {
  const hit = trace.cache.find((entry) => entry.startsWith("hit "))
  if (hit !== undefined) {
    const age = duration(Number(hit.slice("hit ".length)))
    return `answered from the server's cache, ${age} old, without calling the API`
  }
  const status = trace.status === undefined ? "" : ` ${trace.status}`
  return `the site's server answered${status} without calling the API`
}

/**
 * A request the page made, in one line of words, as the inspector heads
 * it: `browser → /api/request → API (demo): POST /users → 201 in 12 ms;
 * total 48 ms` — or that the browser's cache answered it, that the site's
 * server answered without the API, or that no answer came at all.
 *
 * @param request - The request
 * @returns The line
 * @example
 * ```ts
 * requestSummary(request) // "browser → /api/request → API (demo): GET /users → 200 in 4.1 ms; total 38 ms"
 * ```
 */
export function requestSummary(request: SeenRequest): string {
  const path = request.target.split("?")[0] ?? request.target
  const from = request.action ? `browser → Server Action (POST ${path})` : `browser → ${path}`
  const total = `total ${duration(request.ms)}`
  if (request.unanswered) {
    return `${from}: no answer reached the browser — cancelled or failed after ${duration(request.ms)}`
  }
  if (request.cached) return `${from}: answered from the browser's cache — nothing was sent`
  const trace = request.trace
  if (trace === undefined) {
    const status = request.status === undefined ? "answered" : String(request.status)
    return `${from}: ${status} in ${duration(request.ms)}`
  }
  const api = apiPart(trace)
  return api === undefined
    ? `${from}: ${answeredWithoutApi(trace)}; ${total}`
    : `${from} → ${api}; ${total}`
}

/**
 * A call made on the site's server, in one line of words: where it was
 * made, and how its way to the API went.
 *
 * @param trace - The call's trace
 * @returns The line
 * @example
 * ```ts
 * serverSummary(trace) // "on the server, as the page rendered → API (demo): GET /users → 200 in 3.2 ms"
 * ```
 */
export function serverSummary(trace: CallTrace): string {
  const api = apiPart(trace)
  return api === undefined
    ? `${WHERE[trace.site]}: ${answeredWithoutApi(trace)}`
    : `${WHERE[trace.site]} → ${api}`
}
