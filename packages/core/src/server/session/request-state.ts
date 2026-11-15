import { cookieJarOf } from "../../session/cookie-header";
import type { IncomingRequest } from "../../session/incoming-request";
import { isDeletion, type SetCookie } from "../../session/set-cookie";

/** A cookie the API set or deleted, as the calls made for the request still send it. */
interface KeptCookie {
  /** The value it set; `undefined` for one it deleted */
  readonly value: string | undefined;
  /** What the request held of the cookie once it was handed on */
  readonly held: string | undefined;
}

/** What the calls made for one request share while it is served. */
interface RequestState {
  /** The cookies the API has set or deleted for it so far, by name */
  kept?: Map<string, KeptCookie>;
  /** The id its calls are made under, when they forward one */
  requestId?: string;
}

/* Kept on the global object: a bundler may load this module twice — Nuxt's
   webpack and Rspack builders bundle a page's own copy of Courier beside the
   server's — and the calls each copy makes for a request must share it. */
const STATES_KEY = Symbol.for("courier.session.request-states");
const g = globalThis as Record<symbol, unknown>;
g[STATES_KEY] ??= new WeakMap<object, RequestState>();
const states = g[STATES_KEY] as WeakMap<object, RequestState>;

function stateOf(incoming: IncomingRequest): RequestState {
  let state = states.get(incoming.key);
  if (state === undefined) {
    state = {};
    states.set(incoming.key, state);
  }
  return state;
}

/**
 * The cookies of the request being served as a call made for it sees them:
 * the request's own, as its framework holds them when the call is made,
 * with each the API has set or deleted since. A session the API renews in
 * one call is the one the next call sends, before the browser has even
 * received it — unless the request's code changes that cookie after it was
 * handed on, which makes the code's change the later one.
 *
 * @param incoming - The request being served
 * @returns Its cookies by name
 * @example
 * ```ts
 * cookieJarFor(incoming).get("sid"); // "a1"
 * ```
 */
export function cookieJarFor(incoming: IncomingRequest): ReadonlyMap<string, string> {
  const jar = heldCookies(incoming);
  for (const [name, { value, held }] of stateOf(incoming).kept ?? []) {
    /* The request holds the cookie as it did once the API's was handed on: nothing changed it since. */
    if (jar.get(name) !== held) continue;
    if (value === undefined) jar.delete(name);
    else jar.set(name, value);
  }
  return jar;
}

/**
 * Record a cookie the API set, or deleted, for the rest of the request.
 * Recorded once it has been handed on, as the request then holds it: a
 * framework that holds what it was handed holds the API's cookie, and one
 * that holds it otherwise later is holding a change the request's code made.
 *
 * @param incoming - The request being served
 * @param cookie - The cookie, as the API set it
 * @example
 * ```ts
 * keepCookie(incoming, { name: "sid", value: "b2" });
 * ```
 */
export function keepCookie(incoming: IncomingRequest, cookie: SetCookie): void {
  const state = stateOf(incoming);
  state.kept ??= new Map();
  state.kept.set(cookie.name, {
    value: isDeletion(cookie) ? undefined : cookie.value,
    held: heldCookies(incoming).get(cookie.name),
  });
}

/* The request's cookies as its framework holds them now, or as it brought them. */
function heldCookies(incoming: IncomingRequest): Map<string, string> {
  const { cookieHeader } = incoming;
  return cookieJarOf(cookieHeader === undefined ? incoming.headers.get("cookie") : cookieHeader());
}

/**
 * The id the calls made for a request share, made once by `create` and kept.
 *
 * @param incoming - The request being served
 * @param create - Makes the id, the first time it is asked for
 * @returns The id
 * @example
 * ```ts
 * requestIdFor(incoming, () => crypto.randomUUID());
 * ```
 */
export function requestIdFor(incoming: IncomingRequest, create: () => string): string {
  const state = stateOf(incoming);
  state.requestId ??= create();
  return state.requestId;
}
