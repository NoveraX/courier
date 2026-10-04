import type { IncomingMessage, ServerResponse } from "node:http";

import { isOriginAccepted } from "@noverax/courier/internal";
import { extractOriginFromNodeRequest } from "@noverax/courier/node";

import { sendError } from "./send-error";

/**
 * Answer a preflight, refuse a foreign origin, and — on a request that is
 * allowed to proceed — say so on the response itself.
 *
 * The response carries `Access-Control-Allow-Origin` as the preflight does,
 * so a configured cross-origin caller that passed the check can read the
 * answer. The matcher is the core's, so `*.example.com` means here what it
 * means everywhere else.
 *
 * @param req - The incoming request
 * @param res - The response being prepared
 * @param allowedOrigins - Origins to accept besides the server's own
 * @returns Whether the request was fully handled here
 *
 * @example
 * ```ts
 * if (handleCors(req, res, ["https://app.example.com"])) return;
 * ```
 */
export function handleCors(
  req: IncomingMessage,
  res: ServerResponse,
  allowedOrigins?: string[],
): boolean {
  const origin = req.headers.origin;
  /* The origin the client addressed: behind a proxy that terminates TLS the
     socket is plain HTTP, and the core handler and the WebSocket check
     already take the proxy's forwarded scheme and host into account. */
  const self = extractOriginFromNodeRequest(req) ?? null;
  /* The browser's own verdict decides where it is present, as it does in the
     core handler: a same-origin page behind a proxy this server does not
     trust with X-Forwarded-* is still its own, and a cross-site request
     without an Origin is still cross-site. */
  const allowed = isOriginAccepted(origin, self, allowedOrigins, req.headers["sec-fetch-site"]);

  if (req.method === "OPTIONS" && origin) {
    /* Refused as the adapters refuse it, so a client reads one answer. */
    if (!allowed) {
      sendError(res, 403, "Origin not allowed");
      return true;
    }
    const requested = requestedHeaders(req);
    res.writeHead(204, {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      ...(requested ? { "Access-Control-Allow-Headers": requested } : {}),
      "Access-Control-Max-Age": "86400",
      Vary: "Origin, Access-Control-Request-Headers",
    });
    res.end();
    return true;
  }

  if (!allowed) {
    sendError(res, 403, "Origin not allowed");
    return true;
  }

  if (origin) {
    /* The browser needs this on the answer, not only on the preflight. */
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }

  return false;
}

/**
 * Let a cross-origin page read the headers on the answer it is granted.
 *
 * A browser shows a cross-origin script only the CORS-safelisted response
 * headers unless the answer names more, so `Retry-After`, `ETag` and
 * `Content-Disposition`, which the proxy passes back on purpose, reached
 * the same-origin page and never a configured cross-origin one. The proxy
 * has already chosen which headers the browser may have, so every one on
 * its answer is named; `Set-Cookie` is left out, as no page may read it.
 *
 * @param res - The response being prepared, after `handleCors`
 * @param headers - The headers of the answer about to be sent
 *
 * @example
 * ```ts
 * exposeHeaders(res, webResponse.headers);
 * await sendWebResponse(webResponse, res);
 * ```
 */
export function exposeHeaders(res: ServerResponse, headers: Headers): void {
  if (!res.hasHeader("Access-Control-Allow-Origin")) return;
  const names = [...headers.keys()].filter((name) => name !== "set-cookie");
  if (names.length > 0) res.setHeader("Access-Control-Expose-Headers", names.join(", "));
}

/** An RFC 9110 token: what a header name may be made of. */
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/**
 * The header names a preflight asks to send, when it may send them.
 *
 * A fixed list refused every header the proxy is built to carry — a source's
 * `allowedHeaders`, an endpoint's `.headers()`, even `x-request-id` — so a
 * page on a configured origin could not make those calls at all. Which of the
 * page's headers reach the upstream is the proxy's own allowlist, decided per
 * source and endpoint, and a preflight names no endpoint; the origin has been
 * accepted by now. So the preflight grants what the page asks for, and the
 * proxy keeps filtering what travels on.
 */
function requestedHeaders(req: IncomingMessage): string | undefined {
  const names = (req.headers["access-control-request-headers"] ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => HEADER_NAME.test(name));
  return names.length > 0 ? names.join(", ") : undefined;
}
