import {
  createLogger,
  type IncomingRequest,
  type RelayedCookie,
  type RequestContextProvider,
} from "@noverax/courier";
import { addressedOrigin } from "@noverax/courier/internal";

const log = createLogger("Next");

/** The cookies `next/headers` hands a Server Action, a Route Handler or a page. */
interface NextCookieStore {
  set(cookie: NextCookie): unknown;
}

/** A cookie as `cookies().set()` takes it. */
interface NextCookie {
  name: string;
  value: string;
  path?: string;
  domain?: string;
  expires?: Date;
  maxAge?: number;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "strict" | "lax" | "none";
  partitioned?: boolean;
  priority?: "low" | "medium" | "high";
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
 * import { createProxyCaller, registerRequestContext } from "@noverax/courier";
 * import { nextRequestContext } from "@noverax/courier-next";
 *
 * registerRequestContext(nextRequestContext);
 * export const api = createProxyCaller<typeof definition>("api");
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
    clientAddress: nearestHop(headers.get("x-forwarded-for")),
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

/* The address the proxy nearest the application recorded, or Next.js itself where none is in front. */
function nearestHop(chain: string | null): string | undefined {
  return chain?.split(",").at(-1)?.trim() || undefined;
}

function setCookieIn(store: NextCookieStore, { cookie }: RelayedCookie): true | string {
  const value = decodedExactly(cookie.value);
  if (value === undefined) {
    return "Next.js URL-encodes a cookie's value, and this one would arrive changed; let the API URL-encode its cookies, or relay them through the proxy route";
  }
  try {
    store.set({ ...attributesOf(cookie), name: cookie.name, value });
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Cookies can only be modified")) {
      return "Next.js lets a Server Action or a Route Handler set cookies, not a page while it renders";
    }
    throw error;
  }
}

/* The value `encodeURIComponent` turns back into exactly the one the API sent, if one does. */
function decodedExactly(raw: string): string | undefined {
  try {
    const decoded = decodeURIComponent(raw);
    return encodeURIComponent(decoded) === raw ? decoded : undefined;
  } catch {
    /* A `%` that starts no escape: no decoded value encodes back to it. */
    return undefined;
  }
}

function attributesOf(cookie: RelayedCookie["cookie"]): Omit<NextCookie, "name" | "value"> {
  return {
    path: cookie.path ?? "/",
    ...(cookie.domain !== undefined && { domain: cookie.domain }),
    ...(cookie.expires !== undefined && { expires: new Date(cookie.expires) }),
    ...(cookie.maxAge !== undefined && { maxAge: cookie.maxAge }),
    secure: cookie.secure === true,
    httpOnly: cookie.httpOnly === true,
    ...(cookie.sameSite !== undefined && { sameSite: lower(cookie.sameSite) }),
    ...(cookie.partitioned && { partitioned: true }),
    ...(cookie.priority !== undefined && { priority: lower(cookie.priority) }),
  };
}

function lower<TValue extends string>(value: TValue): Lowercase<TValue> {
  return value.toLowerCase() as Lowercase<TValue>;
}
