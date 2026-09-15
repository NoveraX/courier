import type { HandlerConfig } from "@noverax/courier";
import { createHandler, getAppOrigin, requireSources, setAppOrigin } from "@noverax/courier";
import { announceHosting } from "@noverax/courier/announce";
import type { NextRequest } from "next/server";

/**
 * Module-level first-request flag for `listenOrigin` auto-discovery.
 * Next.js SSE route handlers stamp `appOrigin` from the first request
 * URL's origin when no config/env value is present. Config-supplied or
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
  announceHosting({
    transports: ["sse"],
    sources: Object.values(requireSources()),
    framework: "next",
  });

  return {
    GET: (request: NextRequest) => {
      tryDiscoverAppOrigin(request);
      return handleSSE(request);
    },
  };
}
