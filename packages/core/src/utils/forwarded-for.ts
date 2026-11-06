import { type AddressTrust, deploymentTrust } from "../adapter/address-trust";
import { peerAddressOf } from "../adapter/peer-address";
import { parseAddress, plainAddress } from "./ip-address";
import { isLocalAddress } from "./local-address";

/* The hops carried on, the nearest kept: no application stands behind more proxies, and what a
   user writes stands left of theirs. Eight of the longest, with `unknown` before them and the
   peer after, fit the 512 characters a header of addresses is read to. */
const MAX_HOPS = 8;
/* The longest hop a proxy writes: an IPv6 address ending in IPv4, in brackets, with a port. */
const MAX_HOP_LENGTH = 53;
/* An address's characters, and those of the brackets, port or zone a proxy may write with it. */
const HOP = /^[\w.:%[\]-]+$/;
/* What stands for the hops left out: RFC 7239's word for a node no one can name, and no address. */
const UNKNOWN = "unknown";

/**
 * The `X-Forwarded-For` a call made on behalf of a request carries upstream.
 *
 * Each proxy appends the address it saw, and so does this one. A peer on
 * loopback, a private network or a proxy `COURIER_TRUSTED_PROXIES` names is
 * a proxy in front of the application, so the chain it recorded is kept and
 * its own address appended; an upstream reads the user's address from it as
 * it reads any proxied request's. A peer on a public address is the caller
 * itself, and is the whole chain: what it claims about addresses before it
 * is its own word. Where the runtime does not report the connection —
 * Next.js, an edge function — the chain the framework or the platform in
 * front recorded is passed on.
 *
 * The chain is kept from the right, as the proxies wrote it, since whatever
 * a user writes stands left of their hops: up to the first hop that is no
 * address, and the nearest eight at most. What is left out goes on as
 * `unknown`, which no reader takes for an address, so a chain the user made
 * too long, or wrote a character no address has into, still carries the
 * hops the proxies appended.
 *
 * @param request - The request the upstream call is made for
 * @returns The chain, or `undefined` when nothing recorded an address
 *
 * @example
 * ```ts
 * forwardedFor(request); // → "198.51.100.4, 10.0.0.2" behind a proxy on 10.0.0.2
 * ```
 */
export function forwardedFor(request: Request): string | undefined {
  return forwardedChain(peerAddressOf(request), request.headers.get("x-forwarded-for"));
}

/**
 * The same chain, from the parts a server that speaks in parts has: the
 * connection's address, or the one the framework vouches for, and the
 * `X-Forwarded-For` the request carried.
 *
 * @param peer - The connection's address, when the runtime reports it
 * @param chain - The request's `X-Forwarded-For`, when it carried one
 * @param trust - The proxies beyond the deployment's own network; the environment's by default
 * @returns The chain, or `undefined` when nothing recorded an address
 *
 * @example
 * ```ts
 * forwardedChain("10.0.0.2", "198.51.100.4"); // → "198.51.100.4, 10.0.0.2"
 * forwardedChain("203.0.113.9", "1.2.3.4"); // → "203.0.113.9"
 * forwardedChain(undefined, "198.51.100.4, 203.0.113.7"); // → "198.51.100.4, 203.0.113.7"
 * forwardedChain("10.0.0.2", "a guess, 198.51.100.4"); // → "unknown, 198.51.100.4, 10.0.0.2"
 * ```
 */
export function forwardedChain(
  peer: string | undefined,
  chain: string | null | undefined,
  trust: AddressTrust = deploymentTrust(),
): string | undefined {
  const hops = carriedHops(chain ?? "");
  if (!peer) return hops.length > 0 ? hops.join(", ") : undefined;
  const address = peer.replace(/^::ffff:(?=\d{1,3}(?:\.\d{1,3}){3}$)/i, "");
  if (!isLocalAddress(address) && !trust.has(address)) return address;
  return [...hops, address].join(", ");
}

/* The chain's hops from the right, each as written, up to the first that is no address or past
   the nearest `MAX_HOPS`; what is left out of it stands first as `unknown`. */
function carriedHops(chain: string): string[] {
  const hops: string[] = [];
  let end = chain.length;
  while (end > 0) {
    const start = chain.lastIndexOf(",", end - 1) + 1;
    const hop = chain.slice(start, end).trim();
    end = start - 1;
    if (hop === "") continue;
    if (hops.length === MAX_HOPS || !isAddressHop(hop)) {
      hops.push(UNKNOWN);
      break;
    }
    hops.push(hop);
  }
  return hops.reverse();
}

function isAddressHop(hop: string): boolean {
  if (hop.length > MAX_HOP_LENGTH || !HOP.test(hop)) return false;
  return parseAddress(plainAddress(hop)) !== undefined;
}
