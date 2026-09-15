import type { HandlerConfig } from "@noverax/courier";
import { createHandler, getAppOrigin, requireSources, setAppOrigin } from "@noverax/courier";
import { announceHosting } from "@noverax/courier/announce";
import type { NextRequest } from "next/server";

/**
 * Module-level first-request flag for `listenOrigin` auto-discovery.
 * Next.js route handlers stamp `appOrigin` from the first request URL's
 * origin when no config/env value is present. Config-supplied or
 * env-var values take precedence and are never overwritten.
 */
let firstRequestHandled = false;

function tryDiscoverAppOrigin(request: Request): void {
  if (firstRequestHandled) return;
  firstRequestHandled = true;
  if (getAppOrigin()) return;
  try {
    const url = new URL(request.url);
    if (url.origin && url.origin !== "null") setAppOrigin(url.origin);
  } catch {
    // Malformed URL in request — leave appOrigin unset.
  }
}

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
 * ```
 */
export function apiRoute(config?: HandlerConfig): {
  GET: (request: NextRequest) => Promise<Response>;
  POST: (request: NextRequest) => Promise<Response>;
} {
  const { handleGet, handlePost } = createHandler(config);
  announceHosting({
    transports: ["http"],
    sources: Object.values(requireSources()),
    framework: "next",
  });

  return {
    GET: (request: NextRequest) => {
      tryDiscoverAppOrigin(request);
      return handleGet(request);
    },
    POST: (request: NextRequest) => {
      tryDiscoverAppOrigin(request);
      return handlePost(request);
    },
  };
}
