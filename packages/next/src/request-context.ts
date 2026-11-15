import {
  addressedOrigin,
  cookieHeaderAfter,
  forwardedChain,
  type SetCookie,
} from "@noverax/courier/internal";
import {
  createLogger,
  type IncomingRequest,
  type RelayedCookie,
  type RequestContextProvider,
} from "@noverax/courier/server";

import { type NextCookie, nextCookieOf } from "./next-cookie";

const log = createLogger("Next");

/** The cookies `next/headers` hands a Server Action, a Route Handler or a page. */
interface NextCookieStore {
  set(cookie: NextCookie): unknown;
  getAll(): HeldCookie[];
}

/** A cookie `cookies()` holds: one the request sent, its value decoded, or one set since. */
interface HeldCookie {
  name: string;
  value: string;
  expires?: Date | number | undefined;
  maxAge?: number | undefined;
}

/** What `next/headers` exports, from Next.js 14, where both are synchronous, on. */
interface NextHeaders {
  headers(): Headers | Promise<Headers>;
  cookies(): NextCookieStore | Promise<NextCookieStore>;
}

let nextHeaders: Promise<NextHeaders | undefined> | undefined;

/**
 * The request a Next.js App Router is serving — a page, a Server Action, a
 * Route Handler — for the APIs that keep a `session` or `forward` headers.
 *
 * `createServerCaller` registers it for its calls. Registered by hand, it
 * belongs in the module that makes the calls, not only in
 * `instrumentation.ts`: `next build` does not run that file, and a page
 * whose calls find no request is built once, without anyone's session.
 *
 * Reading the request is what makes Next.js render a page for each request,
 * so a page whose calls carry a session is never built ahead of time;
 * an endpoint with `session: false` reads nothing. Where a page is being
 * built and no request exists, the calls carry nothing. What Next.js stops
 * a render with — a static page turning dynamic — passes through as it came.
 *
 * Each call sends the request's cookies as `cookies()` holds them when it
 * is made — those a middleware or the request's code set or deleted
 * included — a cookie Next.js holds as the browser sent it going byte for
 * byte. A cookie the API sets or deletes goes as the API wrote it with the
 * calls that follow, until the request's code changes it again.
 *
 * Next.js lets a Server Action or a Route Handler set cookies, and not a
 * page while it renders: there a session the API renews reaches the calls
 * of the same render only. Its `cookies().set()` writes a value URL-encoded,
 * so a cookie whose value is not already in that form cannot reach the
 * browser unchanged, and is not handed to it.
 *
 * Next.js tells no request's method. A Server Action's is POST; any other
 * is read as a page's, its writes carrying the session for what a browser
 * marks as the application's own — so a Route Handler's write for a client
 * that is no browser, and marks nothing, goes without it.
 *
 * @example
 * ```ts
 * // lib/api.server.ts — the module the pages call through
 * import { createProxyCaller, registerRequestContext } from "@noverax/courier/server";
 * import { nextRequestContext } from "@noverax/courier-next";
 * import { apiRoutes } from "../courier.routes";
 *
 * registerRequestContext(nextRequestContext);
 * export const api = createProxyCaller(apiRoutes);
 * ```
 */
export const nextRequestContext: RequestContextProvider = () => nextIncomingRequest();

/**
 * The request Next.js is serving, as the session reads it.
 *
 * @returns The request, or `undefined` outside one
 * @example
 * ```ts
 * const incoming = await nextIncomingRequest();
 * ```
 */
export async function nextIncomingRequest(): Promise<IncomingRequest | undefined> {
  const next = await loadNextHeaders();
  const headers = next && (await headersOf(next));
  if (next === undefined || headers === undefined) return undefined;
  const store = await next.cookies();
  return {
    key: headers,
    method: headers.has("next-action") ? "POST" : undefined,
    origin: addressedOrigin(headers),
    headers,
    cookieHeader: () => cookiesHeld(headers, store),
    clientAddress: forwardedChain(undefined, headers.get("x-forwarded-for")),
    setCookie: (cookie) => setCookieIn(store, cookie),
    /* Next.js 14 keeps what a server's fetch answers in its data cache
       unless told not to; an answer for one user belongs there for nobody. */
    fetchInit: { cache: "no-store" },
  };
}

function loadNextHeaders(): Promise<NextHeaders | undefined> {
  /* With its extension: next ships no exports map, and Node's own loader
     resolves no other form of it. */
  nextHeaders ??= import("next/headers.js").then(
    (module) => module as NextHeaders,
    (error: unknown) => {
      log.warn("next/headers could not be loaded; calls carry nothing of the request", error);
      return undefined;
    },
  );
  return nextHeaders;
}

async function headersOf(next: NextHeaders): Promise<Headers | undefined> {
  try {
    return await next.headers();
  } catch (error) {
    /* A build step, a script: no request is being served. Anything else —
       a static render turning dynamic, a prerender postponed — is Next.js
       steering the render, and goes on to it. */
    if (error instanceof Error && error.message.includes("outside a request scope"))
      return undefined;
    throw error;
  }
}

/* The request's cookies as `cookies()` holds them: the `Cookie` a Server Action and a Route Handler
   read through `headers()` leaves out a middleware's cookies, and those the request's code set or
   deleted. A cookie still held as Next.js read it from that header goes as the browser sent it,
   byte for byte; one set since goes as Next.js writes it, URL-encoded; one deleted goes not, nor
   one emptied, as the page a Server Action renders holds a deletion. */
function cookiesHeld(headers: Headers, store: NextCookieStore): string {
  const sent = headers.get("cookie") ?? "";
  const read = readByNext(sent);
  const changed = store
    .getAll()
    .filter(({ name, value }) => read.get(name) !== value)
    .map(setCookieOf);
  return changed.length === 0 ? sent : cookieHeaderAfter(sent, changed);
}

/* A `Cookie` header as Next.js reads it into `cookies()`: split at each `;` and the spaces after
   it, a pair with no `=` read as `"true"`, each value URL-decoded — one that does not decode
   passed over — and the last of a name winning. */
function readByNext(header: string): Map<string, string> {
  const read = new Map<string, string>();
  for (const pair of header.split(/; */)) {
    const at = pair.indexOf("=");
    if (at === -1) {
      if (pair !== "") read.set(pair, "true");
      continue;
    }
    const value = decoded(pair.slice(at + 1));
    if (value !== undefined) read.set(pair.slice(0, at), value);
  }
  return read;
}

function decoded(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

/* A cookie `cookies()` holds changed, as the browser will send it after this response. */
function setCookieOf({ name, value, expires, maxAge }: HeldCookie): SetCookie {
  if (value === "") return { name, value, maxAge: 0 };
  return {
    name,
    value: encodeURIComponent(value),
    ...(maxAge !== undefined && { maxAge }),
    ...(expires !== undefined && { expires: new Date(expires).toUTCString() }),
  };
}

function setCookieIn(store: NextCookieStore, relayed: RelayedCookie): true | string {
  const cookie = nextCookieOf(relayed);
  if (cookie === undefined) {
    return "Next.js URL-encodes a cookie's value, and this one would arrive changed; let the API URL-encode its cookies, or relay them through the proxy route";
  }
  try {
    store.set(cookie);
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Cookies can only be modified")) {
      return "Next.js lets a Server Action or a Route Handler set cookies, not a page while it renders";
    }
    throw error;
  }
}
