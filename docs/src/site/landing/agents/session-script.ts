/** A tool call the agent makes in the session, and what came of it. */
export interface ScriptCall {
  readonly tool: string
  readonly args: string
  readonly access: "read" | "destructive"
  readonly verb: "GET" | "POST"
  /** The endpoint behind the tool, as the client calls it. */
  readonly endpoint: string
  readonly status: number
  readonly ms: number
  readonly result: string
}

/** What the person asks the agent. */
export const SESSION_PROMPT = "Cancel Ada's latest order, she changed her mind"

/** What the agent answers once its calls are done. */
export const SESSION_REPLY = "Done. Order o_7f2a is cancelled and the payment refunded."

/** The middleware each call runs through, in order, before it reaches the API. */
export const SESSION_MIDDLEWARE = ["auth", "rate limit", "audit"] as const

/** The agent's calls, in the order it makes them. */
export const SESSION_CALLS: readonly ScriptCall[] = [
  {
    tool: "shop_orders_list",
    args: '{ shopper: "ada" }',
    access: "read",
    verb: "GET",
    endpoint: "shop.orders.list",
    status: 200,
    ms: 38,
    result: "3 orders · newest o_7f2a, placed",
  },
  {
    tool: "shop_orders_cancel",
    args: '{ id: "o_7f2a" }',
    access: "destructive",
    verb: "POST",
    endpoint: "shop.orders.cancel",
    status: 200,
    ms: 64,
    result: "o_7f2a · cancelled",
  },
]

/** How far one call has gone: not made yet, through some of the middleware, or answered. */
export type CallProgress = "unmade" | "waiting" | number | "done"

/** Where the person's confirmation stands. */
export type ConfirmState = "hidden" | "asking" | "pointing" | "pressed"

/** The session at one moment of its loop. */
export interface SessionFrame {
  /** How many characters of the prompt are typed. */
  readonly typed: number
  readonly thinking: boolean
  /** Each call's progress; a number counts the middleware lit, the API last. */
  readonly calls: readonly CallProgress[]
  readonly confirm: ConfirmState
  /** How many characters of the reply are shown. */
  readonly replied: number
}

/** The loop's length, in ticks of 100 ms. */
export const SESSION_TICKS = 170
/** A moment in the loop where everything has happened, for a reader who asked for less motion. */
export const SESSION_STILL = 150

const TYPE_FROM = 6
const THINK_FROM = 30
const CALL_STARTS = [38, 58] as const
const CONFIRM = { asking: 61, pointing: 74, pressed: 80, done: 84 } as const
const STAGE_TICKS = 3
const REPLY_FROM = 106

function callProgress(at: number, start: number, waitUntil: number): CallProgress {
  if (at < start) return "unmade"
  if (at < waitUntil) return "waiting"
  const stage = Math.floor((at - waitUntil) / STAGE_TICKS)
  return stage > SESSION_MIDDLEWARE.length ? "done" : stage
}

function confirmState(at: number): ConfirmState {
  if (at < CONFIRM.asking) return "hidden"
  if (at < CONFIRM.pointing) return "asking"
  return at < CONFIRM.pressed ? "pointing" : "pressed"
}

/**
 * The session at a tick of its loop: the prompt typed, the agent
 * thinking, its first call running through the middleware, its second
 * waiting on the person's confirmation and then running, and its reply.
 *
 * @param tick - Ticks of 100 ms since the session started; it loops
 * @returns The frame
 * @example
 * ```ts
 * sessionFrame(SESSION_STILL).calls // ["done", "done"]
 * ```
 */
export function sessionFrame(tick: number): SessionFrame {
  const at = tick % SESSION_TICKS
  return {
    typed: Math.max(0, Math.min(SESSION_PROMPT.length, (at - TYPE_FROM) * 2)),
    thinking: at >= THINK_FROM && at < (CALL_STARTS[0] ?? 0),
    calls: [
      callProgress(at, CALL_STARTS[0], CALL_STARTS[0] + 1),
      callProgress(at, CALL_STARTS[1], CONFIRM.done),
    ],
    confirm: confirmState(at),
    replied: Math.max(0, Math.min(SESSION_REPLY.length, (at - REPLY_FROM) * 3)),
  }
}
