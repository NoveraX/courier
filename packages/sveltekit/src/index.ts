import { createHandler } from "@noverax/nexus";

/**
 * Create a SvelteKit request handler for the nexus proxy.
 *
 * Sources are read from the core global registry populated by
 * `attachRuntime()` — call `await attachRuntime()` in your server
 * bootstrap before the first request.
 *
 * @example
 * ```ts
 * // src/routes/api/request/+server.ts
 * import { nexusHandler } from "@noverax/nexus-sveltekit";
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
