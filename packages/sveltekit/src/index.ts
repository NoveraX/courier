import { createHandler } from "@noverax/nexus";
import type { Sources } from "@noverax/nexus/define";

/**
 * Create a SvelteKit request handler for the nexus proxy.
 *
 * @example
 * ```ts
 * // src/routes/api/request/+server.ts
 * import { nexusHandler } from "@noverax/nexus-sveltekit";
 * import { sources } from "$lib/api";
 *
 * const handler = nexusHandler(sources);
 * export const GET = handler;
 * export const POST = handler;
 * ```
 */
export function nexusHandler(sources: Sources) {
  const { handle } = createHandler(sources);
  return ({ request }: { request: Request }) => handle(request);
}
