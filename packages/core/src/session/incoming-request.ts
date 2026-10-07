import type { SetCookie } from "./set-cookie";

/** The headers of a request, as much of them as forwarding reads. */
export interface HeaderReader {
  get(name: string): string | null;
}

/** A cookie on its way to the browser: parsed, and as its `Set-Cookie` header. */
export interface RelayedCookie {
  readonly cookie: SetCookie;
  readonly header: string;
}

/**
 * The request the application is serving while it makes a call — a page's,
 * a form's, a route's — as a framework adapter describes it.
 *
 * @example
 * ```ts
 * const incoming: IncomingRequest = {
 *   key: event,
 *   method: event.request.method,
 *   origin: event.url.origin,
 *   headers: event.request.headers,
 *   clientAddress: event.getClientAddress(),
 *   setCookie: ({ header }) => {
 *     appendSetCookie(header);
 *     return true;
 *   },
 * };
 * ```
 */
export interface IncomingRequest {
  /**
   * The object that stands for this request while it is served. What the
   * calls made for it share — the cookies the API has changed so far, the
   * request's id — is kept against it, and goes when it goes.
   */
  readonly key: object;
  /**
   * The method the request was made with. Where the framework does not tell
   * it, the request is read as a page's — its writes carry the session only
   * for what a browser marks as the application's own.
   */
  readonly method?: string | undefined;
  /**
   * The application's origin as the user addressed it — scheme, host and
   * port — which tells a page of its own from another site's, and whether a
   * cookie can be secure. Unknown, neither can be told.
   */
  readonly origin?: string | undefined;
  /** The request's headers */
  readonly headers: HeaderReader;
  /** The user's address, as the framework vouches for it */
  readonly clientAddress?: string | undefined;
  /**
   * Hand a cookie to the browser with the response being prepared. Returns
   * `true`, or why that response can take none — a page Next.js streams, a
   * response already sent. Absent, no response can.
   */
  readonly setCookie?: ((cookie: RelayedCookie) => true | string) | undefined;
  /**
   * What every call made for the request has to give `fetch` on this
   * framework — Next.js 14 caches a server's `fetch` unless told not to.
   */
  readonly fetchInit?: Readonly<RequestInit> | undefined;
}

/**
 * Finds the request being served, for a framework or a runtime. It is asked
 * synchronously when a call starts — some frameworks know the request only
 * until the code that makes the call first waits — and may answer with a
 * promise. It answers `undefined` when no request is being served.
 */
export type RequestContextProvider = () =>
  | IncomingRequest
  | Promise<IncomingRequest | undefined>
  | undefined;
