import { type AddressTrust, deploymentTrust } from "../adapter/address-trust";
import { isLocalAddress, peerAddressOf } from "../adapter/peer-address";

/* Addresses as a forwarding header carries them: printable, and of a size a header holds. */
const CHAIN = /^[ -~]{1,512}$/;

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
 * front recorded is passed on as it came.
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
 * ```
 */
export function forwardedChain(
  peer: string | undefined,
  chain: string | null | undefined,
  trust: AddressTrust = deploymentTrust(),
): string | undefined {
  const recorded = chain?.trim().replace(/,\s*$/, "");
  const kept = recorded && CHAIN.test(recorded) ? recorded : undefined;
  if (!peer) return kept;
  const address = peer.replace(/^::ffff:(?=\d{1,3}(?:\.\d{1,3}){3}$)/i, "");
  if (!isLocalAddress(address) && !trust.has(address)) return address;
  return kept ? `${kept}, ${address}` : address;
}
