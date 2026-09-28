import type { HandlerConfig } from "@noverax/courier";
import { createHandler, discoverAppOrigin } from "@noverax/courier";
import { announceWhenRegistered } from "@noverax/courier/announce";
/* Next.js has no exports map, so under Node resolution a module reaches this
   file only by its full name; bundlers accept either. */
import type { NextRequest } from "next/server.js";

import { publicRequest } from "./public-request";

/**
 * Create Next.js App Router handlers for the courier proxy.
 *
 * Announces `transports: ["http"]` to Studio so the binding table knows the
 * Next.js runtime owns HTTP delivery for these sources. Next.js App Router
 * cannot host WS — `sseRoute()` is the sibling SSE entry point.
 *
 * Sources are read from the core global registry populated by
 * `attachRuntime()` — add it to your `instrumentation.ts` register hook.
 *
 * @example
 * ```ts
 * // instrumentation.ts
 * export async function register() {
 *   if (process.env.NEXT_RUNTIME === "nodejs") {
 *     const { attachRuntime } = await import("@noverax/courier-studio-core/runtime");
 *     await attachRuntime();
 *   }
 * }
 *
 * // app/api/request/route.ts
 * import { apiRoute } from "@noverax/courier-next";
 * export const { GET, POST } = apiRoute();
 *
 * // Pages on other origins call it too: export OPTIONS for their preflight
 * export const { GET, POST, OPTIONS } = apiRoute({ allowedOrigins: ["https://admin.example.com"] });
 * ```
 */
export function apiRoute(config?: HandlerConfig): {
  GET: (request: NextRequest) => Promise<Response>;
  POST: (request: NextRequest) => Promise<Response>;
  OPTIONS: (request: NextRequest) => Promise<Response>;
} {
  const { handle, handleGet, handlePost } = createHandler(config);

  /* Next evaluates this module during `next build`, before any `register()`
     hook has populated the registry, so the announcement waits for a real
     request rather than failing the build. */
  const announce = announceWhenRegistered({ transports: ["http"], framework: "next" });

  return {
    GET: (request: NextRequest) => {
      announce();
      discoverAppOrigin(new URL(request.url).origin);
      return handleGet(publicRequest(request));
    },
    POST: (request: NextRequest) => {
      announce();
      discoverAppOrigin(new URL(request.url).origin);
      return handlePost(publicRequest(request));
    },
    /* A preflight from a page `allowedOrigins` lists; any other is refused. */
    OPTIONS: (request: NextRequest) => handle(publicRequest(request)),
  };
}
