import { createHandler } from "@noverax/nexus";
import type { Sources } from "@noverax/nexus/define";

/**
 * Create a Remix resource route handler for the nexus proxy.
 *
 * @example
 * ```ts
 * // app/routes/api.request.ts
 * import { nexusHandler } from "@noverax/nexus-remix";
 * import { sources } from "~/api";
 *
 * const handler = nexusHandler(sources);
 * export const loader = handler;
 * export const action = handler;
 * ```
 */
export function nexusHandler(sources: Sources) {
  const { handle } = createHandler(sources);
  return ({ request }: { request: Request }) => handle(request);
}
