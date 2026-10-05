/** The p95 from which an endpoint reads as slow, ms. */
export const P95_SLOW_MS = 1000;

/** The p95 from which an endpoint risks timing out, ms. */
export const P95_TIMEOUT_MS = 5000;

/** The share of failed calls from which an endpoint's error rate is high. */
export const ERROR_RATE_HIGH = 0.2;

/** The average response size from which a response is oversized, bytes. */
export const LARGE_RESPONSE_BYTES = 1_048_576;
