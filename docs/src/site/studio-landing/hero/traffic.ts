/** An HTTP method, as the Studio window colours it. */
export type Method = "GET" | "POST" | "PATCH" | "DELETE" | "PUT"

/** A call in the Studio window's timeline. */
export interface TrafficRow {
  /** Which call of the stream this is, counting from the first. */
  n: number
  method: Method
  /** The source, written as the timeline prefixes it: `api.`. */
  source: string
  endpoint: string
  status: number
  ms: number
}

/** A bar of the window's traffic chart: calls that answered, and calls that failed. */
export interface TrafficBar {
  /** Which bar of the stream this is, counting from the first. */
  n: number
  ok: number
  failed: number
}

const POOL: readonly (readonly [Method, string, string, number, number])[] = [
  ["GET", "api.", "users.list", 200, 42],
  ["POST", "api.", "orders.create", 201, 164],
  ["GET", "search.", "catalog.query", 200, 238],
  ["GET", "billing.", "invoices.list", 500, 2290],
  ["PATCH", "api.", "users.update", 200, 88],
  ["GET", "flags.", "features.evaluate", 200, 11],
  ["POST", "api.", "auth.refresh", 200, 36],
  ["GET", "api.", "orders.list", 200, 96],
  ["DELETE", "api.", "sessions.revoke", 204, 31],
  ["GET", "shipping.", "rates.quote", 200, 312],
  ["POST", "analytics.", "events.track", 202, 14],
]

/**
 * The n-th call of the window's stream: picked from a pool of a typical
 * app's endpoints, its time varied around the endpoint's usual one — the
 * same for the same n, so the server's render and the browser's agree.
 *
 * @param n - Which call
 * @returns The call
 * @example
 * ```ts
 * trafficRow(0).endpoint // "users.update"
 * ```
 */
export function trafficRow(n: number): TrafficRow {
  const [method, source, endpoint, status, usual] = POOL[(n * 7 + 4) % POOL.length] ??
    POOL[0] ?? ["GET", "", "", 200, 0]
  return {
    n,
    method,
    source,
    endpoint,
    status,
    ms: Math.round(usual * (0.7 + ((n * 37) % 61) / 100)),
  }
}

/**
 * The window's timeline at a step of its stream: the newest call first.
 *
 * @param step - How many calls have arrived since the first screen
 * @param count - How many rows the window shows
 * @returns The rows, newest first
 * @example
 * ```ts
 * trafficRows(1)[0].n // 11
 * ```
 */
export function trafficRows(step: number, count = 11): TrafficRow[] {
  return Array.from({ length: count }, (_, at) => trafficRow(step + count - 1 - at))
}

/**
 * The window's traffic chart at a step: forty bars, the newest last, an
 * occasional one with failures stacked on top.
 *
 * @param step - How many bars have arrived since the first screen
 * @returns The bars, oldest first
 * @example
 * ```ts
 * trafficBars(0).length // 40
 * ```
 */
export function trafficBars(step: number): TrafficBar[] {
  return Array.from({ length: 40 }, (_, at) => {
    const n = step + at
    return { n, ok: 20 + ((n * 53) % 70), failed: (n * 29) % 100 < 12 ? 10 + ((n * 17) % 20) : 0 }
  })
}

/**
 * A call's duration as the timeline writes it: milliseconds, or seconds
 * from one second on.
 *
 * @param ms - The duration
 * @returns The text
 * @example
 * ```ts
 * formatMs(2290) // "2.29s"
 * ```
 */
export function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`
}
