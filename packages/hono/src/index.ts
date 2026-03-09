import { createHandler } from "@noverax/nexus";
import type { Sources } from "@noverax/nexus/define";
import type { Context } from "hono";

export type NexusHandlerOptions = {
  /** Custom origin validation. Return true to allow the request. Default: same-origin check. */
  validateOrigin?: (origin: string | null, request: Request) => boolean;
};

/**
 * Create a Hono handler for the nexus proxy.
 *
 * @example
 * ```ts
 * import { Hono } from "hono";
 * import { nexusHandler } from "@noverax/nexus-hono";
 *
 * const app = new Hono();
 * app.all("/api/request", nexusHandler(sources));
 * ```
 */
export function nexusHandler(sources: Sources, _options?: NexusHandlerOptions) {
  const { handle } = createHandler(sources);
  return (c: Context) => handle(c.req.raw);
}
