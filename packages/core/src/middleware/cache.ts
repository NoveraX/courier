import { devtoolsHooks } from "../devtools";
import { defineMiddleware } from "./compose";
import type { MiddlewareFn, MiddlewareResponse } from "./types";

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
}): MiddlewareFn {
  const { ttl = 60_000, storage = new Map() } = options ?? {};

  return defineMiddleware(async (ctx, next) => {
    const dt = devtoolsHooks;
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
