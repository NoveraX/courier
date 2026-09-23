import type { HandlerConfig } from "@noverax/courier";
import { createHandler, discoverAppOrigin, requireSources } from "@noverax/courier";
import { announceHosting, deferAnnounce } from "@noverax/courier/announce";
import type { NextRequest } from "next/server";

/**
 * Create Next.js App Router handler for SSE streaming endpoints.
 * Works in Edge Runtime — returns a `ReadableStream` response.
 *
 * Announces `transports: ["sse"]` to Studio so the binding table knows the
 * Next.js runtime owns SSE delivery for these sources.
 *
 * Sources are read from the core global registry populated by
 * `attachRuntime()` — add it to your `instrumentation.ts` register hook.
 *
 * @example
 * ```ts
 * // app/api/sse/route.ts
 * import { sseRoute } from "@noverax/courier-next";
 * export const { GET } = sseRoute();
 * ```
 */
export function sseRoute(config?: HandlerConfig): {
  GET: (request: NextRequest) => Promise<Response>;
} {
  const { handleSSE } = createHandler(config);

  /* Deferred for the same reason as `apiRoute`: this module is evaluated by
     `next build` before the registry exists. */
  const announce = deferAnnounce(() =>
    announceHosting({
      transports: ["sse"],
      sources: Object.values(requireSources()),
      framework: "next",
    }),
  );

  return {
    GET: (request: NextRequest) => {
      announce();
      discoverAppOrigin(new URL(request.url).origin);
      return handleSSE(request);
    },
  };
}
