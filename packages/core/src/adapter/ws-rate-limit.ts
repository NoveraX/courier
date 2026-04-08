/** Token bucket state for per-connection rate limiting */
export interface RateLimitBucket {
  tokens: number;
  lastRefillAt: number;
}

/**
 * Create a fresh token bucket initialized at full capacity.
 *
 * @param maxTokens - Maximum tokens (equals max messages per second)
 * @returns Fresh bucket ready for rate-limiting
 *
 * @example
 * const bucket = createBucket(100); // 100 msg/s limit
 * consumeToken(bucket, 100); // → true (allowed)
 */
export function createBucket(maxTokens: number): RateLimitBucket {
  return { tokens: maxTokens, lastRefillAt: Date.now() };
}

/**
 * Check and consume a token from the bucket.
 * Refills tokens based on elapsed time since last check — no timers needed.
 *
 * @returns true if the message is allowed, false if rate-limited
 */
export function consumeToken(bucket: RateLimitBucket, maxTokens: number): boolean {
  const now = Date.now();
  const elapsed = Math.max(0, now - bucket.lastRefillAt);

  // Refill proportionally to elapsed time
  const refill = (elapsed / 1000) * maxTokens;
  bucket.tokens = Math.min(maxTokens, bucket.tokens + refill);
  bucket.lastRefillAt = now;

  if (bucket.tokens < 1) return false;

  bucket.tokens--;
  return true;
}
