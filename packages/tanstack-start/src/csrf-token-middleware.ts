import type { AnyDefinedApi } from "@noverax/courier/define";
import {
  ensureCsrfToken,
  type RequestContextProvider,
  registerRequestContext,
} from "@noverax/courier/server";

import type { RequestMiddlewareServer } from "./request-context-middleware";

/**
 * `csrfTokenMiddleware` for one entry: the server part of a request
 * middleware that asks each API for the user's double-submit token where
 * the request does not carry it, before the rest of the request is served.
 * It registers the entry's provider of the request being served as it is
 * made, which the token's request is sent with.
 *
 * @param provider - Finds the request TanStack Start is serving
 * @returns `csrfTokenMiddleware`
 * @example
 * ```ts
 * export const csrfTokenMiddleware = csrfTokenMiddlewareOver(tanstackStartRequestContext);
 * ```
 */
export function csrfTokenMiddlewareOver(
  provider: RequestContextProvider,
): (...apis: AnyDefinedApi[]) => RequestMiddlewareServer {
  return (...apis) => {
    registerRequestContext(provider);
    return async (context) => {
      for (const api of apis) await ensureCsrfToken(api);
      return context.next();
    };
  };
}
