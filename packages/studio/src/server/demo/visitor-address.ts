import { isIPv6 } from "node:net";

import { specAddressKind } from "../spec-address-kind";
import { NO_TRUSTED_PROXIES, plainAddress, type TrustedProxies } from "./trusted-proxies";

/** What the address a visitor is counted against is read from. */
export interface VisitorConnection {
  /** The connection's own address, as the socket has it. */
  peer: string | undefined;
  /** The `X-Forwarded-For` the request carried, when it carried one. */
  forwardedFor: string | readonly string[] | undefined;
}

/**
 * The address a public demo counts a visitor against: the connection's own,
 * unless it comes from this machine or a private network — the reverse
 * proxy in front of the demo — or from a trusted proxy, and only then the
 * address `X-Forwarded-For` reports. That is its last entry but those the
 * trusted proxies appended — a CDN or a DDoS filter in front of the proxy,
 * which itself appends the address it saw. An entry a visitor forges
 * stands left of it, and a visitor that connects directly is counted by its
 * own address. An IPv6 address is counted by its /64 network, which one
 * subscriber is given whole.
 *
 * @param connection - The connection's own address, and what a proxy reported
 * @param trusted - The proxies whose entries are passed over; none by default
 * @returns The address to count against
 * @example
 * ```ts
 * visitorAddress({ peer: "10.0.1.4", forwardedFor: "1.2.3.4, 203.0.113.7" }); // "203.0.113.7"
 * visitorAddress(
 *   { peer: "10.0.1.4", forwardedFor: "203.0.113.7, 198.51.100.9" },
 *   trustedProxies(["198.51.100.0/24"]),
 * ); // "203.0.113.7"
 * ```
 */
export function visitorAddress(
  { peer, forwardedFor }: VisitorConnection,
  trusted: TrustedProxies = NO_TRUSTED_PROXIES,
): string {
  if (peer !== undefined && !viaProxy(plainAddress(peer), trusted)) return counted(peer);
  const reported = lastUntrustedHop(forwardedFor, trusted);
  if (reported !== undefined) return counted(reported);
  return peer === undefined ? "unknown" : counted(peer);
}

function viaProxy(address: string, trusted: TrustedProxies): boolean {
  const kind = specAddressKind(address);
  return kind === "loopback" || kind === "private" || trusted.has(address);
}

/* A proxy appends what it saw: the last entry a trusted proxy did not append, past any empty one a chain ends with. */
function lastUntrustedHop(
  forwardedFor: string | readonly string[] | undefined,
  trusted: TrustedProxies,
): string | undefined {
  const chain = typeof forwardedFor === "string" ? forwardedFor : forwardedFor?.join(",");
  const hops = (chain ?? "")
    .split(",")
    .map((hop) => hop.trim())
    .filter((hop) => hop !== "");
  return hops.findLast((hop) => !trusted.has(hop)) ?? hops.at(-1);
}

/* An IPv4 address as itself, wherever IPv6 maps it; an IPv6 address by its /64 network. */
function counted(address: string): string {
  const plain = plainAddress(address);
  return isIPv6(plain) ? `${network64(plain)}::/64` : plain;
}

function network64(address: string): string {
  const [head = "", tail] = address.split("::");
  const left = head === "" ? [] : head.split(":");
  const right = tail === undefined || tail === "" ? [] : tail.split(":");
  const zeros = Array.from({ length: 8 - left.length - right.length }, () => "0");
  return [...left, ...zeros, ...right].slice(0, 4).join(":");
}
