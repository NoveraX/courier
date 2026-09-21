import { createHandler, type HandlerConfig } from "@noverax/courier";

/**
 * Create a Solid Start API route handler for the courier proxy.
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
 * // src/routes/api/request.ts
 * import { courierHandler } from "@noverax/courier-solid";
 *
 * const handler = courierHandler();
 * export const GET = handler;
 * export const POST = handler;
 * ```
 */
export function courierHandler(
  config?: HandlerConfig,
): (event: { request: Request }) => Promise<Response> {
  const { handle } = createHandler(config);
  return ({ request }: { request: Request }) => handle(request);
}
