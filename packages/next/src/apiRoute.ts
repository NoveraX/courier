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
export const apiRoute = (sources: Sources) => {
  const { handleGet, handlePost } = createHandler(sources);

  return {
    GET: (request: NextRequest) => handleGet(request),
    POST: (request: NextRequest) => handlePost(request),
  };
};
