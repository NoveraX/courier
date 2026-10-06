import { isIPv6 } from "node:net";

import { specAddressKind } from "../spec-address-kind";

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
 * proxy in front of the demo — and only then the address that proxy
 * reported, the last entry of `X-Forwarded-For`. An entry a visitor forges
 * stands left of it, and a visitor that connects directly is counted by its
 * own address. An IPv6 address is counted by its /64 network, which one
 * subscriber is given whole.
 *
 * @param connection - The connection's own address, and what a proxy reported
 * @returns The address to count against
 * @example
 * ```ts
 * visitorAddress({ peer: "10.0.1.4", forwardedFor: "1.2.3.4, 203.0.113.7" }); // "203.0.113.7"
 * ```
 */
export function visitorAddress({ peer, forwardedFor }: VisitorConnection): string {
  if (peer !== undefined && !viaProxy(bare(peer))) return counted(peer);
  const reported = lastHop(forwardedFor);
  if (reported !== undefined) return counted(reported);
  return peer === undefined ? "unknown" : counted(peer);
}

function viaProxy(address: string): boolean {
  const kind = specAddressKind(address);
  return kind === "loopback" || kind === "private";
}

/* A proxy appends what it saw: the last entry, past any empty one a chain ends with. */
function lastHop(forwardedFor: string | readonly string[] | undefined): string | undefined {
  const chain = typeof forwardedFor === "string" ? forwardedFor : forwardedFor?.join(",");
  const hops = (chain ?? "").split(",").map((hop) => hop.trim());
  return hops.findLast((hop) => hop !== "");
}

/* An IPv4 address as itself, wherever IPv6 maps it; an IPv6 address by its /64 network. */
function counted(address: string): string {
  const plain = bare(address);
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(plain);
  if (mapped?.[1] !== undefined) return mapped[1];
  return isIPv6(plain) ? `${network64(plain)}::/64` : plain;
}

function bare(address: string): string {
  return address.replace(/^\[|\]$/g, "").split("%")[0] ?? address;
}

function network64(address: string): string {
  const [head = "", tail] = address.split("::");
  const left = head === "" ? [] : head.split(":");
  const right = tail === undefined || tail === "" ? [] : tail.split(":");
  const zeros = Array.from({ length: 8 - left.length - right.length }, () => "0");
  return [...left, ...zeros, ...right].slice(0, 4).join(":");
}
