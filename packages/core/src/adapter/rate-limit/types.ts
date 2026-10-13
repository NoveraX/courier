/** One budget: how many calls one caller may make in each window. */
export interface RateLimitWindow {
  /** Calls one caller may make in each window. */
  readonly requests: number;
  /** The window, in milliseconds. */
  readonly window: number;
}

/** What taking one call from a caller's budget came to. */
export interface RateLimitDecision {
  /** Whether the call may go. */
  readonly allowed: boolean;
  /** Calls left in the budget after this one. */
  readonly remaining: number;
  /** Milliseconds until the budget is whole again. */
  readonly resetMs: number;
  /** Milliseconds until a refused call may go; `0` for one that may go now. */
  readonly retryAfterMs: number;
}

/**
 * Where callers' counts are kept. The process keeps them by default; a
 * store every replica shares — `createRedisRateLimitStore` from
 * `@noverax/courier-redis` — holds one caller to one budget however many
 * replicas serve it.
 */
export interface RateLimitStore {
  /**
   * Take one call from a caller's budget, and say whether it may go.
   *
   * @param key - The caller, and the budget it takes from
   * @param limit - The budget
   * @returns What taking the call came to
   */
  take(key: string, limit: RateLimitWindow): RateLimitDecision | Promise<RateLimitDecision>;
}

/**
 * How many calls one caller may make through the proxy, so a script that
 * calls your APIs through it with your server's keys is held to what a
 * person would make: every call takes from `requests` in each `window`,
 * and a write from `writes` as well.
 *
 * @example
 * ```ts
 * createHandler({ rateLimit: { requests: 300, window: 60_000, writes: { requests: 20, window: 60_000 } } });
 * ```
 */
export interface ProxyRateLimit extends RateLimitWindow {
  /** A tighter budget for writes — form posts, orders, messages — taken on top of the one every call takes. */
  readonly writes?: RateLimitWindow | undefined;
  /**
   * Who one caller is. By default the user's address, read from the right
   * of the forwarding chain past the deployment's proxies, an IPv6 /64
   * network counting as one. Return a session's id to count signed-in
   * users apart behind one address, or `undefined` to leave a request out.
   */
  readonly key?:
    | ((request: Request) => string | undefined | Promise<string | undefined>)
    | undefined;
  /** Where the counts are kept: this process by default. */
  readonly store?: RateLimitStore | undefined;
}
