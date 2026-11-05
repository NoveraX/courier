/**
 * What a retry policy does where its options say nothing, and how far they
 * may go — one place, the one the documentation's table lists.
 */
export const RETRY_DEFAULTS = {
  /** How many times a failed attempt is made again. */
  limit: 3,
  /** The most retries a policy may ask for. */
  maxLimit: 10,
  /** The wait before the first retry, in ms, which doubles with each one. */
  delay: 300,
  /** The longest one wait may be, in ms, an answer's Retry-After included. */
  maxDelay: 20_000,
  /**
   * The answers retried where `retryOn` says nothing: a request the server
   * gave up waiting for, one sent too early, too many, and the failures an
   * upstream may get over — not 501, which it will not.
   */
  statuses: [408, 425, 429, 500, 502, 503, 504],
  /**
   * The retry budget an API's calls share, as AWS SDKs keep one: each retry
   * spends a share of it, one after a timeout twice as much, and a call
   * answered without one gives a little back, so a failing upstream is not
   * met with a storm of retries.
   */
  budget: { capacity: 500, cost: 5, timeoutCost: 10, refill: 1 },
} as const;
