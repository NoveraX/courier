import { anySignal } from "../utils/any-signal";
import { LIMITS } from "./limits";

/**
 * Combine request abort signal + shutdown signal + optional TTL into a single AbortSignal.
 * Used to control SSE stream lifetime — stream closes when ANY signal fires.
 *
 * @param requestSignal - Client disconnect signal (from Request.signal)
 * @param shutdownSignal - Server shutdown signal (from SSE registry)
 * @param maxLifetimeMs - Optional max stream lifetime in ms (e.g. 30 min)
 * @returns Combined signal + optional TTL signal for lifecycle tracking
 */
export function createLifetimeSignal(
  requestSignal: AbortSignal,
  shutdownSignal: AbortSignal,
  maxLifetimeMs?: number,
): { signal: AbortSignal; ttlSignal?: AbortSignal | undefined } {
  const signals: AbortSignal[] = [requestSignal, shutdownSignal];
  const ttl = maxLifetimeMs ?? LIMITS.SSE_MAX_LIFETIME_MS;

  // TTL of 0 disables max lifetime (infinite connections)
  const ttlSignal = ttl > 0 ? AbortSignal.timeout(ttl) : undefined;
  if (ttlSignal) signals.push(ttlSignal);

  return { signal: anySignal(signals), ttlSignal };
}
