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
