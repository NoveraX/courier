/** What a refusal tells the page that made the call, besides its status. */
export type RefusalCode =
  | "INVALID_FIELD"
  | "INVALID_BODY"
  | "BODY_TOO_LARGE"
  | "NOT_FOUND"
  | "ROUTE_NOT_FOUND"
  | "UPLOAD_REFUSED"
  | "VISITOR_DATA_FULL"
  | "STORE_FULL"
  | "RATE_LIMITED"

/**
 * A call the examples' backend answers with an error it expected: a field
 * outside its limits, a body it cannot read, a record or a route it does
 * not have. It is answered in JSON with its status, code and message, and
 * is no fault of the backend's; one that time lifts — a budget spent, a
 * store with no room — says in `Retry-After` when to try again.
 *
 * @example
 * ```ts
 * throw new Refusal(404, "NOT_FOUND", "No user #7")
 * ```
 */
export class Refusal extends Error {
  readonly status: number
  readonly code: RefusalCode
  /** The whole seconds after which the call may go, for a refusal that time lifts. */
  readonly retryAfter: number | undefined

  constructor(status: number, code: RefusalCode, message: string, retryAfter?: number) {
    super(message)
    this.name = "Refusal"
    this.status = status
    this.code = code
    this.retryAfter = retryAfter
  }
}

/**
 * A wait in whole seconds, rounded up: a caller that waits as long as it
 * is told is not refused again for it.
 *
 * @param ms - The wait, in milliseconds
 * @returns The seconds
 * @example
 * ```ts
 * wholeSeconds(1200) // 2
 * ```
 */
export function wholeSeconds(ms: number): number {
  return Math.max(0, Math.ceil(ms / 1000))
}

/**
 * The refusal for a field that is not what the call needs.
 *
 * @param field - The field, as the call names it
 * @param needs - What it has to be
 * @returns The refusal
 * @example
 * ```ts
 * throw invalidField("name", "text of 1 to 80 characters")
 * ```
 */
export function invalidField(field: string, needs: string): Refusal {
  return new Refusal(400, "INVALID_FIELD", `${field} is ${needs}`)
}
