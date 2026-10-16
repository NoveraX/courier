import type { ConnectResult, HandlerConfig } from "@noverax/courier";
import { createHandler } from "@noverax/courier";
import { announceWhenRegistered } from "@noverax/courier/announce";
/* Next.js has no exports map, so under Node resolution a module reaches this
   file only by its full name; bundlers accept either. */
import type { NextRequest } from "next/server.js";

import { publicRequest } from "./public-request";

/**
 * Create Next.js App Router handler for SSE streaming endpoints.
 * Works in the Edge Runtime too — returns a `ReadableStream` response. The
 * Edge Runtime has its own source registry: register the sources there as
 * well, from `register()` in `instrumentation.ts`, which runs once in each
 * runtime.
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
 *
 * // Pages on other origins subscribe too: export OPTIONS for their preflight
 * export const { GET, OPTIONS } = sseRoute({ allowedOrigins: ["https://admin.example.com"] });
 * ```
 */
export function sseRoute<TConnect extends ConnectResult = ConnectResult>(
  config?: HandlerConfig<TConnect>,
): {
  GET: (request: NextRequest) => Promise<Response>;
  OPTIONS: (request: NextRequest) => Promise<Response>;
} {
  const { handle, handleSSE } = createHandler(config);

  /* Deferred for the same reason as `apiRoute`: this module is evaluated by
     `next build` before the registry exists. */
  const announce = announceWhenRegistered({ transports: ["sse"], framework: "next" });

  return {
    GET: (request: NextRequest) => {
      announce(new URL(request.url).origin, request.headers.get("host"));
      return handleSSE(publicRequest(request));
    },
    /* A preflight from a page `allowedOrigins` lists; any other is refused. */
    OPTIONS: (request: NextRequest) => handle(publicRequest(request)),
  };
}
