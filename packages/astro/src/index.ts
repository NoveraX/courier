import { createHandler, type HandlerConfig } from "@noverax/courier";

/**
 * Create an Astro API endpoint handler for the courier proxy.
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
 * // src/pages/api/request.ts
 * import { courierHandler } from "@noverax/courier-astro";
 *
 * const handler = courierHandler();
 * export const GET = handler;
 * export const POST = handler;
 * ```
 */
export function courierHandler(
  config?: HandlerConfig,
): (context: { request: Request }) => Promise<Response> {
  const { handle } = createHandler(config);
  return ({ request }: { request: Request }) => handle(request);
}
