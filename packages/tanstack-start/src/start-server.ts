/**
 * What the adapter takes of TanStack Start's server runtime: the request
 * it is serving, and the response it is preparing for it. Both
 * `@tanstack/react-start/server` and `@tanstack/solid-start/server` hand
 * them over — the server core of TanStack Start, re-exported — and an
 * entry of this package for each binds the app's own.
 */
export interface StartServer {
  /** The request being served; TanStack Start throws outside one */
  getRequest(): Request;
  /**
   * Add a header to the response being prepared. For `set-cookie` it takes
   * a whole `Set-Cookie` value, which TanStack Start merges with the
   * cookies the response sets already, one for each name, domain and path.
   */
  appendResponseHeader(name: "set-cookie", value: string): void;
}
