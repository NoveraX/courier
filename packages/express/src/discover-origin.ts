import type { IncomingMessage } from "node:http";
import { getAppOrigin, setAppOrigin } from "@noverax/courier";
import { extractOriginFromNodeRequest } from "@noverax/courier/node";

/**
 * Module-level first-request flag for `listenOrigin` auto-discovery.
 *
 * The first incoming HTTP request to any Express handler created by this
 * module stamps `appOrigin` with the origin extracted from its `Host`
 * header — but only when `appOrigin` is still unset. Config-supplied or
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
