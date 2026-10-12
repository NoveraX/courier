import type { IncomingHttpHeaders } from "node:http";
import { isIP, isIPv6 } from "node:net";

import { specAddressKind } from "../spec-address-kind";
import { NO_TRUSTED_PROXIES, plainAddress, type TrustedProxies } from "./trusted-proxies";

/** What the address a visitor is counted against is read from. */
export interface VisitorConnection {
  /** The connection's own address, as the socket has it. */
  peer: string | undefined;
  /** The request's headers: `X-Forwarded-For`, and the address header trusted proxies set. */
  headers: IncomingHttpHeaders;
}

/**
 * The address a public demo counts a visitor against: the connection's own,
 * unless it comes from this machine or a private network — the reverse
 * proxy in front of the demo — or from a trusted proxy, and only then the
 * address the proxies report. When the request reached that reverse proxy
 * from a trusted proxy that names the visitor in a header of its own, such
 * as DDoS-Guard's `DDG-Connecting-IP`, that header is the answer: the
 * reverse proxy may have replaced `X-Forwarded-For` with the trusted
 * proxy's address. Otherwise it is `X-Forwarded-For`'s last entry but those
 * trusted proxies appended, as each proxy appends the address it saw; an
 * entry a visitor forges stands left of it. A visitor that connects
 * directly — past every proxy — is counted by its own address, whatever it
 * claims. An IPv6 address is counted by its /64 network, which one
 * subscriber is given whole.
 *
 * @param connection - The connection's own address, and the request's headers
 * @param trusted - The proxies whose entries are passed over; none by default
 * @returns The address to count against
 * @example
 * ```ts
 * visitorAddress({ peer: "10.0.1.4", headers: { "x-forwarded-for": "1.2.3.4, 203.0.113.7" } }); // "203.0.113.7"
 * visitorAddress(
 *   { peer: "10.0.1.4", headers: { "x-forwarded-for": "198.51.100.9", "ddg-connecting-ip": "203.0.113.7" } },
 *   trustedProxies(["198.51.100.0/24"], "DDG-Connecting-IP"),
 * ); // "203.0.113.7"
 * ```
 */
export function visitorAddress(
  { peer, headers }: VisitorConnection,
  trusted: TrustedProxies = NO_TRUSTED_PROXIES,
): string {
  const plainPeer = peer === undefined ? undefined : plainAddress(peer);
  if (plainPeer !== undefined && !viaProxy(plainPeer, trusted)) return counted(plainPeer);
  const hops = forwardedHops(headers["x-forwarded-for"]);
  const named = namedByTrustedProxy(plainPeer, hops, headers, trusted);
  if (named !== undefined) return counted(named);
  const reported = hops.findLast((hop) => !trusted.has(hop)) ?? hops.at(-1);
  if (reported !== undefined) return counted(reported);
  return plainPeer === undefined ? "unknown" : counted(plainPeer);
}

function viaProxy(address: string, trusted: TrustedProxies): boolean {
  const kind = specAddressKind(address);
  return kind === "loopback" || kind === "private" || trusted.has(address);
}

/* A proxy appends what it saw: every entry, past any empty one a chain ends with, a header sent twice joined. */
function forwardedHops(forwardedFor: string | readonly string[] | undefined): string[] {
  const chain = typeof forwardedFor === "string" ? forwardedFor : forwardedFor?.join(",");
  return (chain ?? "")
    .split(",")
    .map((hop) => hop.trim())
    .filter((hop) => hop !== "");
}

/* The address a trusted proxy names, read only when the request came from one: from the trusted
   proxy itself, or through the reverse proxy in front of Studio, whose own entry is the last. */
function namedByTrustedProxy(
  peer: string | undefined,
  hops: readonly string[],
  headers: IncomingHttpHeaders,
  trusted: TrustedProxies,
): string | undefined {
  if (trusted.addressHeader === undefined) return undefined;
  const from = peer !== undefined && trusted.has(peer) ? peer : hops.at(-1);
  if (from === undefined || !trusted.has(from)) return undefined;
  const value = headers[trusted.addressHeader];
  const named = (Array.isArray(value) ? value.join(",") : (value ?? "")).split(",").at(-1)?.trim();
  return named !== undefined && isIP(plainAddress(named)) !== 0 ? named : undefined;
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
