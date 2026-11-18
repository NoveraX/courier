import type { ConfigurationError } from "../errors";
import type { RefusalLog } from "../logger/refusal-log";
import type { StudioHooks } from "../studio/hooks";
import { answerInit } from "../utils/answer-init";
import { isPreflight, listedReader, preflightGrant, withReadGrant } from "./cors";
import { discardBody } from "./discard-body";
import { type EntryRequest, entryRequestOf } from "./entry-request";
import type { HandlerConfig } from "./handler-config";
import { unservedHost } from "./host-policy";
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

/** Why the gate refused a request: what it is answered, as the proxy's own refusal. */
export interface EntryRefusal {
  readonly status: number;
  readonly message: string;
  readonly code: string | undefined;
}

/** The gate's word on a request. */
export type EntryVerdict =
  /** Refused: answered so, its body to be taken off the connection unread */
  | { readonly refused: EntryRefusal }
  /** A CORS preflight from a listed origin: answered 204 with these headers */
  | { readonly preflight: Readonly<Record<string, string>> }
  /** Let through: a page on a listed origin, `reader`, is to be let read the answer */
  | { readonly admitted: true; readonly reader: string | undefined };

/**
 * What every entry point does first, for a request as any server read it.
 *
 * The handler's hosts and origins are read — the config's lists, its
 * functions' answers, or `COURIER_ALLOWED_HOSTS` and
 * `COURIER_ALLOWED_ORIGINS` — and while either cannot be read, every
 * request is refused with 500, so a deployment's first health check finds
 * the mistake. A request addressed to a host the app does not serve is
 * refused with 421 before anything else looks at it. A page on an origin
 * the handler does not serve is refused with 403, under the code
 * `ORIGIN_NOT_ALLOWED`, its preflight too — before the rate limit counts
 * it, so a page cannot spend its visitors' budget — and told to Studio; a
 * listed origin's preflight is answered. Studio's pass is taken off every
 * request, and with `browsersOnly` a request no browser sent is refused
 * unless it carries a pass Studio's runtime in this process redeems — a
 * Playground call, which still meets every other check. A request from a
 * listed origin is let through with that origin, which its answer lets
 * read it.
 *
 * Each refusal for a host, an origin or `browsersOnly` is a warning in
 * `refusals`: the setting that refused it, the status, and the host or
 * origin it was refused for — never a credential or the body. A setting
 * that cannot be read says so in a line of its own, once.
 *
 * @param request - The request, as its server read it
 * @param config - The handler's hosts, origins and `browsersOnly`
 * @param dt - The Studio hooks, told of each page refused for its origin
 * @param refusals - The handler's log of refusals, one for all its entry
 * points, which prints each kind once an interval
 * @returns The verdict
 *
 * @example
 * ```ts
 * const verdict = checkEntry(entryRequestOf(request), config, dt, refusals);
 * if ("refused" in verdict) return errorResponse(verdict.refused.status, verdict.refused.message);
 * ```
 */
export function checkEntry(
  request: EntryRequest,
  config: HandlerConfig | undefined,
  dt: StudioHooks,
  refusals: RefusalLog,
): EntryVerdict {
  const hosts = readAllowedHosts(config?.allowedHosts);
  const origins = readAllowedOrigins(config?.allowedOrigins);
  if (!hosts.ok) return refuseMisconfigured(hosts.error);
  if (!origins.ok) return refuseMisconfigured(origins.error);
  const host = unservedHost(request, hosts.value);
  if (host !== undefined) return refuseHost(host, refusals);
  if (request.method === "OPTIONS") return answerOptions(request, origins.value, dt, refusals);
  if (!isOriginAllowed(request, origins.value)) return refuseOrigin(request, dt, refusals);
  const pass = takeStudioPass(request);
  if (config?.browsersOnly && !sentByBrowser(request) && !redeemStudioPass(pass)) {
    return refuseNonBrowser(refusals);
  }
  return { admitted: true, reader: listedReader(request, origins.value) };
}

/**
 * Put `checkEntry` in front of a web entry point: a refusal is answered, its
 * body taken off the connection, a listed origin's preflight is answered,
 * and a listed origin is given its permission to read the answer. Every
 * entry point is wrapped, because an adapter may mount any one of them on
 * its own.
 *
 * @param serve - The entry point
 * @param config - The handler's hosts, origins and `browsersOnly`
 * @param dt - The Studio hooks, told of each page refused for its origin
 * @param refusals - The handler's log of refusals, one for all its entry points
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
    const verdict = checkEntry(entryRequestOf(request), config, dt, refusals);
    if ("refused" in verdict) {
      discardBody(request);
      const { status, message, code } = verdict.refused;
      return errorResponse(status, message, code);
    }
    if ("preflight" in verdict) return new Response(null, answerInit(204, verdict.preflight));
    const response = await serve(request);
    return verdict.reader === undefined ? response : withReadGrant(response, verdict.reader);
  };
}

/**
 * A preflight from a listed origin is answered, and one from any other
 * refused as that page's calls are; any other OPTIONS request asks for
 * nothing the proxy serves.
 */
function answerOptions(
  request: EntryRequest,
  allowedOrigins: readonly string[] | undefined,
  dt: StudioHooks,
  refusals: RefusalLog,
): EntryVerdict {
  const preflight = preflightGrant(request, allowedOrigins);
  if (preflight !== undefined) return { preflight };
  if (isPreflight(request)) return refuseOrigin(request, dt, refusals);
  return refused(405, "Method not allowed");
}

/* A browser says where a request comes from in one of these; a script that does not ask to pass for one says neither. */
function sentByBrowser(request: EntryRequest): boolean {
  return request.headers.has("sec-fetch-site") || request.headers.has("origin");
}

function refused(status: number, message: string, code?: string): EntryVerdict {
  return { refused: { status, message, code } };
}

function refuseNonBrowser(refusals: RefusalLog): EntryVerdict {
  refusals.warn({ event: "request refused by browsersOnly", code: 403 });
  return refused(403, BROWSERS_ONLY_REFUSAL, "BROWSERS_ONLY");
}

function refuseMisconfigured(error: ConfigurationError): EntryVerdict {
  reportUnreadSetting(error);
  return refused(500, MISCONFIGURED_REFUSAL, "SERVER_MISCONFIGURED");
}

/* The page the browser says made the request is one the handler does not serve. */
function refuseOrigin(request: EntryRequest, dt: StudioHooks, refusals: RefusalLog): EntryVerdict {
  const origin = request.headers.get("origin");
  refusals.warn({
    event: "request refused by allowedOrigins",
    code: 403,
    fields: { origin: shownOrigin(origin) },
  });
  dt.onProxyOriginReject?.({ origin: origin ?? "", timestamp: Date.now() });
  return refused(403, "Origin not allowed", "ORIGIN_NOT_ALLOWED");
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
function refuseHost(host: string, refusals: RefusalLog): EntryVerdict {
  refusals.warn({ event: "request refused by allowedHosts", code: 421, fields: { host } });
  return refused(
    421,
    `Host "${host}" is not served here. Add its name to allowedHosts if this application is reached by it.`,
    "HOST_NOT_ALLOWED",
  );
}
