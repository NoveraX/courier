import { studioHooks } from "../studio";
import { defineMiddleware } from "./compose";
import type { Middleware, MiddlewareResponse } from "./types";

/**
 * Cache middleware — caches successful responses with TTL.
 *
 * @example
 * defineApi({
 *   middleware: [cacheMiddleware({ ttl: 30_000 })],
 *   groups: { ... },
 * })
 */
export function cacheMiddleware(options?: {
  /** Time-to-live in milliseconds (default: 60000) */
  ttl?: number;
  /** Custom storage map (default: in-memory Map) */
  storage?: Map<string, { data: MiddlewareResponse; expiry: number }>;
}): Middleware {
  const { ttl = 60_000, storage = new Map() } = options ?? {};

  // Wraps because it may short-circuit (cache hit) or store (post-fetch)
  return defineMiddleware("cache", "wrap", async (ctx, next) => {
    const dt = studioHooks;
    const key = `${ctx.source}:${ctx.group ?? ""}:${ctx.method}:${JSON.stringify(ctx.variables ?? {})}`;
    const requestId = `${ctx.source}:${ctx.group ?? ""}:${ctx.method}`;

    const cached = storage.get(key);
    if (cached && cached.expiry > Date.now()) {
      dt.onCacheHit?.({
        requestId,
        key,
        age: Date.now() - (cached.expiry - ttl),
        timestamp: Date.now(),
      });
      return cached.data;
    }

    dt.onCacheMiss?.({ requestId, key, timestamp: Date.now() });

    const response = await next();

    if (response.status >= 200 && response.status < 300) {
      storage.set(key, { data: response, expiry: Date.now() + ttl });
      dt.onCacheStore?.({ requestId, key, ttl, timestamp: Date.now() });
    }

    return response;
  });
}
