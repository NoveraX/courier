import { answerPreflight, withCorsHeaders } from "./cors";
import { discardBody } from "./discard-body";
import type { HandlerConfig } from "./handler-config";
import { isHostAllowed } from "./host-policy";
import { errorResponse } from "./parse";
import { redeemStudioPass, takeStudioPass } from "./studio-pass-gate";

type Serve = (request: Request) => Promise<Response>;

/** What `browsersOnly` answers a request no browser sent with, under the code `BROWSERS_ONLY`. */
export const BROWSERS_ONLY_REFUSAL = "This proxy answers browsers only";

/**
 * Put in front of an entry point what every one of them does first.
 *
 * A request addressed to a host the app does not serve is answered 421
 * before anything else looks at it, a preflight is answered, and a listed
 * origin is given its permission to read the answer. Studio's pass is taken
 * off every request, and with `browsersOnly` a request no browser sent is
 * refused unless it carries a pass Studio's runtime in this process redeems
 * — a Playground call, which still meets every other check. Every entry
 * point is wrapped, because an adapter may mount any one of them on its own.
 *
 * @param serve - The entry point
 * @param config - The handler's hosts and origins
 * @returns The entry point, gated
 *
 * @example
 * ```ts
 * const handleGet = gateEntry(createGetHandler(execute, dt, config), config);
 * ```
 */
export function gateEntry(serve: Serve, config: HandlerConfig | undefined): Serve {
  const allowedOrigins = config?.allowedOrigins;
  return async (request) => {
    if (!isHostAllowed(request, config?.allowedHosts)) return refuseHost(request);
    if (request.method === "OPTIONS") return answerOptions(request, allowedOrigins);
    const pass = takeStudioPass(request);
    if (config?.browsersOnly && !sentByBrowser(request) && !redeemStudioPass(pass)) {
      return refuseNonBrowser(request);
    }
    return withCorsHeaders(request, await serve(request), allowedOrigins);
  };
}

/** A preflight is answered; any other OPTIONS request asks for nothing the proxy serves. */
function answerOptions(request: Request, allowedOrigins: string[] | undefined): Response {
  return answerPreflight(request, allowedOrigins) ?? errorResponse(405, "Method not allowed");
}

/* A browser says where a request comes from in one of these; a script that does not ask to pass for one says neither. */
function sentByBrowser(request: Request): boolean {
  return request.headers.has("sec-fetch-site") || request.headers.has("origin");
}

function refuseNonBrowser(request: Request): Response {
  discardBody(request);
  return errorResponse(403, BROWSERS_ONLY_REFUSAL, "BROWSERS_ONLY");
}

/** Refuse a request addressed to a host the app does not serve, naming the fix. */
function refuseHost(request: Request): Response {
  discardBody(request);
  const { host } = new URL(request.url);
  return errorResponse(
    421,
    `Host "${host}" is not served here. Add its name to allowedHosts if this application is reached by it.`,
    "HOST_NOT_ALLOWED",
  );
}
