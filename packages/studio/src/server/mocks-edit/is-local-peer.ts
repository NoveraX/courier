import { isIP, SocketAddress } from "node:net";
import type { NetworkInterfaceInfo } from "node:os";
import { networkInterfaces } from "node:os";

import { createLogger } from "@noverax/courier";

const log = createLogger("Studio");

const MAPPED_IPV4_PREFIX = "::ffff:";

/**
 * One spelling per address: IPv4 dotted, IPv6 lower-case and compressed
 * without its zone, and an IPv4-mapped IPv6 address as the IPv4 it carries,
 * since a dual-stack socket reports an IPv4 peer in that form.
 */
function canonicalAddress(text: string | undefined): string | null {
  if (text === undefined) return null;
  const zoneAt = text.indexOf("%");
  const bare = zoneAt === -1 ? text : text.slice(0, zoneAt);
  const family = isIP(bare);
  if (family === 4 && zoneAt === -1) return bare;
  if (family !== 6) return null;
  const address = new SocketAddress({ address: bare, family: "ipv6" }).address;
  const carried = address.slice(MAPPED_IPV4_PREFIX.length);
  return address.startsWith(MAPPED_IPV4_PREFIX) && isIP(carried) === 4 ? carried : address;
}

function isLoopback(address: string): boolean {
  return address === "::1" || (isIP(address) === 4 && address.startsWith("127."));
}

/**
 * A link-local address is unique only on its own link, and machines reuse
 * them — every Mac has fe80::1 on its loopback — so a peer at one of this
 * machine's link-local addresses may still be another machine.
 */
function isLinkLocal(address: string): boolean {
  if (isIP(address) === 4) return address.startsWith("169.254.");
  const firstGroup = Number.parseInt(address.slice(0, address.indexOf(":")), 16);
  return (firstGroup & 0xffc0) === 0xfe80;
}

/**
 * Some sandboxes and containers refuse to list interfaces. Studio then
 * counts only a loopback peer as this machine: it refuses an edit it might
 * have made rather than make one for a peer it cannot place.
 */
function readInterfaces(): NodeJS.Dict<NetworkInterfaceInfo[]> {
  try {
    return networkInterfaces();
  } catch (error) {
    log.warn("Studio could not list this machine's network addresses", error);
    return {};
  }
}

function hasOwnAddress(interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>, address: string): boolean {
  for (const infos of Object.values(interfaces)) {
    for (const info of infos ?? []) {
      if (canonicalAddress(info.address) === address) return true;
    }
  }
  return false;
}

/**
 * Whether a request came from this machine: a loopback address, or one of
 * this machine's own addresses, which is where a request this machine sends
 * to its own LAN address arrives from.
 *
 * The interfaces are read on every call that needs them, because addresses
 * change while Studio runs — a laptop joins another network, a VPN comes up.
 * A loopback peer needs none.
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
  return !isLinkLocal(peer) && hasOwnAddress(interfaces ?? readInterfaces(), peer);
}
