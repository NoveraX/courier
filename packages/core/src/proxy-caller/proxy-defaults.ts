import { assertCancelPrevious } from "../define/assert-cancel-previous";
import type { CourierRoutes } from "../define/routes";
import type { ProxyCallerDefaults, ProxyCallerOptions } from "./types";

/**
 * What a page's proxy client runs with: the options its page gives it, the
 * API's own say on cancelling and sharing reads — which its routes carry —
 * where those options say nothing, and the routes themselves, which tell
 * its transports which endpoint reads and which writes.
 *
 * @param routes - The routes of the API
 * @param options - The options the page gives its client
 * @returns The client's options, with what the routes say
 * @throws ConfigurationError `CANCEL_PREVIOUS_INVALID` when the client's `cancelPrevious`, or the API's in its routes, is neither `true` nor `false`
 * @example
 * ```ts
 * createProxyHTTPExecutor(apiRoutes.source, proxyDefaultsOf(apiRoutes, { proxyPath }));
 * ```
 */
export function proxyDefaultsOf(
  routes: CourierRoutes,
  options: ProxyCallerOptions = {},
): ProxyCallerDefaults {
  assertCancelPrevious(options.cancelPrevious, "A proxy client");
  assertCancelPrevious(
    routes.cancelPrevious,
    `The routes of "${routes.source}"`,
    "Write the routes module again with courier-cli routes.",
  );
  return {
    ...options,
    cancelPrevious: options.cancelPrevious ?? routes.cancelPrevious,
    coalesce: options.coalesce ?? routes.coalesce,
    routes,
  };
}
