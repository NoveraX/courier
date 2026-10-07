import {
  createLogger,
  type IncomingRequest,
  type RelayedCookie,
  type RequestContextProvider,
} from "@noverax/courier";

const log = createLogger("SvelteKit");

/** A cookie's options, as SvelteKit's `cookies.set()` takes them. */
interface SvelteKitCookieOptions {
  path: string;
  domain?: string;
  expires?: Date;
  maxAge?: number;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: "strict" | "lax" | "none";
  partitioned?: boolean;
  priority?: "low" | "medium" | "high";
  encode: (value: string) => string;
}

/** The parts of SvelteKit's `RequestEvent` the session reads. */
export interface SvelteKitServerEvent {
  request: Request;
  url: URL;
  cookies: { set(name: string, value: string, options: SvelteKitCookieOptions): void };
  getClientAddress(): string;
}

const providers = new WeakMap<() => SvelteKitServerEvent, RequestContextProvider>();

/**
 * The request SvelteKit 2.20 and later is serving, found with its own
 * `getRequestEvent` — in a hook, a server `load`, a form action or an
 * endpoint. Where the platform lacks `AsyncLocalStorage`, SvelteKit knows it
 * only until the code first waits. Registering it twice registers it once.
 *
 * @param getRequestEvent - `getRequestEvent` from `$app/server`
 * @returns The provider, for `registerRequestContext`
 * @example
 * ```ts
 * // src/hooks.server.ts
 * import { getRequestEvent } from "$app/server";
 * import { registerRequestContext } from "@noverax/courier";
 * import { svelteKitRequestContext } from "@noverax/courier-sveltekit";
 *
 * registerRequestContext(svelteKitRequestContext(getRequestEvent));
 * ```
 */
export function svelteKitRequestContext(
  getRequestEvent: () => SvelteKitServerEvent,
): RequestContextProvider {
  let provider = providers.get(getRequestEvent);
  if (provider === undefined) {
    provider = () => eventNow(getRequestEvent);
    providers.set(getRequestEvent, provider);
  }
  return provider;
}

function eventNow(getRequestEvent: () => SvelteKitServerEvent): IncomingRequest | undefined {
  try {
    return svelteKitIncomingRequest(getRequestEvent());
  } catch (error) {
    /* Outside a request — or past the first wait where the platform cannot
       follow one — SvelteKit has no event to give. */
    log.debug("No request event to take a session from", error);
    return undefined;
  }
}

/**
 * A SvelteKit request event, as the session reads it: its origin is the one
 * SvelteKit addresses the app by, its user's address the one the adapter
 * vouches for, and the cookies the API sets go to `cookies.set()` exactly
 * as the API wrote them.
 *
 * @param event - The request event
 * @returns The request, as the session reads it
 * @example
 * ```ts
 * withIncomingRequest(svelteKitIncomingRequest(event), () => resolve(event));
 * ```
 */
export function svelteKitIncomingRequest(event: SvelteKitServerEvent): IncomingRequest {
  return {
    key: event,
    method: event.request.method,
    origin: event.url.origin,
    headers: event.request.headers,
    get clientAddress() {
      return clientAddressOf(event);
    },
    setCookie: (relayed) => setCookieIn(event, relayed),
  };
}

function clientAddressOf(event: SvelteKitServerEvent): string | undefined {
  try {
    return event.getClientAddress();
  } catch (error) {
    /* A page being prerendered has no client, and some adapters cannot tell. */
    log.debug("The adapter gave no client address", error);
    return undefined;
  }
}

function setCookieIn(event: SvelteKitServerEvent, { cookie }: RelayedCookie): true | string {
  try {
    event.cookies.set(cookie.name, cookie.value, optionsOf(cookie));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes("after the response has been generated")) {
      return "the response had already been generated";
    }
    throw error;
  }
}

function optionsOf(cookie: RelayedCookie["cookie"]): SvelteKitCookieOptions {
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
    /* The value is passed on as the API wrote it; SvelteKit would encode it again. */
    encode: (value) => value,
  };
}

function lower<TValue extends string>(value: TValue): Lowercase<TValue> {
  return value.toLowerCase() as Lowercase<TValue>;
}
