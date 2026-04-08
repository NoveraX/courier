import type { HandlerConfig } from "@noverax/nexus";
import { createHandler } from "@noverax/nexus";
import type { Sources } from "@noverax/nexus/define";
import type { NextRequest } from "next/server";

/**
 * Create Next.js App Router handlers for the nexus proxy.
 *
 * @example
 * ```ts
 * // app/api/request/route.ts
 * import { apiRoute } from "@noverax/nexus-next";
 * export const { GET, POST } = apiRoute(sources);
 * ```
 */
export function apiRoute(
  sources: Sources,
  config?: HandlerConfig,
): {
  GET: (request: NextRequest) => Promise<Response>;
  POST: (request: NextRequest) => Promise<Response>;
} {
  const { handleGet, handlePost } = createHandler(sources, config);

  return {
    GET: (request: NextRequest) => handleGet(request),
    POST: (request: NextRequest) => handlePost(request),
  };
}
