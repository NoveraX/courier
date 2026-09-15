import { createHandler } from "@noverax/nexus";

/**
 * Create an Astro API endpoint handler for the nexus proxy.
 *
 * Sources are read from the core global registry populated by
 * `attachRuntime()` — call `await attachRuntime()` in your server
 * bootstrap before the first request.
 *
 * @example
 * ```ts
 * // src/pages/api/request.ts
 * import { nexusHandler } from "@noverax/nexus-astro";
 *
 * const handler = nexusHandler();
 * export const GET = handler;
 * export const POST = handler;
 * ```
 */
export function nexusHandler() {
  const { handle } = createHandler();
  return ({ request }: { request: Request }) => handle(request);
}
