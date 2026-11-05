import { isHostAllowed } from "./host-policy";
import { isOriginAllowed } from "./origin-policy";
import type { SessionClose } from "./ws-dialect";
import { extractClientIP, type IPTracker } from "./ws-ip-tracker";
import type { WSHandlerConfig } from "./ws-types";

/** A socket let in, with the address it is counted against, or why it is not. */
export type SocketAdmission =
  | { readonly ip: string }
  | Extract<SessionClose, { kind: "host" | "origin" | "limit" }>;

/**
 * Decide whether to keep a socket the handler was handed: a host or an
 * origin the handler does not serve is refused, and so is an address
 * already holding as many connections as it may. The host and the origin
 * are checked here alone, for every adapter.
 *
 * @param request - The upgrade request
 * @param config - The handler's options
 * @param ipTracker - The handler's per-address connection counts
 * @returns The address the connection is counted against, or why it is refused
 *
 * @example
 * ```ts
 * const admission = admitSocket(request, config, ipTracker);
 * if (!("ip" in admission)) session.close(admission);
 * ```
 */
export function admitSocket(
  request: Request,
  config: WSHandlerConfig,
  ipTracker: IPTracker,
): SocketAdmission {
  if (!isHostAllowed(request, config.allowedHosts)) return { kind: "host" };
  if (!isOriginAllowed(request, config.allowedOrigins)) return { kind: "origin" };
  const ip = extractClientIP(request, config.clientIp);
  if (!ipTracker.acquire(ip)) return { kind: "limit" };
  return { ip };
}
