import type { IncomingMessage } from "node:http";
import { getAppOrigin, setAppOrigin } from "@noverax/courier";
import { extractOriginFromNodeRequest } from "@noverax/courier/node";

/**
 * Module-level first-request flag for `listenOrigin` auto-discovery.
 * NestJS middlewares stamp `appOrigin` from the first request's `Host`
 * header when no config/env value is present. Config-supplied or
 * env-var values take precedence and are never overwritten.
 */
let firstRequestHandled = false;

export function tryDiscoverAppOrigin(req: IncomingMessage): void {
  if (firstRequestHandled) return;
  firstRequestHandled = true;
  if (getAppOrigin()) return;
  const origin = extractOriginFromNodeRequest(req);
  if (origin) setAppOrigin(origin);
}
