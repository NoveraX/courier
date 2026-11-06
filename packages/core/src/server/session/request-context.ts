import type { RequestContextProvider } from "../../session/incoming-request";
import { provideServerCapabilities } from "../provide-server-capabilities";
import { addRequestContextProvider, preferRequestContextProvider } from "./request-providers";

/**
 * Tell calls how to find the request the application is serving, so that
 * the APIs that keep a `session`, or `forward` a request's headers, take
 * them from it. Framework adapters provide one; registering it once on the
 * server is enough, and registering the same one again changes nothing.
 * The provider registered last is asked first.
 *
 * A call made in universal code — a page rendered on the server — finds
 * the session through it too: registering lends the calls of the process
 * the server's session.
 *
 * @param provider - Finds the request being served, or answers `undefined`
 * @returns A function that removes the provider again
 * @example
 * ```ts
 * // instrumentation.ts
 * import { registerRequestContext } from "@noverax/courier/server";
 * import { nextRequestContext } from "@noverax/courier-next";
 *
 * export function register() {
 *   registerRequestContext(nextRequestContext);
 * }
 * ```
 */
export function registerRequestContext(provider: RequestContextProvider): () => void {
  provideServerCapabilities();
  return addRequestContextProvider(provider);
}

/**
 * Ask a provider before every other: the one that knows the request code
 * was explicitly given to serve, as `withIncomingRequest` gives it, which
 * a framework's provider registered after it must not hide.
 *
 * @param provider - Finds the request being served, or answers `undefined`
 * @example
 * ```ts
 * preferRequestContext(() => store.getStore());
 * ```
 */
export function preferRequestContext(provider: RequestContextProvider): void {
  provideServerCapabilities();
  preferRequestContextProvider(provider);
}
