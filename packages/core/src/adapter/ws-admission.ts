import type { WebSocketLike } from "../realtime/adapters";
import { isHostAllowed } from "./host-policy";
import { isOriginAllowed } from "./origin-policy";
import { extractClientIP, type IPTracker } from "./ws-ip-tracker";
import type { WSHandlerConfig } from "./ws-types";

/**
 * Admit a socket the handler was handed, or close it with why: a host or an
 * origin the handler does not serve (4421, 4403), or an address already
 * holding as many connections as it may (4429).
 *
 * @param ws - The upgraded socket
 * @param request - The upgrade request
 * @param config - The handler's options
 * @param ipTracker - The handler's per-address connection counts
 * @returns The address the connection is counted against, or `undefined` when it was closed
 *
 * @example
 * ```ts
 * const ip = admitSocket(ws, request, config, ipTracker);
 * if (ip === undefined) return;
 * ```
 */
export function admitSocket(
  ws: WebSocketLike,
  request: Request,
  config: WSHandlerConfig,
  ipTracker: IPTracker,
): string | undefined {
  if (!isHostAllowed(request, config.allowedHosts)) {
    ws.close(4421, "Host not allowed");
    return undefined;
  }
  if (!isOriginAllowed(request, config.allowedOrigins)) {
    ws.close(4403, "Origin not allowed");
    return undefined;
  }
  const ip = extractClientIP(request, config.clientIp);
  if (!ipTracker.acquire(ip)) {
    ws.close(4429, "Too many connections");
    return undefined;
  }
  return ip;
}
