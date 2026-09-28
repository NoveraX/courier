import type { NetworkInterfaceInfo } from "node:os";

import { canonicalAddress, isOwnAddress, readInterfaces } from "../own-addresses";

function isLoopback(address: string): boolean {
  return address === "::1" || address.startsWith("127.");
}

/**
 * Whether a request came from this machine: a loopback address, or one of
 * this machine's own addresses, which is where a request this machine sends
 * to its own LAN address arrives from.
 *
 * The interfaces are read on every call that needs them, because addresses
 * change while Studio runs — a laptop joins another network, a VPN comes up.
 * A loopback peer needs none. Where the interfaces cannot be listed, only a
 * loopback peer counts: Studio refuses an edit it might have made rather
 * than make one for a peer it cannot place.
 *
 * @param remoteAddress - The socket's `remoteAddress`, in any form Node reports.
 * @param interfaces - This machine's interfaces; read afresh when omitted.
 * @returns `true` for a peer on this machine; `false` for any other peer,
 *   a link-local one, or none.
 * @example
 * isLocalPeer("::ffff:127.0.0.1"); // true
 * isLocalPeer("203.0.113.9"); // false
 */
export function isLocalPeer(
  remoteAddress: string | undefined,
  interfaces?: NodeJS.Dict<NetworkInterfaceInfo[]>,
): boolean {
  const peer = canonicalAddress(remoteAddress);
  if (peer === null) return false;
  if (isLoopback(peer)) return true;
  return isOwnAddress(peer, interfaces ?? readInterfaces());
}
