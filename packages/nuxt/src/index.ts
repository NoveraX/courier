import { createHandler } from "@noverax/nexus";
import type { Sources } from "@noverax/nexus/define";
import { fromWebHandler } from "h3";

/**
 * Create a Nuxt/h3/Nitro event handler for the nexus proxy.
 *
 * @example
 * ```ts
 * // server/api/request.ts (Nuxt 3+)
 * import { nexusHandler } from "@noverax/nexus-nuxt";
 * export default nexusHandler(sources);
 * ```
 *
 * @example
 * ```ts
 * // Using with h3 directly
 * import { createApp } from "h3";
 * import { nexusHandler } from "@noverax/nexus-nuxt";
 *
 * const app = createApp();
 * app.use("/api/request", nexusHandler(sources));
 * ```
 */
export function nexusHandler(sources: Sources) {
  const { handle } = createHandler(sources);
  return fromWebHandler((request) => handle(request));
}
