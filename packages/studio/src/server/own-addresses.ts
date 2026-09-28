/**
 * This machine's own addresses: where a request it sends to itself comes
 * from, and where one it sends out ends up back on it.
 */

import { isIP, SocketAddress } from "node:net";
import type { NetworkInterfaceInfo } from "node:os";
import { networkInterfaces } from "node:os";

import { createLogger } from "@noverax/courier";

const log = createLogger("Studio");

const MAPPED_IPV4_PREFIX = "::ffff:";

/** This machine's network interfaces, as `os.networkInterfaces()` lists them. */
export type Interfaces = NodeJS.Dict<NetworkInterfaceInfo[]>;

/**
 * One spelling per address: IPv4 dotted, IPv6 lower-case and compressed
 * without its zone, and an IPv4-mapped IPv6 address as the IPv4 it carries,
 * since a dual-stack socket reports an IPv4 peer in that form.
 *
 * @param text - An address in any form Node reports, a zone included
 * @returns The address's one spelling, or `null` for text that is not one
 * @example
 * ```ts
 * canonicalAddress("::FFFF:127.0.0.1"); // "127.0.0.1"
 * ```
 */
export function canonicalAddress(text: string | undefined): string | null {
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

/**
 * This machine's interfaces, read now: addresses change while Studio runs —
 * a laptop joins another network, a VPN comes up. Some sandboxes and
 * containers refuse to list them; Studio then knows none.
 *
 * @returns The interfaces, or none when they cannot be listed
 * @example
 * ```ts
 * isOwnAddress(address, readInterfaces());
 * ```
 */
export function readInterfaces(): Interfaces {
  try {
    return networkInterfaces();
  } catch (error) {
    log.warn("Studio could not list this machine's network addresses", error);
    return {};
  }
}

/**
 * Whether an address belongs to one of this machine's interfaces. A
 * link-local address never does: it is unique only on its own link, and
 * machines reuse them — every Mac has fe80::1 on its loopback — so one of
 * this machine's may still be another machine's.
 *
 * @param address - An address in any form Node reports
 * @param interfaces - This machine's interfaces
 * @returns Whether the address is this machine's own
 * @example
 * ```ts
 * isOwnAddress("192.0.2.10", readInterfaces()); // true on the machine at 192.0.2.10
 * ```
 */
export function isOwnAddress(address: string | undefined, interfaces: Interfaces): boolean {
  const canonical = canonicalAddress(address);
  if (canonical === null || isLinkLocal(canonical)) return false;
  for (const infos of Object.values(interfaces)) {
    for (const info of infos ?? []) {
      if (canonicalAddress(info.address) === canonical) return true;
    }
  }
  return false;
}

function isLinkLocal(address: string): boolean {
  if (isIP(address) === 4) return address.startsWith("169.254.");
  const firstGroup = Number.parseInt(address.slice(0, address.indexOf(":")), 16);
  return (firstGroup & 0xffc0) === 0xfe80;
}
