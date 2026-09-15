import { createHandler } from "@noverax/nexus";

/**
 * Create a Remix resource route handler for the nexus proxy.
 *
 * Sources are read from the core global registry populated by
 * `attachRuntime()` — call `await attachRuntime()` in your server
 * bootstrap before the first request.
 *
 * @example
 * ```ts
 * // app/routes/api.request.ts
 * import { nexusHandler } from "@noverax/nexus-remix";
 *
 * const handler = nexusHandler();
 * export const loader = handler;
 * export const action = handler;
 * ```
 */
export function nexusHandler() {
  const { handle } = createHandler();
  return ({ request }: { request: Request }) => handle(request);
}
