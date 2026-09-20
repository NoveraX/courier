import { createHandler } from "@noverax/courier";

/**
 * Create a Solid Start API route handler for the courier proxy.
 *
 * Sources are read from the core global registry populated by
 * `attachRuntime()` — call `await attachRuntime()` in your server
 * bootstrap before the first request.
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
export function courierHandler(): (event: { request: Request }) => Promise<Response> {
  const { handle } = createHandler();
  return ({ request }: { request: Request }) => handle(request);
}
