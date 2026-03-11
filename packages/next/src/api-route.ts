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
export function apiRoute(sources: Sources): {
  GET: (request: NextRequest) => Promise<Response>;
  POST: (request: NextRequest) => Promise<Response>;
} {
  const { handleGet, handlePost } = createHandler(sources);

  return {
    GET: (request: NextRequest) => handleGet(request),
    POST: (request: NextRequest) => handlePost(request),
  };
}
