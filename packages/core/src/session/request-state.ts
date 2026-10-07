import { cookieJarOf } from "./cookie-header";
import type { IncomingRequest } from "./incoming-request";
import { isDeletion, type SetCookie } from "./set-cookie";

/** What the calls made for one request share while it is served. */
interface RequestState {
  /** Its cookies as the API has left them so far, read from its `Cookie` header first */
  jar?: Map<string, string>;
  /** The id its calls are made under, when they forward one */
  requestId?: string;
}

const states = new WeakMap<object, RequestState>();

function stateOf(incoming: IncomingRequest): RequestState {
  let state = states.get(incoming.key);
  if (state === undefined) {
    state = {};
    states.set(incoming.key, state);
  }
  return state;
}

/**
 * The cookies of the request being served as the calls made for it see them:
 * the ones its `Cookie` header brought, changed by every cookie the API has
 * set or deleted since. A session the API renews in one call is the one the
 * next call sends, before the browser has even received it.
 *
 * @param incoming - The request being served
 * @returns Its cookies by name
 * @example
 * ```ts
 * cookieJarFor(incoming).get("sid"); // "a1"
 * ```
 */
export function cookieJarFor(incoming: IncomingRequest): ReadonlyMap<string, string> {
  return jarOf(incoming);
}

function jarOf(incoming: IncomingRequest): Map<string, string> {
  const state = stateOf(incoming);
  state.jar ??= cookieJarOf(incoming.headers.get("cookie"));
  return state.jar;
}

/**
 * Record a cookie the API set, or deleted, for the rest of the request.
 *
 * @param incoming - The request being served
 * @param cookie - The cookie, as the API set it
 * @example
 * ```ts
 * keepCookie(incoming, { name: "sid", value: "b2" });
 * ```
 */
export function keepCookie(incoming: IncomingRequest, cookie: SetCookie): void {
  const jar = jarOf(incoming);
  if (isDeletion(cookie)) jar.delete(cookie.name);
  else jar.set(cookie.name, cookie.value);
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
