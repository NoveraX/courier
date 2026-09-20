import { createHandler } from "@noverax/courier";

/**
 * Create an Astro API endpoint handler for the courier proxy.
 *
 * Sources are read from the core global registry populated by
 * `attachRuntime()` — call `await attachRuntime()` in your server
 * bootstrap before the first request.
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
export function courierHandler(): (context: { request: Request }) => Promise<Response> {
  const { handle } = createHandler();
  return ({ request }: { request: Request }) => handle(request);
}
