import { createHandler, type HandlerConfig } from "@noverax/courier";

/**
 * Create a Remix resource route handler for the courier proxy.
 *
 * Sources are read from the core global registry populated by
 * `attachRuntime()` — call `await attachRuntime()` in your server
 * bootstrap before the first request.
 *
 * @param config - Handler options, including the `allowedOrigins` the SSE
 *   transport checks against. Omit it to accept the defaults.
 *
 * @example
 * ```ts
 * // app/routes/api.request.ts
 * import { courierHandler } from "@noverax/courier-remix";
 *
 * const handler = courierHandler();
 * export const loader = handler;
 * export const action = handler;
 * ```
 */
export function courierHandler(
  config?: HandlerConfig,
): (args: { request: Request }) => Promise<Response> {
  const { handle } = createHandler(config);
  return ({ request }: { request: Request }) => handle(request);
}
