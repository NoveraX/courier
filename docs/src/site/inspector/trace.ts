/** Where a call was made: through the site's proxy route, while a page rendered, or in a Server Action. */
export type CallSite = "proxy" | "render" | "action"

/** One request of a call to the API, as the site's server made it. */
export interface ApiAttempt {
  /** The request's method, as `POST`. */
  readonly method: string
  /** Its path and query, the API's own address left out, as `/users?page=1`. */
  readonly target: string
  /** How it ended: the API's status, or `timeout`, `cancelled`, `no-answer`. */
  readonly outcome: string
  /** When it was sent, in ms after the call reached the site's server. */
  readonly at: number
  /** How long it took, in ms. */
  readonly ms: number
}

/** A middleware of the call's chain, as it ran. */
export interface ChainLink {
  readonly name: string
  /** When it runs: `before`, `after` or `wrap`. */
  readonly phase: string
  /** Its own time, in ms: the rest of the chain and the request left out. */
  readonly ms: number
  /** The names of the headers it added to the request. */
  readonly added: readonly string[]
}

/** How a call's request reached the site's server: what the browser sent it. */
export interface ReceivedRequest {
  readonly method: string
  /** The address's path and query, as `/api/request?_s=api&_g=users&_m=create`. */
  readonly target: string
  /** The names of the headers it came with; a cookie header's are its cookies' names. */
  readonly headers: readonly string[]
  /** Its body's media type and length, as `application/json 86`, when it had a body. */
  readonly body?: string | undefined
}

/**
 * What the site's server saw of one call: how it arrived, each request it
 * made to the API, the chain it ran through, and how it answered. It holds
 * names, statuses and times — never a header's value, a cookie's, the
 * visitor's address or the API's own address.
 */
export interface CallTrace {
  readonly site: CallSite
  /** The id the core gave the call, as its answer's `X-Courier-Rid` names it. */
  readonly rid?: string | undefined
  /** How the browser's request reached the site's server: a proxied call's alone. */
  readonly received?: ReceivedRequest | undefined
  /** The call's variables, as the proxy read them: cut short, and with any secret masked. */
  readonly variables?: string | undefined
  readonly attempts: readonly ApiAttempt[]
  /** The names of the headers Courier sent the API, beside those fetch sets for the body. */
  readonly sent: readonly string[]
  /** The names of the headers the API answered with. */
  readonly answered: readonly string[]
  readonly chain: readonly ChainLink[]
  /** What the call's middleware logged. */
  readonly log: readonly string[]
  /** How the server's cache took the call: `miss`, `store 30000`, `hit 2100`. */
  readonly cache: readonly string[]
  /** The status the site's server answered with. */
  readonly status?: number | undefined
  /** How long the site's server took over the call, in ms, as the core measured it. */
  readonly ms?: number | undefined
  /** The names of the headers the site's server answered the browser with. */
  readonly passedBack: readonly string[]
  /** How many events or metrics the trace's limits left out. */
  readonly cut: number
}

/** One metric of a `Server-Timing` header, its description as it travels. */
export interface TimingMetric {
  readonly name: string
  /** Its duration in ms, when it gives one. */
  readonly duration?: number | undefined
  readonly description: string
}
