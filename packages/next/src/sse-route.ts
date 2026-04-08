import type { HandlerConfig } from "@noverax/nexus";
import { createHandler } from "@noverax/nexus";
import type { Sources } from "@noverax/nexus/define";
import type { NextRequest } from "next/server";

/**
 * Create Next.js App Router handler for SSE streaming endpoints.
 * Works in Edge Runtime — returns a `ReadableStream` response.
 *
 * @example
 * ```ts
 * // app/api/sse/route.ts
 * import { sseRoute } from "@noverax/nexus-next";
 * export const { GET } = sseRoute(sources);
 * ```
 */
export function sseRoute(
  sources: Sources,
  config?: HandlerConfig,
): {
  GET: (request: NextRequest) => Promise<Response>;
} {
  const { handleSSE } = createHandler(sources, config);

  return {
    GET: (request: NextRequest) => handleSSE(request),
  };
}
