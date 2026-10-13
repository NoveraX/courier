import { createLogger } from "../logger";
import { studioHooks } from "../studio";
import { cloneData } from "../utils/clone-data";
import { fetchingMiss, type MissesInFlight, waitForMiss } from "./cache-in-flight";
import { cacheKey } from "./cache-key";
import { defineMiddleware } from "./define";
import type { Middleware, MiddlewareContext, MiddlewareResponse } from "./types";

const log = createLogger("Middleware");

/** A cached response and the moment it stops being usable. */
export interface CacheEntry {
  data: MiddlewareResponse;
  expiry: number;
}

/** Where cached responses live. A `Map` satisfies this. */
export interface CacheStore {
  get(key: string): CacheEntry | undefined;
  set(key: string, entry: CacheEntry): void;
  delete(key: string): boolean;
  readonly size: number;
  keys(): Iterable<string>;
}

/**
 * How responses are partitioned between callers.
 *
 * There is deliberately no default. A cache keyed only on the endpoint and its
 * variables hands one caller's authenticated response to the next one, and a
 * shape that does that by omission is the wrong shape.
 *
 *  - `"public"` — the response is the same whoever asks, so one copy serves
 *    everyone. Say this only when it is true. A call that carries the user's
 *    session — its API's `session` — is never answered from it.
 *  - `"session"` — one partition per set of credentials the call sends, its
 *    `Cookie` and `Authorization`, kept as their SHA-256 digest; calls that
 *    send none share one.
 *  - a function — returns the part of the key that identifies the caller.
 *    Read `ctx.request`, not `ctx.headers`: the latter has already been
 *    narrowed to what the allowlist forwards upstream.
 */
export type CacheScope = "public" | "session" | ((ctx: MiddlewareContext) => string);

export interface CacheOptions {
  /** How responses are partitioned between callers. */
  scope: CacheScope;
  /** Time-to-live in milliseconds (default: 60000) */
  ttl?: number | undefined;
  /** Entries retained before the oldest are dropped (default: 1000) */
  maxEntries?: number | undefined;
  /** Custom storage (default: in-memory, per middleware instance) */
  storage?: CacheStore | undefined;
}

const DEFAULT_TTL_MS = 60_000;
const DEFAULT_MAX_ENTRIES = 1000;

/**
 * Cache successful reads for a while.
 *
 * Every caller receives a copy of its own, made with `structuredClone`, so a
 * caller editing what it got cannot change what the next one gets. An answer
 * holding a value that cannot be copied — a function, say — is not cached.
 * Class instances come back as plain objects, as the structured clone
 * algorithm makes them.
 *
 * @param options - Partitioning, lifetime and bound for the cache
 * @returns The middleware, to place on a source or an endpoint
 *
 * @example
 * ```ts
 * // A response every caller may see
 * cacheMiddleware({ scope: "public", ttl: 30_000 });
 *
 * // One partition per caller
 * cacheMiddleware({
 *   scope: (ctx) => ctx.request?.headers.get("authorization") ?? "anonymous",
 * });
 *
 * // One partition per user's session
 * cacheMiddleware({ scope: "session", ttl: 10_000 });
 * ```
 */
export function cacheMiddleware(options: CacheOptions): Middleware {
  const {
    scope,
    ttl = DEFAULT_TTL_MS,
    maxEntries = DEFAULT_MAX_ENTRIES,
    storage = new Map<string, CacheEntry>(),
  } = options;
  const inFlight: MissesInFlight = new Map();

  // Wraps because it may short-circuit (cache hit) or store (post-fetch)
  return defineMiddleware("cache", "wrap", async (ctx, next) => {
    const dt = studioHooks;
    /* The request Studio shows, so a hit marks the request it served. */
    const requestId = ctx._requestId ?? `${ctx.source}:${ctx.group ?? ""}:${ctx.method}`;

    if (!isCacheable(ctx)) return next();
    if (scope === "public" && ctx.carriesSession) {
      warnSessionInPublic(ctx);
      return next();
    }

    const key = await cacheKey(ctx, scope);
    const cached = storage.get(key);
    const hit = cached && cached.expiry > Date.now() ? copyOf(cached.data) : undefined;
    if (cached && hit) {
      dt.onCacheHit?.({
        requestId,
        key,
        age: Date.now() - (cached.expiry - ttl),
        timestamp: Date.now(),
      });
      return hit;
    }
    if (cached) storage.delete(key);

    /* A miss another call is fetching already is that call's answer, as a hit would be. Looking
       for one and recording this call's own happen with nothing awaited between them. */
    const pending = inFlight.get(key);
    const shared = pending && (await waitForMiss(pending, ctx.signal));
    const sharedCopy = shared && copyOf(shared);
    if (sharedCopy) {
      dt.onCacheHit?.({ requestId, key, age: 0, timestamp: Date.now() });
      return sharedCopy;
    }

    dt.onCacheMiss?.({ requestId, key, timestamp: Date.now() });

    const answered = next();
    const stored = answered.then((response) =>
      isStorable(response) ? copyOf(response) : undefined,
    );
    /* A failed call is answered by its rejection below; what it would have stored is nothing. */
    void stored.catch(() => undefined);
    if (pending === undefined) fetchingMiss(inFlight, key, stored);
    const response = await answered;
    const kept = await stored;

    if (kept) {
      evictIfFull(storage, maxEntries);
      storage.set(key, { data: kept, expiry: Date.now() + ttl });
      dt.onCacheStore?.({ requestId, key, ttl, timestamp: Date.now() });
    }

    return response;
  });
}

/** A call whose answer could be shared with a later identical one. */
function isCacheable(ctx: MiddlewareContext): boolean {
  if (ctx.kind === "mutation") return false;
  /* A request the session makes is made for the cookies its answer sets. */
  if (ctx.purpose !== undefined) return false;
  /* A multipart body has no stable textual form, so every upload to an
     endpoint would otherwise collide on one entry. */
  if (typeof FormData !== "undefined" && ctx.variables instanceof FormData) return false;
  return true;
}

/** A response that can be replayed without belonging to whoever earned it. */
function isStorable(response: MiddlewareResponse): boolean {
  if (response.status < 200 || response.status >= 300) return false;
  /* Set-Cookie makes a response the property of one caller by construction. */
  if (response.headers?.has("set-cookie")) return false;
  /* A stream is consumed by its first reader; the second would get nothing. */
  if (isStream(response.data)) return false;
  return true;
}

/**
 * An answer nobody else holds.
 *
 * Each caller gets a copy of the stored answer, so one that edits its result
 * edits no later caller's. Undefined when the data holds something the
 * structured clone algorithm refuses; such an answer is not shared at all.
 */
function copyOf(response: MiddlewareResponse): MiddlewareResponse | undefined {
  try {
    return {
      status: response.status,
      headers: new Headers(response.headers),
      data: cloneData(response.data),
    };
  } catch (error) {
    if (!(error instanceof Error && error.name === "DataCloneError")) throw error;
    log.debug("Answer not cached: its data holds a value that cannot be copied", error);
    return undefined;
  }
}

function isStream(data: unknown): boolean {
  return (
    typeof ReadableStream !== "undefined" &&
    (data instanceof ReadableStream ||
      (typeof data === "object" && data !== null && Symbol.asyncIterator in data))
  );
}

const warnedPublic = new Set<string>();

/* Said once an endpoint: every call to it would say it again. */
function warnSessionInPublic(ctx: MiddlewareContext): void {
  const name = [ctx.source, ctx.group, ctx.method].filter(Boolean).join(".");
  if (warnedPublic.has(name)) return;
  warnedPublic.add(name);
  log.warn(
    `${name} carries the user's session, so its answer is not shared through a public cache. Give the endpoint { session: false } if it answers everyone alike, or cache it with scope "session"`,
  );
}

/** Drop the oldest entries so a client-shaped key cannot grow the store forever. */
function evictIfFull(storage: CacheStore, maxEntries: number): void {
  while (storage.size >= maxEntries) {
    const oldest = storage.keys()[Symbol.iterator]().next();
    if (oldest.done) return;
    storage.delete(oldest.value);
  }
}
