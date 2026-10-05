/** The words of the streamed answer, as they arrive. */
export const STREAM_TOKENS: readonly string[] = [
  "Courier",
  " types",
  " every",
  " call",
  " from",
  " one",
  " definition,",
  " proxies",
  " it",
  " through",
  " one",
  " route",
  " and",
  " streams",
  " the",
  " answer",
  " as",
  " it",
  " arrives.",
]

/** The steps of one call through the middleware: in through each layer, then out. */
export const MIDDLEWARE_STEPS: readonly { layer: number; inward: boolean; message: string }[] = [
  { layer: 0, inward: true, message: "log     api:users:getById" },
  { layer: 1, inward: true, message: "retry   attempt 1" },
  { layer: 2, inward: true, message: "auth    Bearer attached" },
  { layer: 3, inward: true, message: "fetch   GET /users/5" },
  { layer: 3, inward: false, message: "fetch   200 OK · 84 ms" },
  { layer: 2, inward: false, message: "auth    passed through" },
  { layer: 1, inward: false, message: "retry   no retry needed" },
  { layer: 0, inward: false, message: "log     api:users:getById → 200 (84ms)" },
]

/** The address typed into the validation demo. */
export const TYPED_EMAIL = "ada@example.com"

const STREAM_HOLD = 22
const MIDDLEWARE_PACE = 6
const MIDDLEWARE_REST = 3

/**
 * How many words of the streamed answer have arrived at a tick: one a tick,
 * a pause on the whole answer, then the next.
 *
 * @param tick - The demo clock's tick
 * @returns The words arrived
 * @example
 * ```ts
 * streamFrame(3) // 3
 * ```
 */
export function streamFrame(tick: number): number {
  return Math.min(tick % (STREAM_TOKENS.length + STREAM_HOLD), STREAM_TOKENS.length)
}

/**
 * How far one call has gone through the middleware: a step every six
 * ticks, then a short rest before the next call.
 *
 * @param tick - The demo clock's tick
 * @returns The steps taken, up to all of them
 * @example
 * ```ts
 * middlewareFrame(12) // 2
 * ```
 */
export function middlewareFrame(tick: number): number {
  return Math.floor(tick / MIDDLEWARE_PACE) % (MIDDLEWARE_STEPS.length + MIDDLEWARE_REST)
}

const VALIDATION_RUN: readonly number[] = [
  ...Array.from({ length: 8 }, (_, at) => at + 1),
  ...Array.from({ length: 12 }, () => 8),
  ...Array.from({ length: TYPED_EMAIL.length - 8 }, (_, at) => at + 9),
  ...Array.from({ length: 20 }, () => TYPED_EMAIL.length),
  0,
]

/** A tick at which the whole address is typed: where the demo rests when motion is turned down. */
export const VALIDATION_WHOLE_TICK = VALIDATION_RUN.indexOf(TYPED_EMAIL.length)

/**
 * How much of the address is typed at a tick: a pause on a half-typed one
 * the schema refuses, then the rest, and a pause on the valid address.
 *
 * @param tick - The demo clock's tick
 * @returns The characters typed
 * @example
 * ```ts
 * validationFrame(10) // 8
 * ```
 */
export function validationFrame(tick: number): number {
  return VALIDATION_RUN[tick % VALIDATION_RUN.length] ?? 0
}

/**
 * Which line of the narrowing is lit at a tick: each for 11 ticks, the
 * last for 24.
 *
 * @param tick - The demo clock's tick
 * @returns The line, 0 to 3
 * @example
 * ```ts
 * errorsFrame(12) // 1
 * ```
 */
export function errorsFrame(tick: number): number {
  const at = tick % 57
  return at < 33 ? Math.floor(at / 11) : 3
}
