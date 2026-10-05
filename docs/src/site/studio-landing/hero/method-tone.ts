import type { Method } from "./traffic"

/**
 * The colour Studio gives each HTTP method, as text classes.
 *
 * @example
 * ```ts
 * METHOD_TEXT.POST // "text-tone-green"
 * ```
 */
export const METHOD_TEXT: Readonly<Record<Method, string>> = {
  GET: "text-tone-blue",
  POST: "text-tone-green",
  PATCH: "text-tone-amber",
  DELETE: "text-tone-red",
  PUT: "text-tone-violet",
}

/**
 * The colour of a call's duration: red from a second, amber from 300 ms.
 *
 * @param ms - The duration
 * @returns A text class
 * @example
 * ```ts
 * durationTone(2290) // "text-err"
 * ```
 */
export function durationTone(ms: number): string {
  if (ms > 1000) return "text-err"
  return ms > 300 ? "text-warn" : "text-fg-muted"
}
