import type { ConfigurationError } from "../errors";
import type { RefusalLog } from "../logger/refusal-log";
import type { StudioHooks } from "../studio/hooks";
import { answerPreflight, isPreflight, withCorsHeaders } from "./cors";
import { discardBody } from "./discard-body";
import type { HandlerConfig } from "./handler-config";
import { isHostServed } from "./host-policy";
import { isOriginAllowed, sentOrigin } from "./origin-policy";
import { errorResponse } from "./parse";
import { readAllowedHosts, readAllowedOrigins, reportUnreadSetting } from "./runtime-policy";
import { redeemStudioPass, takeStudioPass } from "./studio-pass-gate";

type Serve = (request: Request) => Promise<Response>;

/** What `browsersOnly` answers a request no browser sent with, under the code `BROWSERS_ONLY`. */
export const BROWSERS_ONLY_REFUSAL = "This proxy answers browsers only";

/**
 * What every entry point answers, under the code `SERVER_MISCONFIGURED`,
 * while a setting it decides with cannot be read. The caller is told
 * nothing of the setting; the server's log names it, once.
 */
export const MISCONFIGURED_REFUSAL = "This server is misconfigured; its log says why";

/**
 * Put in front of an entry point what every one of them does first.
 *
 * The handler's hosts and origins are read — the config's lists, its
 * functions' answers, or `COURIER_ALLOWED_HOSTS` and
 * `COURIER_ALLOWED_ORIGINS` — and while either cannot be read, every
 * request is answered 500, so a deployment's first health check finds the
 * mistake. A request addressed to a host the app does not serve is answered
 * 421 before anything else looks at it. A page on an origin the handler
 * does not serve is refused with 403, its preflight too — before the rate
 * limit counts it, so a page cannot spend its visitors' budget — and told
 * to Studio; a listed origin's preflight is answered. Studio's pass is
 * taken off every request, and with `browsersOnly` a request no browser
 * sent is refused unless it carries a pass Studio's runtime in this process
 * redeems — a Playground call, which still meets every other check. A
 * listed origin is given its permission to read the answer. Every entry
 * point is wrapped, because an adapter may mount any one of them on its own.
 *
 * Each refusal for a host, an origin or `browsersOnly` is a warning in
 * `refusals`: the setting that refused it, the status, and the host or
 * origin it was refused for — never a credential or the body. A setting
 * that cannot be read says so in a line of its own, once.
 *
 * @param serve - The entry point
 * @param config - The handler's hosts, origins and `browsersOnly`
 * @param dt - The Studio hooks, told of each page refused for its origin
 * @param refusals - The handler's log of refusals, one for all its entry
 * points, which prints each kind once an interval
 * @returns The entry point, gated
 *
 * @example
 * ```ts
 * const handleGet = gateEntry(createGetHandler(execute, dt), config, dt, createRefusalLog("Proxy"));
 * ```
 */
export function gateEntry(
  serve: Serve,
  config: HandlerConfig | undefined,
  dt: StudioHooks,
  refusals: RefusalLog,
): Serve {
  return async (request) => {
    const hosts = readAllowedHosts(config?.allowedHosts);
    const origins = readAllowedOrigins(config?.allowedOrigins);
    if (!hosts.ok) return refuseMisconfigured(request, hosts.error);
    if (!origins.ok) return refuseMisconfigured(request, origins.error);
    const { host } = new URL(request.url);
    if (!isHostServed(host, hosts.value)) return refuseHost(request, host, refusals);
    if (request.method === "OPTIONS") return answerOptions(request, origins.value, dt, refusals);
    if (!isOriginAllowed(request, origins.value)) return refuseOrigin(request, dt, refusals);
    const pass = takeStudioPass(request);
    if (config?.browsersOnly && !sentByBrowser(request) && !redeemStudioPass(pass)) {
      return refuseNonBrowser(request, refusals);
    }
    return withCorsHeaders(request, await serve(request), origins.value);
  };
}

/**
 * A preflight from a listed origin is answered, and one from any other
 * refused as that page's calls are; any other OPTIONS request asks for
 * nothing the proxy serves.
 */
function answerOptions(
  request: Request,
  allowedOrigins: readonly string[] | undefined,
  dt: StudioHooks,
  refusals: RefusalLog,
): Response {
  const answer = answerPreflight(request, allowedOrigins);
  if (answer !== undefined) return answer;
  if (isPreflight(request)) return refuseOrigin(request, dt, refusals);
  return errorResponse(405, "Method not allowed");
}

/* A browser says where a request comes from in one of these; a script that does not ask to pass for one says neither. */
function sentByBrowser(request: Request): boolean {
  return request.headers.has("sec-fetch-site") || request.headers.has("origin");
}

function refuseNonBrowser(request: Request, refusals: RefusalLog): Response {
  refusals.warn({ event: "request refused by browsersOnly", code: 403 });
  discardBody(request);
  return errorResponse(403, BROWSERS_ONLY_REFUSAL, "BROWSERS_ONLY");
}

function refuseMisconfigured(request: Request, error: ConfigurationError): Response {
  reportUnreadSetting(error);
  discardBody(request);
  return errorResponse(500, MISCONFIGURED_REFUSAL, "SERVER_MISCONFIGURED");
}

/* The page the browser says made the request is one the handler does not serve. */
function refuseOrigin(request: Request, dt: StudioHooks, refusals: RefusalLog): Response {
  const origin = request.headers.get("origin");
  refusals.warn({
    event: "request refused by allowedOrigins",
    code: 403,
    fields: { origin: shownOrigin(origin) },
  });
  dt.onProxyOriginReject?.({ origin: origin ?? "", timestamp: Date.now() });
  discardBody(request);
  return errorResponse(403, "Origin not allowed");
}

/**
 * The origin a refusal's line names: one as a browser writes it, or the
 * `null` a page with no origin of its own sends. Any other value no browser
 * sent, and what it says stays out of the log.
 */
function shownOrigin(origin: string | null): string | undefined {
  if (origin === null) return undefined;
  return origin === "null" || sentOrigin(origin) !== undefined ? origin : undefined;
}

/** Refuse a request addressed to a host the app does not serve, naming the fix. */
function refuseHost(request: Request, host: string, refusals: RefusalLog): Response {
  refusals.warn({ event: "request refused by allowedHosts", code: 421, fields: { host } });
  discardBody(request);
  return errorResponse(
    421,
    `Host "${host}" is not served here. Add its name to allowedHosts if this application is reached by it.`,
    "HOST_NOT_ALLOWED",
  );
}
