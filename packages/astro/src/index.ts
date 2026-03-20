import { createHandler } from "@noverax/nexus";
import type { Sources } from "@noverax/nexus/define";

/**
 * Create an Astro API endpoint handler for the nexus proxy.
 *
 * @example
 * ```ts
 * // src/pages/api/request.ts
 * import { nexusHandler } from "@noverax/nexus-astro";
 * import { sources } from "../../api";
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
