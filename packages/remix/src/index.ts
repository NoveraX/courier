import { createHandler } from "@noverax/courier";

/**
 * Create a Remix resource route handler for the courier proxy.
 *
 * Sources are read from the core global registry populated by
 * `attachRuntime()` — call `await attachRuntime()` in your server
 * bootstrap before the first request.
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
export function courierHandler() {
  const { handle } = createHandler();
  return ({ request }: { request: Request }) => handle(request);
}
