import { isLocalPeer } from "./mocks-edit/is-local-peer";
import type { RouteRequest } from "./route-types";

/**
 * Whether a request came from a browser page on the machine Studio runs on:
 * a page sends an Origin, and the peer is this machine. Studio changes a
 * file it then executes only for such a request.
 *
 * @param req - The request
 * @returns `true` for a page on this machine
 * @example
 * ```ts
 * if (!isLocalBrowser(req)) res.status(403).json({ error: "…" });
 * ```
 */
export function isLocalBrowser(req: RouteRequest): boolean {
  return Boolean(req.get?.("origin")) && isLocalPeer(req.socket?.remoteAddress);
}
