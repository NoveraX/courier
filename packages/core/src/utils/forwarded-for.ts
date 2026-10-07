import { isLocalAddress, peerAddressOf } from "../adapter/peer-address";

/**
 * The `X-Forwarded-For` a call made on behalf of a request carries upstream.
 *
 * The address comes from the connection, never from what the caller wrote: a
 * page can set any forwarding header it likes, and copying them let it choose
 * the address an upstream's rate limits and allowlists believe. A peer on
 * loopback or a private network is taken to be a reverse proxy in front of
 * the application — the rule the WebSocket limits and the origin check apply
 * — so the chain it wrote is kept and its own address appended, as each hop
 * of a forwarding chain does. A peer on a public address is the caller
 * itself, and is the whole chain.
 *
 * @param request - The request the upstream call is made for
 * @returns The chain, or `undefined` when the runtime did not record the peer
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
 * socket's peer, and the `X-Forwarded-For` the request carried.
 *
 * @param peer - The socket's remote address, when known
 * @param chain - The request's `X-Forwarded-For`, when it carried one
 * @returns The chain, or `undefined` when the peer is not known
 *
 * @example
 * ```ts
 * forwardedChain("10.0.0.2", "198.51.100.4"); // → "198.51.100.4, 10.0.0.2"
 * forwardedChain("203.0.113.9", "1.2.3.4"); // → "203.0.113.9"
 * ```
 */
export function forwardedChain(
  peer: string | undefined,
  chain: string | null | undefined,
): string | undefined {
  if (!peer) return undefined;
  const address = peer.replace(/^::ffff:/i, "");
  if (!isLocalAddress(peer)) return address;
  const forwarded = chain?.trim();
  return forwarded ? `${forwarded}, ${address}` : address;
}
