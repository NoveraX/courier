import { LIMITS } from "./limits";
import { META_KEYS } from "./parse";

/**
 * Extract non-meta query params as endpoint variables.
 * Meta keys (_s, _g, _m, _transport) are excluded.
 *
 * @param params - URL search params from the SSE request
 * @returns Variable record or undefined if no variables present
 *
 * @example
 * // URL: /api/sse?_s=api&_g=chat&_m=feed&roomId=general
 * extractVariables(url.searchParams) // → { roomId: "general" }
 */
export function extractVariables(params: URLSearchParams): Record<string, string> | undefined {
  const vars: Record<string, string> = {};
  let hasVars = false;
  for (const [key, value] of params.entries()) {
    if (!META_KEYS.has(key)) {
      vars[key] = value;
      hasVars = true;
    }
  }
  return hasVars ? vars : undefined;
}

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
): { signal: AbortSignal; ttlSignal?: AbortSignal } {
  const signals: AbortSignal[] = [requestSignal, shutdownSignal];
  const ttl = maxLifetimeMs ?? LIMITS.SSE_MAX_LIFETIME_MS;

  // TTL of 0 disables max lifetime (infinite connections)
  const ttlSignal = ttl > 0 ? AbortSignal.timeout(ttl) : undefined;
  if (ttlSignal) signals.push(ttlSignal);

  return { signal: AbortSignal.any(signals), ttlSignal };
}
