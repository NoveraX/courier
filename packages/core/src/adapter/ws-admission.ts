import type { ConfigurationError } from "../errors";
import { isHostServed } from "./host-policy";
import { isOriginAllowed } from "./origin-policy";
import { readAllowedHosts, readAllowedOrigins, reportUnreadSetting } from "./runtime-policy";
import type { SessionClose } from "./ws-close";
import { extractClientIP, type IPTracker } from "./ws-ip-tracker";
import type { WSHandlerConfig } from "./ws-types";

/** A socket let in, with the address it is counted against, or why it is not. */
export type SocketAdmission =
  | { readonly ip: string }
  | Extract<SessionClose, { kind: "host" | "origin" | "limit" | "misconfigured" }>;

/**
 * Decide whether to keep a socket the handler was handed: a host or an
 * origin the handler does not serve is refused, and so is an address
 * already holding as many connections as it may. The host and the origin
 * are checked here alone, for every adapter, against the settings as they
 * read now; while either cannot be read, every socket is refused, and the
 * log says why once.
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
  const hosts = readAllowedHosts(config.allowedHosts);
  const origins = readAllowedOrigins(config.allowedOrigins);
  if (!hosts.ok) return misconfigured(hosts.error);
  if (!origins.ok) return misconfigured(origins.error);
  if (!isHostServed(new URL(request.url).host, hosts.value)) return { kind: "host" };
  if (!isOriginAllowed(request, origins.value)) return { kind: "origin" };
  const ip = extractClientIP(request, config.clientIp);
  if (!ipTracker.acquire(ip)) return { kind: "limit" };
  return { ip };
}

function misconfigured(error: ConfigurationError): SocketAdmission {
  reportUnreadSetting(error);
  return { kind: "misconfigured" };
}
