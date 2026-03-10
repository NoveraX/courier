export type {
  MiddlewareContext,
  MiddlewareFn,
  MiddlewareResponse,
  NextFn,
} from "./types";

import { devtoolsHooks } from "../devtools";
import type { MiddlewareFn, MiddlewareResponse } from "./types";

/**
 * Define a typed middleware function.
 *
 * @example
 * const auth = defineMiddleware(async (ctx, next) => {
 *   ctx.headers.set("Authorization", `Bearer ${token}`);
 *   return next();
 * });
 */
export function defineMiddleware(fn: MiddlewareFn): MiddlewareFn {
  return fn;
}

/**
 * Compose multiple middleware into a single middleware function.
 * Middleware execute in array order: first is outermost (runs first on request, last on response).
 */
export function composeMiddleware(middlewares: MiddlewareFn[]): MiddlewareFn {
  if (middlewares.length === 0) {
    return (_ctx, next) => next();
  }

  const dt = devtoolsHooks;
  const totalCount = middlewares.length;

  return (ctx, next) => {
    function dispatch(i: number): Promise<MiddlewareResponse> {
      const fn = middlewares[i];
      if (!fn) return next();

      const name = fn.name || `middleware[${i}]`;
      const requestId = `${ctx.source}:${ctx.group ?? ""}:${ctx.method}`;

      dt.onMiddlewareEnter?.({
        requestId,
        name,
        index: i,
        totalCount,
        timestamp: performance.now(),
      });

      const t0 = dt.onMiddlewareExit ? performance.now() : 0;

      return fn(ctx, () => dispatch(i + 1)).then(
        (response) => {
          dt.onMiddlewareExit?.({
            requestId,
            name,
            index: i,
            duration: performance.now() - t0,
            timestamp: performance.now(),
          });
          return response;
        },
        (error) => {
          dt.onMiddlewareError?.({
            requestId,
            name,
            index: i,
            error: error instanceof Error ? error.message : String(error),
            timestamp: performance.now(),
          });
          throw error;
        },
      );
    }
    return dispatch(0);
  };
}

// ---- built-in middleware ----

/**
 * Retry middleware with exponential backoff.
 *
 * @example
 * defineApi({
 *   middleware: [retryMiddleware({ limit: 3, backoff: 300 })],
 *   groups: { ... },
 * })
 */
export function retryMiddleware(options?: {
  /** Maximum number of retries (default: 3) */
  limit?: number;
  /** Base delay in ms for exponential backoff (default: 300) */
  backoff?: number;
  /** Custom retry condition (default: status >= 500) */
  retryOn?: (response: MiddlewareResponse) => boolean;
}): MiddlewareFn {
  const { limit = 3, backoff = 300, retryOn } = options ?? {};

  return defineMiddleware(async (_ctx, next) => {
    for (let attempt = 0; attempt <= limit; attempt++) {
      try {
        const response = await next();

        if (attempt < limit && (retryOn ? retryOn(response) : response.status >= 500)) {
          await delay(backoff * 2 ** attempt);
          continue;
        }

        return response;
      } catch (error) {
        if (attempt === limit) throw error;
        await delay(backoff * 2 ** attempt);
      }
    }

    throw new Error("Retry exhausted");
  });
}

/**
 * Logging middleware — logs endpoint, status, and duration.
 *
 * @example
 * defineApi({
 *   middleware: [logMiddleware()],
 *   groups: { ... },
 * })
 */
export function logMiddleware(options?: {
  /** Custom logger function (default: console.log) */
  logger?: (message: string) => void;
}): MiddlewareFn {
  const { logger = console.log } = options ?? {};

  return defineMiddleware(async (ctx, next) => {
    const label = [ctx.source, ctx.group, ctx.method].filter(Boolean).join(":");
    const start = performance.now();

    try {
      const response = await next();
      const ms = Math.round(performance.now() - start);
      logger(`${label} → ${response.status} (${ms}ms)`);
      return response;
    } catch (error) {
      const ms = Math.round(performance.now() - start);
      logger(`${label} → ERROR (${ms}ms)`);
      throw error;
    }
  });
}

/**
 * Auth middleware — attaches token and optionally refreshes on 401.
 *
 * @example
 * defineApi({
 *   middleware: [authMiddleware({ getToken: () => localStorage.getItem("token")! })],
 *   groups: { ... },
 * })
 */
export function authMiddleware(options: {
  /** Function to get the current auth token */
  getToken: () => string | Promise<string>;
  /** Optional function to refresh the token on 401 */
  refreshToken?: () => string | Promise<string>;
  /** Header name (default: "Authorization") */
  header?: string;
  /** Auth scheme prefix (default: "Bearer") */
  scheme?: string;
}): MiddlewareFn {
  const { getToken, refreshToken, header = "Authorization", scheme = "Bearer" } = options;

  const formatToken = (token: string) => (scheme ? `${scheme} ${token}` : token);

  return defineMiddleware(async (ctx, next) => {
    const token = await getToken();
    ctx.headers.set(header, formatToken(token));

    const response = await next();

    if (response.status === 401 && refreshToken) {
      const newToken = await refreshToken();
      ctx.headers.set(header, formatToken(newToken));
      return next();
    }

    return response;
  });
}

/**
 * Rate limit middleware — delays requests to stay within limits.
 *
 * @example
 * defineApi({
 *   middleware: [rateLimitMiddleware({ maxRequests: 10, window: 1000 })],
 *   groups: { ... },
 * })
 */
export function rateLimitMiddleware(options: {
  /** Maximum number of requests in the window */
  maxRequests: number;
  /** Time window in milliseconds */
  window: number;
}): MiddlewareFn {
  const { maxRequests, window: windowMs } = options;
  const timestamps: number[] = [];

  return defineMiddleware(async (_ctx, next) => {
    const now = Date.now();

    // Remove expired timestamps
    while (timestamps.length > 0 && timestamps[0]! <= now - windowMs) {
      timestamps.shift();
    }

    // Wait if at limit
    if (timestamps.length >= maxRequests && timestamps[0] !== undefined) {
      const waitMs = timestamps[0] + windowMs - now;
      await delay(waitMs);
    }

    timestamps.push(Date.now());
    return next();
  });
}

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
    const key = `${ctx.source}:${ctx.group ?? ""}:${ctx.method}:${JSON.stringify(ctx.variables ?? {})}`;

    const cached = storage.get(key);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    const response = await next();

    if (response.status >= 200 && response.status < 300) {
      storage.set(key, { data: response, expiry: Date.now() + ttl });
    }

    return response;
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
